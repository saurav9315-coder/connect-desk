import { Router } from "express";
import { groupController } from "../controllers/group.controller";
import { mediaController } from "../controllers/media.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { requireGroupMember, requireGroupRole } from "../middlewares/groupAuth.middleware";
import { singleFileUpload } from "../middlewares/upload.middleware";
import { messageRouter } from "./message.routes";
import { GroupRole } from "../types/enums";

import {
  validateParams,
  groupIdParamSchema,
  groupAndUserParamsSchema,
  groupAndFileKeyParamsSchema,
} from "../middlewares/validation.middleware";
import { uploadLimiter, groupCreateLimiter } from "../middlewares/rateLimit.middleware";

export const groupRouter = Router();

// All group routes require authentication
groupRouter.use(authMiddleware);

// Group CRUD
groupRouter.post("/", groupCreateLimiter, (req, res, next) => groupController.createGroup(req, res, next));
groupRouter.get("/", (req, res, next) => groupController.getUserGroups(req, res, next));
groupRouter.get(
  "/:groupId",
  validateParams(groupIdParamSchema),
  requireGroupMember,
  (req, res, next) => groupController.getGroupDetails(req, res, next)
);
groupRouter.patch(
  "/:groupId",
  validateParams(groupIdParamSchema),
  requireGroupRole([GroupRole.OWNER]),
  (req, res, next) => groupController.updateGroup(req, res, next)
);
groupRouter.delete(
  "/:groupId",
  validateParams(groupIdParamSchema),
  requireGroupRole([GroupRole.OWNER]),
  (req, res, next) => groupController.deleteGroup(req, res, next)
);

// Group Leave
groupRouter.post(
  "/:groupId/leave",
  validateParams(groupIdParamSchema),
  requireGroupMember,
  (req, res, next) => groupController.leaveGroup(req, res, next)
);

// Group Members Management & Admin Controls
groupRouter.post(
  "/:groupId/members",
  validateParams(groupIdParamSchema),
  requireGroupRole([GroupRole.OWNER, GroupRole.ADMIN]),
  (req, res, next) => groupController.addMember(req, res, next)
);
groupRouter.delete(
  "/:groupId/members/:userId",
  validateParams(groupAndUserParamsSchema),
  requireGroupMember,
  (req, res, next) => groupController.removeMember(req, res, next)
);
groupRouter.patch(
  "/:groupId/members/:userId/role",
  validateParams(groupAndUserParamsSchema),
  requireGroupRole([GroupRole.OWNER]),
  (req, res, next) => groupController.updateMemberRole(req, res, next)
);

// Group Pinning
groupRouter.post("/:groupId/pin", validateParams(groupIdParamSchema), (req, res, next) =>
  groupController.pinGroup(req, res, next)
);
groupRouter.delete("/:groupId/pin", validateParams(groupIdParamSchema), (req, res, next) =>
  groupController.unpinGroup(req, res, next)
);

// Media Upload & Secure Group File Access with Rate Limiting
groupRouter.post(
  "/:groupId/attachments",
  validateParams(groupIdParamSchema),
  uploadLimiter,
  singleFileUpload("file"),
  (req, res, next) => mediaController.uploadAttachment(req, res, next)
);
groupRouter.post(
  "/:groupId/upload",
  validateParams(groupIdParamSchema),
  uploadLimiter,
  singleFileUpload("file"),
  (req, res, next) => mediaController.uploadAttachment(req, res, next)
);
groupRouter.get(
  "/:groupId/files/:fileKey",
  validateParams(groupAndFileKeyParamsSchema),
  (req, res, next) => mediaController.serveGroupFile(req, res, next)
);
groupRouter.get(
  "/:groupId/attachments/:fileKey",
  validateParams(groupAndFileKeyParamsSchema),
  (req, res, next) => mediaController.serveGroupFile(req, res, next)
);

// Group Messages & Realtime Chat
groupRouter.use("/:groupId/messages", validateParams(groupIdParamSchema), messageRouter);
