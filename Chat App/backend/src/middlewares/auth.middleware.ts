import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token.utils";
import { prisma } from "../lib/prisma";

export interface AuthenticatedUser {
  id: string;
  name: string;
  username: string;
  email: string;
  profileImage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  let token: string | undefined;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.headers.cookie) {
    const match = req.headers.cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
    if (match) {
      token = decodeURIComponent(match[1]);
    }
  }

  // Restrict query parameter token strictly to GET requests (for browser media elements/downloads)
  if (!token && req.method === "GET" && typeof req.query.token === "string" && req.query.token) {
    token = req.query.token;
  }

  if (token) {
    token = token.trim();
    if (token === "undefined" || token === "null" || token === "") {
      token = undefined;
    }
  }

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Authentication token missing or invalid",
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication token missing or invalid",
      },
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
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
      res.status(401).json({
        success: false,
        message: "User associated with token no longer exists",
        error: {
          code: "USER_NOT_FOUND",
          message: "User associated with token no longer exists",
        },
      });
      return;
    }

    req.user = user;
    next();
  } catch (err: unknown) {
    const rawMsg = err instanceof Error ? err.message : "Invalid token";
    const message = rawMsg.includes("expired") ? "Token has expired" : "Invalid authentication token";
    res.status(401).json({
      success: false,
      message,
      error: {
        code: "INVALID_TOKEN",
        message,
      },
    });
    return;
  }
};

export const authenticate = authMiddleware;
export const requireAuth = authMiddleware;

