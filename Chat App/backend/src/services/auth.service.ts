import bcryptjs from "bcryptjs";
import { prisma } from "../lib/prisma";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  getRefreshTokenExpiry,
} from "../utils/token.utils";
import { AppError } from "../middlewares/error.middleware";

export interface RegisterDto {
  name: string;
  username: string;
  email: string;
  password: string;
  profileImage?: string | null;
}

export interface LoginDto {
  identifier: string;
  password: string;
}

export interface AuthResponse {
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    profileImage: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const normalizedUsername = dto.username.toLowerCase().trim();

    // Check duplicate email
    const existingEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingEmail) {
      const error: AppError = new Error("An account with this email already exists");
      error.statusCode = 409;
      error.code = "DUPLICATE_EMAIL";
      throw error;
    }

    // Check duplicate username
    const existingUsername = await prisma.user.findUnique({
      where: { username: normalizedUsername },
    });
    if (existingUsername) {
      const error: AppError = new Error("This username is already taken");
      error.statusCode = 409;
      error.code = "DUPLICATE_USERNAME";
      throw error;
    }

    // Hash password with bcrypt (12 rounds)
    const passwordHash = await bcryptjs.hash(dto.password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        name: dto.name.trim(),
        username: normalizedUsername,
        email: normalizedEmail,
        passwordHash,
        profileImage: dto.profileImage?.trim() || null,
      },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = getRefreshTokenExpiry();

    // Store refresh token in MySQL
    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      user,
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Login user with email or username
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const identifier = dto.identifier.toLowerCase().trim();

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: identifier }, { username: identifier }],
      },
    });

    if (!user) {
      const error: AppError = new Error("Invalid credentials");
      error.statusCode = 401;
      error.code = "INVALID_CREDENTIALS";
      throw error;
    }

    // Validate password
    const isPasswordValid = await bcryptjs.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      const error: AppError = new Error("Invalid credentials");
      error.statusCode = 401;
      error.code = "INVALID_CREDENTIALS";
      throw error;
    }

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    const rawRefreshToken = generateRefreshToken();
    const tokenHash = hashToken(rawRefreshToken);
    const expiresAt = getRefreshTokenExpiry();

    await prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt,
      },
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        profileImage: user.profileImage,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      accessToken,
      refreshToken: rawRefreshToken,
    };
  }

  /**
   * Refresh access token and rotate refresh token
   */
  async refresh(rawRefreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashToken(rawRefreshToken);

    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      const error: AppError = new Error("Invalid refresh token");
      error.statusCode = 401;
      error.code = "INVALID_REFRESH_TOKEN";
      throw error;
    }

    // Security: Token Reuse Detection
    // If an already-revoked refresh token is presented, assume token theft/replay attack
    // Revoke all active refresh tokens for this user immediately to protect the account
    if (storedToken.revokedAt) {
      console.warn(
        `[SECURITY WARNING] Refresh token reuse detected for userId=${storedToken.userId}! Revoking all active tokens.`
      );
      await prisma.refreshToken.updateMany({
        where: {
          userId: storedToken.userId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      const error: AppError = new Error(
        "Security violation: Token reuse detected. All active sessions have been revoked. Please log in again."
      );
      error.statusCode = 401;
      error.code = "TOKEN_REUSE_DETECTED";
      throw error;
    }

    if (storedToken.expiresAt < new Date()) {
      const error: AppError = new Error("Refresh token has expired");
      error.statusCode = 401;
      error.code = "TOKEN_EXPIRED";
      throw error;
    }

    const user = storedToken.user;

    // Generate new tokens
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });

    const newRawRefreshToken = generateRefreshToken();
    const newTokenHash = hashToken(newRawRefreshToken);
    const newExpiresAt = getRefreshTokenExpiry();

    // Atomic token rotation
    await prisma.$transaction([
      // Revoke the old refresh token
      prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      }),
      // Issue new refresh token
      prisma.refreshToken.create({
        data: {
          tokenHash: newTokenHash,
          userId: user.id,
          expiresAt: newExpiresAt,
        },
      }),
    ]);

    return {
      accessToken: newAccessToken,
      refreshToken: newRawRefreshToken,
    };
  }

  /**
   * Logout user by revoking refresh token
   */
  async logout(rawRefreshToken?: string): Promise<void> {
    if (!rawRefreshToken) return;

    const tokenHash = hashToken(rawRefreshToken);
    await prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Get current authenticated user details
   */
  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        profileImage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      const error: AppError = new Error("User not found");
      error.statusCode = 404;
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    return user;
  }
}

export const authService = new AuthService();
