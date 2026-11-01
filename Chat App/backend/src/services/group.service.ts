import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error.middleware";
import { GroupRole } from "../types/enums";

export interface CreateGroupDto {
  name: string;
  image?: string;
  avatarUrl?: string;
  description?: string;
  memberIds?: string[];
  initialMemberIds?: string[];
}

export interface UpdateGroupDto {
  name?: string;
  image?: string;
  avatarUrl?: string;
  description?: string;
}

export class GroupService {
  /**
   * 1. Create a new group with creator as OWNER and selected users as MEMBER
   * Enforces transaction: Group + Owner + Members
   */
  async createGroup(userId: string, dto: CreateGroupDto) {
    const trimmedName = dto.name?.trim();
    if (!trimmedName) {
      const error: AppError = new Error("Group name cannot be empty");
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    const rawMemberIds = dto.memberIds || dto.initialMemberIds || [];
    const uniqueMemberIds = Array.from(new Set(rawMemberIds)).filter((id) => id !== userId);

    // Verify all member IDs exist in the database
    let existingUsers: { id: string }[] = [];
    if (uniqueMemberIds.length > 0) {
      existingUsers = await prisma.user.findMany({
        where: { id: { in: uniqueMemberIds } },
        select: { id: true },
      });

      if (existingUsers.length !== uniqueMemberIds.length) {
        const error: AppError = new Error("One or more member IDs do not exist");
        error.statusCode = 404;
        error.code = "USER_NOT_FOUND";
        throw error;
      }

      // Check block rules
      const isBlocked = await prisma.blockedUser.findFirst({
        where: {
          OR: [
            { blockerId: { in: uniqueMemberIds }, blockedId: userId },
            { blockerId: userId, blockedId: { in: uniqueMemberIds } },
          ],
        },
      });
      if (isBlocked) {
        const error: AppError = new Error("Cannot add user due to privacy block settings");
        error.statusCode = 403;
        error.code = "FORBIDDEN";
        throw error;
      }
    }

    const imageUrl = dto.image?.trim() || dto.avatarUrl?.trim() || null;
    const description = dto.description?.trim() || null;

    // Database transaction: Group + Owner + Members
    return prisma.$transaction(async (tx) => {
      // 1. Create Group
      const group = await tx.group.create({
        data: {
          name: trimmedName,
          image: imageUrl,
          avatarUrl: imageUrl,
          description,
          createdBy: userId,
          ownerId: userId,
        },
      });

      // 2. Add creator as OWNER
      await tx.groupMember.create({
        data: {
          groupId: group.id,
          userId,
          role: GroupRole.OWNER,
        },
      });

      // 3. Add initial members as MEMBER
      for (const u of existingUsers) {
        await tx.groupMember.create({
          data: {
            groupId: group.id,
            userId: u.id,
            role: GroupRole.MEMBER,
          },
        });
      }

      // 4. Return complete group details
      const created = await tx.group.findUniqueOrThrow({
        where: { id: group.id },
        include: {
          owner: {
            select: { id: true, name: true, username: true, profileImage: true },
          },
          members: {
            include: {
              user: {
                select: { id: true, name: true, username: true, profileImage: true },
              },
            },
            orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
          },
          _count: {
            select: { members: true },
          },
        },
      });

      return {
        id: created.id,
        name: created.name,
        image: created.image,
        avatarUrl: created.avatarUrl || created.image,
        description: created.description,
        createdBy: created.createdBy || created.ownerId,
        ownerId: created.ownerId,
        owner: created.owner,
        members: created.members.map((m) => ({
          id: m.id,
          userId: m.userId,
          name: m.user.name,
          username: m.user.username,
          profileImage: m.user.profileImage,
          role: m.role,
          joinedAt: m.joinedAt,
          user: m.user,
        })),
        memberCount: created._count.members,
        currentUserRole: GroupRole.OWNER,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      };
    });
  }

  /**
   * 2. Get all groups that the user belongs to
   */
  async getUserGroups(userId: string) {
    const memberships = await prisma.groupMember.findMany({
      where: { userId },
      include: {
        group: {
          include: {
            _count: {
              select: { members: true },
            },
          },
        },
      },
    });

    const pins = await prisma.groupPin.findMany({
      where: { userId },
    });
    const pinMap = new Map(pins.map((p) => [p.groupId, p.pinnedAt]));

    const mapped = memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      image: m.group.image,
      avatarUrl: m.group.avatarUrl || m.group.image,
      description: m.group.description,
      memberCount: m.group._count.members,
      currentUserRole: m.role,
      userRole: m.role,
      isPinned: pinMap.has(m.groupId),
      pinnedAt: pinMap.get(m.groupId) || null,
      createdAt: m.group.createdAt,
      updatedAt: m.group.updatedAt,
    }));

    // Sort: pinned first (descending by pinnedAt), then updatedAt descending
    mapped.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.isPinned && b.isPinned) {
        return new Date(b.pinnedAt!).getTime() - new Date(a.pinnedAt!).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return mapped;
  }

  /**
   * 3. Get group details (Requires caller to be a member)
   */
  async getGroupDetails(groupId: string, userId: string) {
    // 1. Verify caller membership
    let membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!membership) {
      const groupCheck = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, ownerId: true, createdBy: true },
      });

      if (groupCheck && (groupCheck.ownerId === userId || groupCheck.createdBy === userId)) {
        membership = await prisma.groupMember.upsert({
          where: {
            groupId_userId: {
              groupId,
              userId,
            },
          },
          create: {
            groupId,
            userId,
            role: GroupRole.OWNER,
          },
          update: {
            role: GroupRole.OWNER,
          },
        });
      }
    }

    if (!membership) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Fetch group details
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        owner: {
          select: { id: true, name: true, username: true, profileImage: true },
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, username: true, profileImage: true },
            },
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        },
        _count: {
          select: { members: true },
        },
      },
    });

    if (!group) {
      const error: AppError = new Error("Group not found");
      error.statusCode = 404;
      error.code = "GROUP_NOT_FOUND";
      throw error;
    }

    const pin = await prisma.groupPin.findUnique({
      where: {
        userId_groupId: { userId, groupId },
      },
    });

    return {
      id: group.id,
      name: group.name,
      image: group.image,
      avatarUrl: group.avatarUrl || group.image,
      description: group.description,
      createdBy: group.createdBy || group.ownerId,
      ownerId: group.ownerId,
      owner: group.owner,
      currentUserRole: membership.role,
      memberCount: group._count.members,
      isPinned: !!pin,
      pinnedAt: pin?.pinnedAt || null,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      members: group.members.map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        username: m.user.username,
        profileImage: m.user.profileImage,
        role: m.role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
    };
  }

  /**
   * 4. Add member (Requires caller to be OWNER or ADMIN)
   */
  async addMember(groupId: string, callerId: string, targetUserId: string) {
    // 1. Verify caller membership & role
    const callerMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerId } },
    });

    if (!callerMember) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    if (callerMember.role !== GroupRole.OWNER && callerMember.role !== GroupRole.ADMIN) {
      const error: AppError = new Error("You do not have permission to perform this action");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Verify target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, username: true, profileImage: true },
    });

    if (!targetUser) {
      const error: AppError = new Error("Target user not found");
      error.statusCode = 404;
      error.code = "USER_NOT_FOUND";
      throw error;
    }

    // 3. Verify target is not already a member
    const existing = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });

    if (existing) {
      const error: AppError = new Error("User is already a member of this group");
      error.statusCode = 409;
      error.code = "ALREADY_MEMBER";
      throw error;
    }

    // 4. Privacy block check
    const isBlocked = await prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerId: targetUserId, blockedId: callerId },
          { blockerId: callerId, blockedId: targetUserId },
        ],
      },
    });

    if (isBlocked) {
      const error: AppError = new Error("Cannot add this user due to privacy block settings");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 5. Create GroupMember with role MEMBER
    const newMember = await prisma.groupMember.create({
      data: {
        groupId,
        userId: targetUserId,
        role: GroupRole.MEMBER,
      },
      include: {
        user: {
          select: { id: true, name: true, username: true, profileImage: true },
        },
      },
    });

    // Touch group updatedAt
    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    return {
      id: newMember.id,
      groupId: newMember.groupId,
      userId: newMember.userId,
      name: newMember.user.name,
      username: newMember.user.username,
      profileImage: newMember.user.profileImage,
      role: newMember.role,
      joinedAt: newMember.joinedAt,
      user: newMember.user,
    };
  }

  /**
   * 5. Remove member
   * Permissions:
   * - OWNER can remove ADMIN and MEMBER (cannot remove OWNER)
   * - ADMIN can remove MEMBER (cannot remove OWNER, cannot remove fellow ADMIN)
   * - MEMBER cannot remove other users
   */
  async removeMember(groupId: string, callerId: string, targetUserId: string) {
    // 1. Verify caller membership
    const callerMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerId } },
    });

    if (!callerMember) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Verify target membership
    const targetMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });

    if (!targetMember) {
      const error: AppError = new Error("User is not a member of this group");
      error.statusCode = 404;
      error.code = "NOT_A_MEMBER";
      throw error;
    }

    // If caller is removing themselves (leaving)
    if (callerId === targetUserId) {
      if (callerMember.role === GroupRole.OWNER) {
        const error: AppError = new Error("Owner cannot leave the group. Transfer ownership before leaving.");
        error.statusCode = 400;
        error.code = "OWNER_CANNOT_LEAVE";
        throw error;
      }

      await prisma.groupMember.delete({
        where: { groupId_userId: { groupId, userId: callerId } },
      });
      return { message: "You left the group successfully" };
    }

    // Caller is removing someone else:
    // Member cannot remove anyone
    if (callerMember.role === GroupRole.MEMBER) {
      const error: AppError = new Error("You do not have permission to perform this action");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // Owner cannot be removed
    if (targetMember.role === GroupRole.OWNER) {
      const error: AppError = new Error("Cannot remove the group owner");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // Admin cannot remove another Admin
    if (callerMember.role === GroupRole.ADMIN && targetMember.role === GroupRole.ADMIN) {
      const error: AppError = new Error("Admins cannot remove other admins. Only the owner can remove admins.");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // Perform removal
    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });

    // Touch group updatedAt
    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    return { message: "Member removed successfully" };
  }

  /**
   * 6. Update member role (Make Admin / Remove Admin)
   * Strictly OWNER only.
   * Allowed: MEMBER -> ADMIN, ADMIN -> MEMBER.
   * Forbidden: any role changes involving OWNER.
   */
  async updateMemberRole(groupId: string, callerId: string, targetUserId: string, newRole: "ADMIN" | "MEMBER") {
    // 1. Verify caller membership & role
    const callerMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerId } },
    });

    if (!callerMember) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    if (callerMember.role !== GroupRole.OWNER) {
      const error: AppError = new Error("You do not have permission to perform this action");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Validate input role
    if (newRole !== "ADMIN" && newRole !== "MEMBER") {
      const error: AppError = new Error("Role must be ADMIN or MEMBER");
      error.statusCode = 400;
      error.code = "INVALID_ROLE";
      throw error;
    }

    // 3. Verify target membership
    const targetMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });

    if (!targetMember) {
      const error: AppError = new Error("User is not a member of this group");
      error.statusCode = 404;
      error.code = "NOT_A_MEMBER";
      throw error;
    }

    // Cannot modify owner role
    if (targetMember.role === GroupRole.OWNER || targetUserId === callerId) {
      const error: AppError = new Error("Owner role cannot be modified");
      error.statusCode = 400;
      error.code = "INVALID_OPERATION";
      throw error;
    }

    // Update role
    const updated = await prisma.groupMember.update({
      where: { groupId_userId: { groupId, userId: targetUserId } },
      data: { role: newRole as GroupRole },
      include: {
        user: {
          select: { id: true, name: true, username: true, profileImage: true },
        },
      },
    });

    return {
      id: updated.id,
      groupId: updated.groupId,
      userId: updated.userId,
      name: updated.user.name,
      username: updated.user.username,
      profileImage: updated.user.profileImage,
      role: updated.role,
      joinedAt: updated.joinedAt,
      user: updated.user,
    };
  }

  /**
   * 7. Update group name and image (Strictly OWNER only)
   */
  async updateGroup(groupId: string, callerId: string, dto: UpdateGroupDto) {
    // 1. Verify caller membership & role
    const callerMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerId } },
    });

    if (!callerMember) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    if (callerMember.role !== GroupRole.OWNER) {
      const error: AppError = new Error("You do not have permission to perform this action");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Validate name if provided
    const updateData: { name?: string; image?: string | null; avatarUrl?: string | null; description?: string | null; updatedAt: Date } = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) {
      const trimmed = dto.name.trim();
      if (!trimmed) {
        const error: AppError = new Error("Group name cannot be empty");
        error.statusCode = 400;
        error.code = "VALIDATION_ERROR";
        throw error;
      }
      updateData.name = trimmed;
    }

    if (dto.image !== undefined) {
      const trimmedImage = dto.image.trim() || null;
      updateData.image = trimmedImage;
      updateData.avatarUrl = trimmedImage;
    } else if (dto.avatarUrl !== undefined) {
      const trimmedAvatar = dto.avatarUrl.trim() || null;
      updateData.image = trimmedAvatar;
      updateData.avatarUrl = trimmedAvatar;
    }

    if (dto.description !== undefined) {
      updateData.description = dto.description.trim() || null;
    }

    const updated = await prisma.group.update({
      where: { id: groupId },
      data: updateData,
      include: {
        owner: {
          select: { id: true, name: true, username: true, profileImage: true },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      image: updated.image,
      avatarUrl: updated.avatarUrl || updated.image,
      description: updated.description,
      createdBy: updated.createdBy || updated.ownerId,
      ownerId: updated.ownerId,
      owner: updated.owner,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * 8. Delete group (Strictly OWNER only)
   * Cascade deletes memberships, pins, and messages inside transaction. Users are preserved.
   */
  async deleteGroup(groupId: string, callerId: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      const error: AppError = new Error("Group not found");
      error.statusCode = 404;
      error.code = "GROUP_NOT_FOUND";
      throw error;
    }

    const callerMember = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: callerId } },
    });

    if (!callerMember) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    if (callerMember.role !== GroupRole.OWNER) {
      const error: AppError = new Error("You do not have permission to perform this action");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    await prisma.$transaction(async (tx) => {
      await tx.groupMember.deleteMany({ where: { groupId } });
      await tx.groupPin.deleteMany({ where: { groupId } });
      await tx.message.deleteMany({ where: { groupId } });
      await tx.group.delete({ where: { id: groupId } });
    });

    return { message: "Group deleted successfully" };
  }

  /**
   * 9. Leave group
   * MEMBER & ADMIN can leave. OWNER cannot leave without transferring ownership.
   */
  async leaveGroup(groupId: string, userId: string) {
    const group = await prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      const error: AppError = new Error("Group not found");
      error.statusCode = 404;
      error.code = "GROUP_NOT_FOUND";
      throw error;
    }

    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    if (membership.role === GroupRole.OWNER) {
      const error: AppError = new Error("Owner cannot leave the group. Transfer ownership before leaving.");
      error.statusCode = 400;
      error.code = "OWNER_CANNOT_LEAVE";
      throw error;
    }

    await prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId } },
    });

    return { message: "You left the group successfully" };
  }

  /**
   * Pin a group for the caller
   */
  async pinGroup(groupId: string, userId: string) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });

    if (!membership) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    const pin = await prisma.groupPin.upsert({
      where: { userId_groupId: { userId, groupId } },
      create: { userId, groupId },
      update: { pinnedAt: new Date() },
    });

    return { isPinned: true, pinnedAt: pin.pinnedAt };
  }

  /**
   * Unpin a group for the caller
   */
  async unpinGroup(groupId: string, userId: string) {
    await prisma.groupPin.deleteMany({
      where: { userId, groupId },
    });

    return { isPinned: false };
  }
}

export const groupService = new GroupService();
