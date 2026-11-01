import crypto from "crypto";
import jwt from "jsonwebtoken";
import { ENV } from "../config/env";

export interface AccessTokenPayload {
  userId: string;
  email: string;
  username: string;
}

const JWT_ISSUER = "chat-app-backend";
const JWT_AUDIENCE = "chat-app-client";

/**
 * Generate a short-lived JWT access token (15m default)
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return jwt.sign(
    {
      userId: payload.userId,
      email: payload.email,
      username: payload.username,
      jti: crypto.randomUUID(),
    },
    ENV.JWT_ACCESS_SECRET,
    {
      algorithm: "HS256",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: ENV.JWT_ACCESS_EXPIRES_IN as any,
    }
  );
}

/**
 * Verify a JWT access token with algorithm and claims enforcement
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ENV.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as AccessTokenPayload;
}


/**
 * Generate a cryptographically secure random refresh token string
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(40).toString("hex");
}

/**
 * SHA-256 hash a refresh token before database storage or lookup
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Calculate the expiry date for a refresh token (7 days from now)
 */
export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + 7);
  return expiry;
}
