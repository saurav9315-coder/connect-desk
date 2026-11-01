import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middlewares/auth.middleware";
import { blockService } from "../services/block.service";
import {
  validateParams,
  validateQuery,
  userIdParamSchema,
  userSearchQuerySchema,
} from "../middlewares/validation.middleware";

export const userRouter = Router();

userRouter.use(authMiddleware);

/**
 * GET /api/users/search?q=query
 * Excludes users who have blocked the caller and users blocked by the caller
 */
userRouter.get(
  "/search",
  validateQuery(userSearchQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = ((req.query.q as string) || "").trim();
      if (!query) {
        res.status(200).json({ success: true, data: { users: [] } });
        return;
      }

      // Query bidirectional block relationships involving caller
      const blockedRelations = await prisma.blockedUser.findMany({
        where: {
          OR: [{ blockerId: req.user!.id }, { blockedId: req.user!.id }],
        },
        select: { blockerId: true, blockedId: true },
      });

      const excludedIds = new Set<string>([req.user!.id]);
      for (const rel of blockedRelations) {
        excludedIds.add(rel.blockerId);
        excludedIds.add(rel.blockedId);
      }

      const users = await prisma.user.findMany({
        where: {
          AND: [
            { id: { notIn: Array.from(excludedIds) } },
            {
              OR: [
                { name: { contains: query } },
                { username: { contains: query } },
                { email: { contains: query } },
              ],
            },
          ],
        },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          profileImage: true,
        },
        take: 20,
      });

      res.status(200).json({
        success: true,
        data: { users },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/users/blocked
 * Get users blocked by caller
 */
userRouter.get("/blocked", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const blockedUsers = await blockService.getBlockedUsers(req.user!.id);
    res.status(200).json({
      success: true,
      data: { blockedUsers },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/users/block/:userId
 * Block a target user
 */
userRouter.post(
  "/block/:userId",
  validateParams(userIdParamSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId: targetUserId } = req.params;
      const result = await blockService.blockUser(req.user!.id, targetUserId);
      res.status(200).json({
        success: true,
        data: result,
        message: "User blocked successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/users/block/:userId
 * Unblock a target user
 */
userRouter.delete(
  "/block/:userId",
  validateParams(userIdParamSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { userId: targetUserId } = req.params;
      const result = await blockService.unblockUser(req.user!.id, targetUserId);
      res.status(200).json({
        success: true,
        data: result,
        message: "User unblocked successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);


