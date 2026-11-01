import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { groupService } from "../services/group.service";

const createGroupSchema = z
  .object({
    name: z
      .string({ required_error: "Group name is required" })
      .trim()
      .min(1, "Group name cannot be empty")
      .max(100, "Group name cannot exceed 100 characters"),
    description: z.string().trim().max(255, "Description cannot exceed 255 characters").optional().or(z.literal("")),
    image: z.string().url("Image URL must be valid").optional().or(z.literal("")),
    avatarUrl: z.string().url("Avatar URL must be valid").optional().or(z.literal("")),
    memberIds: z.array(z.string().uuid("Member ID must be a valid UUID")).max(100).optional(),
    initialMemberIds: z.array(z.string().uuid("Member ID must be a valid UUID")).max(100).optional(),
  })
  .passthrough();

const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Group name cannot be empty").max(100, "Group name cannot exceed 100 characters").optional(),
    description: z.string().trim().max(255, "Description cannot exceed 255 characters").optional().or(z.literal("")),
    image: z.string().url("Image URL must be valid").optional().or(z.literal("")),
    avatarUrl: z.string().url("Avatar URL must be valid").optional().or(z.literal("")),
  })
  .strict();

const addMemberSchema = z
  .object({
    userId: z.string({ required_error: "User ID is required" }).uuid("User ID must be a valid UUID"),
  })
  .strict();

const updateRoleSchema = z
  .object({
    role: z.enum(["ADMIN", "MEMBER"], {
      errorMap: () => ({ message: "Role must be ADMIN or MEMBER. Role escalation is not allowed." }),
    }),
  })
  .strict();

export class GroupController {
  /**
   * POST /api/groups - Create a new group
   */
  async createGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = createGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || "Validation failed";
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

      const group = await groupService.createGroup(req.user!.id, parsed.data);
      res.status(201).json({
        success: true,
        message: "Group created successfully",
        data: {
          ...group,
          group,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/groups - Get all groups user belongs to
   */
  async getUserGroups(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const groups = await groupService.getUserGroups(req.user!.id);
      res.status(200).json({
        success: true,
        data: { groups },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/groups/:groupId - Get group details & members
   */
  async getGroupDetails(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const group = await groupService.getGroupDetails(groupId, req.user!.id);
      res.status(200).json({
        success: true,
        data: {
          ...group,
          group,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/groups/:groupId/members - Add member (OWNER or ADMIN)
   */
  async addMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || "User ID is required";
        res.status(400).json({
          success: false,
          message,
          error: {
            code: "VALIDATION_ERROR",
            message,
          },
        });
        return;
      }

      const member = await groupService.addMember(groupId, req.user!.id, parsed.data.userId);
      res.status(201).json({
        success: true,
        message: "Member added successfully",
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/groups/:groupId/members/:userId - Remove member
   */
  async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId, userId } = req.params;
      const result = await groupService.removeMember(groupId, req.user!.id, userId);
      res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/groups/:groupId/members/:userId/role - Make admin or remove admin role (OWNER only)
   */
  async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId, userId } = req.params;
      const parsed = updateRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || "Role must be ADMIN or MEMBER";
        res.status(400).json({
          success: false,
          message,
          error: {
            code: "VALIDATION_ERROR",
            message,
          },
        });
        return;
      }

      const member = await groupService.updateMemberRole(
        groupId,
        req.user!.id,
        userId,
        parsed.data.role
      );

      res.status(200).json({
        success: true,
        message: `Member role updated to ${parsed.data.role}`,
        data: { member },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/groups/:groupId - Update group name & image (OWNER only)
   */
  async updateGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const parsed = updateGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        const message = parsed.error.errors[0]?.message || "Validation failed";
        res.status(400).json({
          success: false,
          message,
          error: {
            code: "VALIDATION_ERROR",
            message,
          },
        });
        return;
      }

      const group = await groupService.updateGroup(groupId, req.user!.id, parsed.data);
      res.status(200).json({
        success: true,
        message: "Group updated successfully",
        data: {
          ...group,
          group,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/groups/:groupId - Delete group (OWNER only)
   */
  async deleteGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const result = await groupService.deleteGroup(groupId, req.user!.id);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/groups/:groupId/leave - Leave group (MEMBER or ADMIN)
   */
  async leaveGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const result = await groupService.leaveGroup(groupId, req.user!.id);
      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/groups/:groupId/pin
   */
  async pinGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const result = await groupService.pinGroup(groupId, req.user!.id);
      res.status(200).json({
        success: true,
        data: result,
        message: "Group pinned to top",
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/groups/:groupId/pin
   */
  async unpinGroup(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const result = await groupService.unpinGroup(groupId, req.user!.id);
      res.status(200).json({
        success: true,
        data: result,
        message: "Group unpinned",
      });
    } catch (error) {
      next(error);
    }
  }
}

export const groupController = new GroupController();
