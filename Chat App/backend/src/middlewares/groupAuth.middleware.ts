import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { GroupRole } from "../types/enums";

export interface GroupMembershipContext {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  joinedAt: Date;
}

declare global {
  namespace Express {
    interface Request {
      groupMember?: GroupMembershipContext;
      groupRole?: GroupRole;
    }
  }
}

/**
 * Middleware: Verifies the caller is authenticated and belongs to the group (:groupId)
 */
export const requireGroupMember = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
        error: {
          code: "UNAUTHORIZED",
          message: "Authentication required",
        },
      });
      return;
    }

    const { groupId } = req.params;
    if (!groupId) {
      res.status(400).json({
        success: false,
        message: "Group ID parameter is required",
        error: {
          code: "BAD_REQUEST",
          message: "Group ID parameter is required",
        },
      });
      return;
    }

    let membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.user.id,
        },
      },
    });

    // Self-healing fallback: verify if caller is the creator/owner
    if (!membership) {
      const groupCheck = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, ownerId: true, createdBy: true },
      });

      if (groupCheck && (groupCheck.ownerId === req.user.id || groupCheck.createdBy === req.user.id)) {
        membership = await prisma.groupMember.upsert({
          where: {
            groupId_userId: {
              groupId,
              userId: req.user.id,
            },
          },
          create: {
            groupId,
            userId: req.user.id,
            role: GroupRole.OWNER,
          },
          update: {
            role: GroupRole.OWNER,
          },
        });
      }
    }

    if (!membership) {
      res.status(403).json({
        success: false,
        message: "You are not a member of this group",
        error: {
          code: "FORBIDDEN",
          message: "You are not a member of this group",
        },
      });
      return;
    }

    req.groupMember = {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      role: membership.role as GroupRole,
      joinedAt: membership.joinedAt,
    };
    req.groupRole = membership.role as GroupRole;

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware: Requires caller to have one of the specified group roles
 */
export const requireGroupRole = (allowedRoles: (GroupRole | "OWNER" | "ADMIN" | "MEMBER")[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.groupMember) {
        return requireGroupMember(req, res, () => {
          if (!req.groupMember || !allowedRoles.includes(req.groupMember.role)) {
            res.status(403).json({
              success: false,
              message: "You do not have permission to perform this action",
              error: {
                code: "FORBIDDEN",
                message: "You do not have permission to perform this action",
              },
            });
            return;
          }
          next();
        });
      }

      if (!allowedRoles.includes(req.groupMember.role)) {
        res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action",
          error: {
            code: "FORBIDDEN",
            message: "You do not have permission to perform this action",
          },
        });
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
