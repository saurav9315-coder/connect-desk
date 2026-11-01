import { Router } from "express";
import { messageController } from "../controllers/message.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validateQuery, messagesQuerySchema } from "../middlewares/validation.middleware";
import { messageLimiter } from "../middlewares/rateLimit.middleware";

// mergeParams: true allows access to :groupId from parent router
export const messageRouter = Router({ mergeParams: true });

messageRouter.use(authMiddleware);

messageRouter.get(
  "/",
  validateQuery(messagesQuerySchema),
  (req, res, next) => messageController.getMessages(req, res, next)
);
messageRouter.post(
  "/",
  messageLimiter,
  (req, res, next) => messageController.sendMessage(req, res, next)
);
messageRouter.post(
  "/delivered",
  (req, res, next) => messageController.acknowledgeDelivered(req, res, next)
);
messageRouter.post(
  "/read",
  (req, res, next) => messageController.acknowledgeRead(req, res, next)
);

