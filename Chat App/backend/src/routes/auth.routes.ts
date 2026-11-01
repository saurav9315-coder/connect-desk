import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { authLimiter, refreshLimiter } from "../middlewares/rateLimit.middleware";

export const authRouter = Router();

// Public auth routes with rate limiting
authRouter.post("/register", authLimiter, (req, res, next) => authController.register(req, res, next));
authRouter.post("/login", authLimiter, (req, res, next) => authController.login(req, res, next));
authRouter.post("/refresh", refreshLimiter, (req, res, next) => authController.refresh(req, res, next));
authRouter.post("/logout", authLimiter, (req, res, next) => authController.logout(req, res, next));

// Protected auth route
authRouter.get("/me", authMiddleware, (req, res, next) => authController.me(req, res, next));

