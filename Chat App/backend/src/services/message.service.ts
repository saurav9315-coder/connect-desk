import { prisma } from "../lib/prisma";
import { AppError } from "../middleware/error.middleware";
import { MessageType } from "../types/enums";

export type MessageDeliveryStatus = "SENT" | "DELIVERED" | "READ";

export function computeMessageStatus(
  receipts?: Array<{ deliveredAt: Date | string | null; readAt: Date | string | null }> | null
): MessageDeliveryStatus {
  if (!receipts || receipts.length === 0) return "SENT";
  const allRead = receipts.every((r) => r.readAt !== null && r.readAt !== undefined);
  if (allRead) return "READ";
  const allDelivered = receipts.every((r) => r.deliveredAt !== null && r.deliveredAt !== undefined);
  if (allDelivered) return "DELIVERED";
  return "SENT";
}

export interface CreateMessageDto {
  text?: string;
  content?: string;
  type?: MessageType | string;
  fileUrl?: string;
  fileKey?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  duration?: number | null;
  fileInfo?: any;
}

export class MessageService {
  /**
   * Get messages for a group with pagination (oldest to newest for chat display)
   */
  async getMessages(groupId: string, userId: string, cursor?: string, limit = 50) {
    // 1. Verify caller is a member of the group
    let membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
    });

    if (!membership) {
      const groupCheck = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, ownerId: true, createdBy: true },
      });

      if (groupCheck && (groupCheck.ownerId === userId || groupCheck.createdBy === userId)) {
        membership = await prisma.groupMember.upsert({
          where: { groupId_userId: { groupId, userId } },
          create: { groupId, userId, role: "OWNER" },
          update: { role: "OWNER" },
        });
      }
    }

    if (!membership) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Fetch messages ordered by createdAt DESC
    const take = Math.min(Math.max(limit, 1), 100);

    const rawMessages = await prisma.message.findMany({
      where: { groupId },
      take: take + 1,
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        sender: {
          select: { id: true, name: true, username: true, profileImage: true },
        },
        receipts: {
          select: { id: true, userId: true, deliveredAt: true, readAt: true },
        },
      },
    });

    let hasMore = false;
    let nextCursor: string | null = null;

    if (rawMessages.length > take) {
      hasMore = true;
      rawMessages.pop(); // Remove the extra record
      nextCursor = rawMessages[rawMessages.length - 1]?.id || null;
    }

    // Reverse to return in chronological ascending order (oldest -> newest for display)
    const messages = rawMessages.reverse().map((msg) => {
      const status = computeMessageStatus(msg.receipts);
      return {
        id: msg.id,
        groupId: msg.groupId,
        senderId: msg.senderId,
        sender: msg.sender
          ? {
              id: msg.sender.id,
              name: msg.sender.name,
              username: msg.sender.username,
              profileImage: msg.sender.profileImage,
            }
          : null,
        type: msg.type,
        text: msg.text || msg.content || "",
        content: msg.content || msg.text || "",
        fileUrl: msg.fileUrl,
        fileKey: msg.fileKey,
        fileName: msg.fileName,
        fileSize: msg.fileSize,
        mimeType: msg.mimeType,
        duration: msg.duration,
        fileInfo: msg.fileInfo,
        isPinned: msg.isPinned,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        status,
        receipts: msg.receipts
          ? msg.receipts.map((r) => ({
              userId: r.userId,
              deliveredAt: r.deliveredAt,
              readAt: r.readAt,
            }))
          : [],
      };
    });

    return {
      messages,
      nextCursor,
      hasMore,
    };
  }

  /**
   * Create and persist a message in the database
   */
  async createMessage(groupId: string, senderId: string, dto: CreateMessageDto) {
    // 1. Verify caller is a member of the group
    let membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId: senderId },
      },
    });

    if (!membership) {
      const groupCheck = await prisma.group.findUnique({
        where: { id: groupId },
        select: { id: true, ownerId: true, createdBy: true },
      });

      if (groupCheck && (groupCheck.ownerId === senderId || groupCheck.createdBy === senderId)) {
        membership = await prisma.groupMember.upsert({
          where: { groupId_userId: { groupId, userId: senderId } },
          create: { groupId, userId: senderId, role: "OWNER" },
          update: { role: "OWNER" },
        });
      }
    }

    if (!membership) {
      const error: AppError = new Error("You are not a member of this group");
      error.statusCode = 403;
      error.code = "FORBIDDEN";
      throw error;
    }

    // 2. Validate text
    const textContent = (dto.text !== undefined ? dto.text : dto.content)?.trim();

    if (!textContent && !dto.fileUrl) {
      const error: AppError = new Error("Message text cannot be empty");
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    if (textContent && textContent.length > 5000) {
      const error: AppError = new Error("Message cannot exceed 5000 characters");
      error.statusCode = 400;
      error.code = "VALIDATION_ERROR";
      throw error;
    }

    // For Step 4: Text messages force type = "TEXT" unless fileUrl is present
    const messageType = dto.fileUrl ? (dto.type as string) || "FILE" : "TEXT";

    // 3. Find other group members eligible to receive this message
    const members = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const recipientUserIds = members.map((m) => m.userId).filter((id) => id !== senderId);

    // 4. Create message and receipts in database
    const message = await prisma.message.create({
      data: {
        groupId,
        senderId,
        type: messageType,
        text: textContent || null,
        content: textContent || null,
        fileUrl: dto.fileUrl || null,
        fileKey: dto.fileKey || null,
        fileName: dto.fileName || null,
        fileSize: dto.fileSize || null,
        mimeType: dto.mimeType || null,
        duration: dto.duration || null,
        fileInfo: dto.fileInfo
          ? typeof dto.fileInfo === "string"
            ? dto.fileInfo
            : JSON.stringify(dto.fileInfo)
          : null,
        receipts: {
          create: recipientUserIds.map((userId) => ({
            userId,
            deliveredAt: null,
            readAt: null,
          })),
        },
      },
      include: {
        sender: {
          select: { id: true, name: true, username: true, profileImage: true },
        },
        receipts: {
          select: { id: true, userId: true, deliveredAt: true, readAt: true },
        },
      },
    });

    // 5. Touch group updatedAt
    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    const status = computeMessageStatus(message.receipts);

    return {
      id: message.id,
      groupId: message.groupId,
      senderId: message.senderId,
      sender: message.sender
        ? {
            id: message.sender.id,
            name: message.sender.name,
            username: message.sender.username,
            profileImage: message.sender.profileImage,
          }
        : null,
      type: message.type,
      text: message.text || message.content || "",
      content: message.content || message.text || "",
      fileUrl: message.fileUrl,
      fileKey: message.fileKey,
      fileName: message.fileName,
      fileSize: message.fileSize,
      mimeType: message.mimeType,
      duration: message.duration,
      fileInfo: message.fileInfo,
      isPinned: message.isPinned,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      status,
      receipts: message.receipts
        ? message.receipts.map((r) => ({
            userId: r.userId,
            deliveredAt: r.deliveredAt,
            readAt: r.readAt,
          }))
        : [],
    };
  }

  /**
   * Mark messages as delivered for a recipient
   */
  async markDelivered(userId: string, messageIds: string[], groupId?: string) {
    if (!messageIds || messageIds.length === 0) return [];
    const now = new Date();

    // Find receipts for this user that are not yet marked delivered
    const receiptsToUpdate = await prisma.messageReceipt.findMany({
      where: {
        userId,
        messageId: { in: messageIds },
        deliveredAt: null,
        message: groupId ? { groupId } : undefined,
      },
      select: { id: true, messageId: true },
    });

    if (receiptsToUpdate.length === 0) return [];

    await prisma.messageReceipt.updateMany({
      where: { id: { in: receiptsToUpdate.map((r) => r.id) } },
      data: { deliveredAt: now },
    });

    const affectedMessageIds = [...new Set(receiptsToUpdate.map((r) => r.messageId))];
    const results = [];

    for (const msgId of affectedMessageIds) {
      const msg = await prisma.message.findUnique({
        where: { id: msgId },
        select: {
          id: true,
          groupId: true,
          senderId: true,
          receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
        },
      });

      if (msg) {
        results.push({
          messageId: msg.id,
          groupId: msg.groupId,
          senderId: msg.senderId,
          status: computeMessageStatus(msg.receipts),
          receipts: msg.receipts,
          updatedUserId: userId,
          type: "DELIVERED" as const,
          timestamp: now.toISOString(),
        });
      }
    }

    return results;
  }

  /**
   * Mark messages as read for a recipient
   */
  async markRead(userId: string, messageIds: string[], groupId?: string) {
    if (!messageIds || messageIds.length === 0) return [];
    const now = new Date();

    const receiptsToUpdate = await prisma.messageReceipt.findMany({
      where: {
        userId,
        messageId: { in: messageIds },
        readAt: null,
        message: groupId ? { groupId } : undefined,
      },
      select: { id: true, messageId: true, deliveredAt: true },
    });

    if (receiptsToUpdate.length === 0) return [];

    await prisma.messageReceipt.updateMany({
      where: { id: { in: receiptsToUpdate.map((r) => r.id) } },
      data: {
        readAt: now,
        deliveredAt: now, // Read implies delivered
      },
    });

    const affectedMessageIds = [...new Set(receiptsToUpdate.map((r) => r.messageId))];
    const results = [];

    for (const msgId of affectedMessageIds) {
      const msg = await prisma.message.findUnique({
        where: { id: msgId },
        select: {
          id: true,
          groupId: true,
          senderId: true,
          receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
        },
      });

      if (msg) {
        results.push({
          messageId: msg.id,
          groupId: msg.groupId,
          senderId: msg.senderId,
          status: computeMessageStatus(msg.receipts),
          receipts: msg.receipts,
          updatedUserId: userId,
          type: "READ" as const,
          timestamp: now.toISOString(),
        });
      }
    }

    return results;
  }

  /**
   * Create and persist an AI assistant message in the database (senderId is null)
   */
  async createAIMessage(groupId: string, content: string, metadata?: Record<string, any>) {
    const message = await prisma.message.create({
      data: {
        groupId,
        senderId: null,
        type: "AI",
        text: content,
        content,
        fileInfo: metadata ? JSON.stringify(metadata) : null,
      },
    });

    await prisma.group.update({
      where: { id: groupId },
      data: { updatedAt: new Date() },
    });

    return {
      id: message.id,
      groupId: message.groupId,
      senderId: null,
      sender: null,
      type: "AI",
      text: message.text || "",
      content: message.content || "",
      fileUrl: null,
      fileKey: null,
      fileName: null,
      fileSize: null,
      mimeType: null,
      duration: null,
      fileInfo: message.fileInfo,
      isPinned: false,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}

export const messageService = new MessageService();
