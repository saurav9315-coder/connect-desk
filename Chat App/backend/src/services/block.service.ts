import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/error.middleware";

export class BlockService {
  /**
   * Block a target user
   */
  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      const error: AppError = new Error("You cannot block yourself");
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true, name: true, username: true },
    });

    if (!targetUser) {
      const error: AppError = new Error("User to block not found");
      error.statusCode = 404;
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    await prisma.blockedUser.upsert({
      where: {
        blockerId_blockedId: { blockerId, blockedId },
      },
      create: {
        blockerId,
        blockedId,
      },
      update: {},
    });

    return {
      blocked: true,
      user: targetUser,
    };
  }

  /**
   * Unblock a target user
   */
  async unblockUser(blockerId: string, blockedId: string) {
    await prisma.blockedUser.deleteMany({
      where: {
        blockerId,
        blockedId,
      },
    });

    return {
      blocked: false,
    };
  }

  /**
   * Get list of user IDs blocked by caller
   */
  async getBlockedUserIds(blockerId: string): Promise<string[]> {
    const rows = await prisma.blockedUser.findMany({
      where: { blockerId },
      select: { blockedId: true },
    });
    return rows.map((r) => r.blockedId);
  }

  /**
   * Get detailed list of blocked users
   */
  async getBlockedUsers(blockerId: string) {
    const rows = await prisma.blockedUser.findMany({
      where: { blockerId },
      include: {
        blocked: {
          select: {
            id: true,
            name: true,
            username: true,
            profileImage: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((r) => r.blocked);
  }

  /**
   * Check if userA has blocked userB
   */
  async hasBlocked(userAId: string, userBId: string): Promise<boolean> {
    const record = await prisma.blockedUser.findUnique({
      where: {
        blockerId_blockedId: { blockerId: userAId, blockedId: userBId },
      },
    });
    return !!record;
  }
}

export const blockService = new BlockService();
