import { Request, Response } from "express";
import { checkDbHealth } from "../services/health.service";

/**
 * Health check endpoint
 * GET /api/health
 */
export const getHealth = (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: "Backend is running",
  });
};

/**
 * Database health check endpoint
 * GET /api/health/db
 */
export const getDbHealth = async (req: Request, res: Response) => {
  try {
    const isHealthy = await checkDbHealth();
    if (isHealthy) {
      return res.status(200).json({
        success: true,
        message: "Database is connected and healthy",
        database: "MySQL",
      });
    }

    return res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Database error";
    console.error("[Health Controller] DB Check exception:", errorMsg);
    return res.status(503).json({
      success: false,
      message: "Database connection failed",
    });
  }
};
