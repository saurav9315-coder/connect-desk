import { Router } from "express";
import { getHealth, getDbHealth } from "../controllers/health.controller";

export const healthRouter = Router();

// GET /api/health
healthRouter.get("/health", getHealth);

// GET /api/health/db
healthRouter.get("/health/db", getDbHealth);
