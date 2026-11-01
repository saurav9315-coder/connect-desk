import { Request, Response, NextFunction } from "express";
import { ZodSchema, z } from "zod";

/**
 * Middleware factory to validate request body
 */
export const validateBody = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message || "Validation failed for request body";
      res.status(400).json({
        success: false,
        message,
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: parsed.error.format(),
        },
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
};

/**
 * Middleware factory to validate URL parameters
 */
export const validateParams = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message || "Validation failed for route parameters";
      res.status(400).json({
        success: false,
        message,
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: parsed.error.format(),
        },
      });
      return;
    }
    req.params = parsed.data;
    next();
  };
};

/**
 * Middleware factory to validate query parameters
 */
export const validateQuery = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      const message = parsed.error.errors[0]?.message || "Validation failed for query parameters";
      res.status(400).json({
        success: false,
        message,
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: parsed.error.format(),
        },
      });
      return;
    }
    req.query = parsed.data;
    next();
  };
};

// Common Parameter Schemas
export const groupIdParamSchema = z
  .object({
    groupId: z.string().uuid("Invalid group ID format. Must be a valid UUID"),
  })
  .passthrough();

export const groupAndUserParamsSchema = z
  .object({
    groupId: z.string().uuid("Invalid group ID format. Must be a valid UUID"),
    userId: z.string().uuid("Invalid user ID format. Must be a valid UUID"),
  })
  .passthrough();

export const userIdParamSchema = z
  .object({
    userId: z.string().uuid("Invalid user ID format. Must be a valid UUID"),
  })
  .passthrough();

export const groupAndFileKeyParamsSchema = z
  .object({
    groupId: z.string().uuid("Invalid group ID format. Must be a valid UUID"),
    fileKey: z
      .string()
      .regex(/^[0-9]+-[a-f0-9]+(\.[a-zA-Z0-9]+)?$/, "Invalid or malformed file key format"),
  })
  .passthrough();

// Common Query Schemas
export const messagesQuerySchema = z.object({
  cursor: z.string().uuid("Cursor must be a valid message UUID").optional(),
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").default(50),
});

export const userSearchQuerySchema = z.object({
  q: z.string().trim().max(100, "Search query too long").optional(),
});
