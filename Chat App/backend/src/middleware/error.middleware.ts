import { Request, Response, NextFunction } from "express";
import { ENV } from "../config/env";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export const errorMiddleware = (
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const isDev = ENV.NODE_ENV === "development";

  // Log detailed error on server
  console.error(`[Server Error] ${req.method} ${req.originalUrl || req.path} - Status ${statusCode}:`, err.message);
  if (isDev && err.stack) {
    console.error(err.stack);
  }

  // Safe client-facing message (do not expose internal DB details or stack traces to client in production)
  const message =
    statusCode >= 500 && !isDev
      ? "Something went wrong"
      : err.message || "Something went wrong";

  res.status(statusCode).json({
    success: false,
    message,
    error: {
      code:
        err.code ||
        (statusCode === 400
          ? "BAD_REQUEST"
          : statusCode === 401
          ? "UNAUTHORIZED"
          : statusCode === 403
          ? "FORBIDDEN"
          : statusCode === 404
          ? "NOT_FOUND"
          : statusCode === 409
          ? "CONFLICT"
          : "INTERNAL_SERVER_ERROR"),
      message,
      ...(err.details ? { details: err.details } : {}),
    },
    ...(isDev && err.stack ? { stack: err.stack } : {}),
  });
};
