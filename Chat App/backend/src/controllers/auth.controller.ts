import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authService } from "../services/auth.service";

const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(50, "Name cannot exceed 50 characters"),
    username: z
      .string()
      .trim()
      .min(3, "Username must be at least 3 characters")
      .max(30, "Username cannot exceed 30 characters")
      .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
    email: z.string().trim().email("Please provide a valid email address"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(100, "Password too long")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    profileImage: z.string().url("Profile image must be a valid URL").optional().nullable().or(z.literal("")),
  })
  .strict();

const loginSchema = z
  .object({
    identifier: z.string().trim().min(1, "Email or username is required"),
    password: z.string().min(1, "Password is required"),
  })
  .strict();

const refreshSchema = z
  .object({
    refreshToken: z.string().min(1, "Refresh token is required"),
  })
  .strict();

const logoutSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict();



const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

function parseCookie(req: Request, name: string): string | undefined {
  if (!req.headers.cookie) return undefined;
  const match = req.headers.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export class AuthController {
  /**
   * POST /api/auth/register
   */
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.body?.name && req.body?.displayName) {
        req.body.name = req.body.displayName;
      }
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const errorMsg = parsed.error.errors[0]?.message || "Validation failed";
        res.status(400).json({
          success: false,
          message: errorMsg,
          error: {
            code: "VALIDATION_ERROR",
            message: errorMsg,
            details: parsed.error.format(),
          },
        });
        return;
      }

      const result = await authService.register(parsed.data);

      const cookieOpts = getCookieOptions();
      res.cookie("accessToken", result.accessToken, {
        ...cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refreshToken", result.refreshToken, {
        ...cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(201).json({
        success: true,
        message: "Account created successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/login
   */
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        const errorMsg = parsed.error.errors[0]?.message || "Validation failed";
        res.status(400).json({
          success: false,
          message: errorMsg,
          error: {
            code: "VALIDATION_ERROR",
            message: errorMsg,
            details: parsed.error.format(),
          },
        });
        return;
      }

      const result = await authService.login(parsed.data);

      const cookieOpts = getCookieOptions();
      res.cookie("accessToken", result.accessToken, {
        ...cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refreshToken", result.refreshToken, {
        ...cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        data: result,
        message: "Login successful",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/refresh
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.body?.refreshToken || parseCookie(req, "refreshToken");
      if (!rawRefreshToken) {
        res.status(400).json({
          success: false,
          message: "Refresh token is required",
          error: {
            code: "VALIDATION_ERROR",
            message: "Refresh token is required",
            details: { refreshToken: ["Refresh token is required in request body or cookie"] },
          },
        });
        return;
      }

      const result = await authService.refresh(rawRefreshToken);

      const cookieOpts = getCookieOptions();
      res.cookie("accessToken", result.accessToken, {
        ...cookieOpts,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie("refreshToken", result.refreshToken, {
        ...cookieOpts,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      res.status(200).json({
        success: true,
        data: result,
        message: "Token refreshed successfully",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/auth/logout
   */
  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const rawRefreshToken = req.body?.refreshToken || parseCookie(req, "refreshToken");
      if (rawRefreshToken) {
        await authService.logout(rawRefreshToken);
      }

      const cookieOpts = getCookieOptions();
      res.clearCookie("accessToken", cookieOpts);
      res.clearCookie("refreshToken", cookieOpts);

      res.status(200).json({
        success: true,
        message: "Logged out successfully",
      });
    } catch (error) {
      next(error);
    }
  }


  /**
   * GET /api/auth/me
   */
  async me(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: {
            code: "UNAUTHORIZED",
            message: "User not authenticated",
          },
        });
        return;
      }

      const user = await authService.getMe(req.user.id);
      res.status(200).json({
        success: true,
        data: { user },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
