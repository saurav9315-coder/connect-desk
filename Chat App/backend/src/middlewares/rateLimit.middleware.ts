import rateLimit from "express-rate-limit";
import { Request } from "express";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Auth Rate Limiter: Login & Register
 * In production: Max 10 attempts per 15 minutes per IP
 * In dev/test: Max 500 attempts per 15 minutes per IP to avoid blocking local testing
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 10 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again after 15 minutes.",
    },
  },
});


/**
 * Token Refresh Rate Limiter
 * Max 60 attempts per 15 minutes per IP
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "REFRESH_RATE_LIMIT_EXCEEDED",
      message: "Too many token refresh attempts. Please try again later.",
    },
  },
});

/**
 * Media Upload Rate Limiter
 * Max 30 uploads per 15 minutes per user / IP
 */
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => {
    return req.user?.id ? `upload_user_${req.user.id}` : `upload_ip_${req.ip || "unknown"}`;
  },
  message: {
    success: false,
    error: {
      code: "UPLOAD_RATE_LIMIT_EXCEEDED",
      message: "Too many file upload requests. Maximum 30 uploads allowed per 15 minutes.",
    },
  },
});

/**
 * Group Creation Rate Limiter
 * Max 20 group creations per 15 minutes per user / IP
 */
export const groupCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => {
    return req.user?.id ? `group_create_user_${req.user.id}` : `group_create_ip_${req.ip || "unknown"}`;
  },
  message: {
    success: false,
    error: {
      code: "GROUP_CREATE_RATE_LIMIT_EXCEEDED",
      message: "Too many groups created. Maximum 20 groups allowed per 15 minutes.",
    },
  },
});

/**
 * Message Posting Rate Limiter
 * Max 60 messages per minute per user / IP
 */
export const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req: Request): string => {
    return req.user?.id ? `msg_user_${req.user.id}` : `msg_ip_${req.ip || "unknown"}`;
  },
  message: {
    success: false,
    error: {
      code: "MESSAGE_RATE_LIMIT_EXCEEDED",
      message: "You are sending messages too quickly. Please wait a moment.",
    },
  },
});


/**
 * General API Rate Limiter
 * Max 300 requests per 15 minutes per IP
 */
export const generalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: Request) => req.path === "/api/health", // Exclude health check from limiter
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests to the API. Please try again later.",
    },
  },
});

/**
 * In-memory AI Rate Limiter Guard
 * 10 queries per minute per group
 * 20 queries per hour per user
 */
class AIRateLimiter {
  private groupTimestamps: Map<string, number[]> = new Map();
  private userTimestamps: Map<string, number[]> = new Map();

  checkAndConsume(groupId: string, userId: string): { allowed: boolean; reason?: string } {
    const now = Date.now();

    // 1. Check group limit: 10 per minute
    const groupTimes = (this.groupTimestamps.get(groupId) || []).filter((t) => now - t < 60 * 1000);
    if (groupTimes.length >= 10) {
      return { allowed: false, reason: "Group AI limit reached (max 10 queries/minute per group)." };
    }

    // 2. Check user limit: 20 per hour
    const userTimes = (this.userTimestamps.get(userId) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (userTimes.length >= 20) {
      return { allowed: false, reason: "User AI limit reached (max 20 queries/hour per user)." };
    }

    // Record consumption
    groupTimes.push(now);
    this.groupTimestamps.set(groupId, groupTimes);

    userTimes.push(now);
    this.userTimestamps.set(userId, userTimes);

    return { allowed: true };
  }
}

export const aiRateLimiter = new AIRateLimiter();
