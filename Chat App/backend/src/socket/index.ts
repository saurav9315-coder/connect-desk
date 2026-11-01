import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { ENV } from "../config/env";
import { verifyAccessToken } from "../utils/token.utils";
import { prisma } from "../lib/prisma";
import { messageService } from "../services/message.service";
import { aiOrchestrator } from "../services/ai/ai.orchestrator";
import { MessageType } from "../types/enums";
import { z } from "zod";

let ioInstance: SocketIOServer | null = null;

export const getIO = (): SocketIOServer => {
  if (!ioInstance) {
    throw new Error("Socket.IO server has not been initialized yet");
  }
  return ioInstance;
};

// In-memory socket rate limiting
const userMessageRateLimits = new Map<string, number[]>();
const userTypingRateLimits = new Map<string, number>();

function checkSocketMessageRateLimit(userId: string): boolean {
  const now = Date.now();
  // Allow at most 30 messages in 10 seconds (and 120 per minute)
  const timestamps = (userMessageRateLimits.get(userId) || []).filter((t) => now - t < 10 * 1000);
  if (timestamps.length >= 30) {
    return false; // Rate limit exceeded
  }
  timestamps.push(now);
  userMessageRateLimits.set(userId, timestamps);
  return true;
}

function checkSocketTypingThrottle(userId: string, groupId: string): boolean {
  const key = `${userId}:${groupId}`;
  const now = Date.now();
  const lastTime = userTypingRateLimits.get(key) || 0;
  if (now - lastTime < 1500) {
    return false; // Throttled: at most once every 1.5 seconds
  }
  userTypingRateLimits.set(key, now);
  return true;
}

const uuidSchema = z.string().uuid();

export const initSocketServer = (httpServer: HttpServer): SocketIOServer => {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (
          !origin ||
          origin === ENV.FRONTEND_URL ||
          origin.includes("localhost") ||
          origin.includes("127.0.0.1") ||
          origin.includes("192.168.")
        ) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  ioInstance = io;

  // Handshake authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      let token = socket.handshake.auth?.token;
      if (!token && socket.handshake.headers?.authorization?.startsWith("Bearer ")) {
        token = socket.handshake.headers.authorization.split(" ")[1];
      }
      if (!token && typeof socket.handshake.query?.token === "string") {
        token = socket.handshake.query.token;
      }

      if (!token) {
        return next(new Error("Authentication token required"));
      }

      const decoded = verifyAccessToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, name: true, username: true, email: true, profileImage: true },
      });

      if (!user) {
        return next(new Error("User associated with token no longer exists"));
      }

      socket.data.user = user;
      next();
    } catch {
      return next(new Error("Invalid authentication token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user;
    if (user) {
      console.log(`[Socket.IO] Authenticated client connected: ${socket.id} (@${user.username})`);
    }

    /**
     * Join a group room (supports both "group:join" and "join_group")
     */
    const handleJoinGroup = async (data: { groupId: string }, ack?: (res: any) => void) => {
      try {
        if (!socket.data.user) {
          ack?.({ success: false, error: "Authentication required to join group" });
          return;
        }

        const { groupId } = data || {};
        if (!groupId || !uuidSchema.safeParse(groupId).success) {
          ack?.({ success: false, error: "Valid group ID is required" });
          return;
        }

        // Verify membership in database
        let membership = await prisma.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId: socket.data.user.id,
            },
          },
        });

        // If direct membership record is not found, check if the authenticated user is the group owner/creator
        if (!membership) {
          const group = await prisma.group.findUnique({
            where: { id: groupId },
            select: { id: true, ownerId: true, createdBy: true },
          });

          if (group && (group.ownerId === socket.data.user.id || group.createdBy === socket.data.user.id)) {
            membership = await prisma.groupMember.upsert({
              where: {
                groupId_userId: {
                  groupId,
                  userId: socket.data.user.id,
                },
              },
              create: {
                groupId,
                userId: socket.data.user.id,
                role: "OWNER",
              },
              update: {
                role: "OWNER",
              },
            });
          }
        }

        if (!membership) {
          ack?.({ success: false, error: "You are not a member of this group" });
          return;
        }

        socket.join(`group:${groupId}`);
        socket.join(groupId);
        ack?.({ success: true, groupId });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error joining group";
        ack?.({ success: false, error: msg });
      }
    };

    socket.on("group:join", handleJoinGroup);
    socket.on("join_group", handleJoinGroup);

    /**
     * Leave a group room (supports both "group:leave" and "leave_group")
     */
    const handleLeaveGroup = (data: { groupId: string }, ack?: (res: any) => void) => {
      if (data?.groupId && uuidSchema.safeParse(data.groupId).success) {
        socket.leave(`group:${data.groupId}`);
        socket.leave(data.groupId);
        ack?.({ success: true, groupId: data.groupId });
      }
    };

    socket.on("group:leave", handleLeaveGroup);
    socket.on("leave_group", handleLeaveGroup);

    /**
     * Send message via Socket.IO (supports both "message:send" and "send_message")
     */
    const handleSendMessage = async (
      data: {
        groupId: string;
        text?: string;
        content?: string;
        type?: any;
        fileUrl?: string;
        fileKey?: string;
        fileName?: string;
        fileSize?: number;
        mimeType?: string;
        duration?: number | null;
        fileInfo?: any;
        tempId?: string;
      },
      ack?: (res: any) => void
    ) => {
      try {
        if (!socket.data.user) {
          ack?.({ success: false, error: "Authentication required to send messages" });
          return;
        }

        // Rate limiting check
        if (!checkSocketMessageRateLimit(socket.data.user.id)) {
          ack?.({ success: false, error: "Rate limit exceeded: You are sending messages too quickly." });
          return;
        }

        const { groupId, tempId } = data || {};
        if (!groupId || !uuidSchema.safeParse(groupId).success) {
          ack?.({ success: false, error: "Valid group ID is required" });
          return;
        }

        // Verify membership
        let membership = await prisma.groupMember.findUnique({
          where: {
            groupId_userId: {
              groupId,
              userId: socket.data.user.id,
            },
          },
        });

        if (!membership) {
          const group = await prisma.group.findUnique({
            where: { id: groupId },
            select: { id: true, ownerId: true, createdBy: true },
          });

          if (group && (group.ownerId === socket.data.user.id || group.createdBy === socket.data.user.id)) {
            membership = await prisma.groupMember.upsert({
              where: {
                groupId_userId: {
                  groupId,
                  userId: socket.data.user.id,
                },
              },
              create: {
                groupId,
                userId: socket.data.user.id,
                role: "OWNER",
              },
              update: {
                role: "OWNER",
              },
            });
          }
        }

        if (!membership) {
          ack?.({ success: false, error: "You are not a member of this group" });
          return;
        }

        const textContent = (data.text !== undefined ? data.text : data.content)?.trim();
        if (!textContent && !data.fileUrl) {
          ack?.({ success: false, error: "Message text cannot be empty" });
          return;
        }

        if (textContent && textContent.length > 5000) {
          ack?.({ success: false, error: "Message cannot exceed 5000 characters" });
          return;
        }

        const validMediaTypes = ["IMAGE", "VIDEO", "FILE", "VOICE"];
        const messageType = data.fileUrl && data.type && validMediaTypes.includes(data.type)
          ? data.type
          : MessageType.TEXT;

        // Create message in database
        const message = await messageService.createMessage(groupId, socket.data.user.id, {
          text: textContent,
          content: textContent,
          type: messageType,
          fileUrl: data.fileUrl,
          fileKey: data.fileKey,
          fileName: data.fileName,
          fileSize: data.fileSize,
          mimeType: data.mimeType,
          duration: data.duration,
          fileInfo: data.fileInfo,
        });

        // Broadcast to all sockets in this group room (supports both "message:new" and "new_message")
        io.to(`group:${groupId}`).to(groupId).emit("message:new", { ...message, message, tempId });
        io.to(`group:${groupId}`).to(groupId).emit("new_message", { ...message, message, tempId });

        // Trigger AI Assistant if prompt contains @AI
        if (textContent && aiOrchestrator.isAITrigger(textContent)) {
          setImmediate(() => {
            aiOrchestrator.handleAITrigger(groupId, socket.data.user.id, textContent, message.id).catch((err) => {
              console.error("[AI Orchestrator Socket Error]", err);
            });
          });
        }

        // Return acknowledgment to sender
        ack?.({ success: true, tempId, message });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to send message";
        ack?.({ success: false, error: msg });
      }
    };

    socket.on("message:send", handleSendMessage);
    socket.on("send_message", handleSendMessage);

    /**
     * Message Delivery Receipt Handler
     */
    const handleMessageDelivered = async (
      data: { groupId: string; messageIds?: string[]; messageId?: string },
      ack?: (res: any) => void
    ) => {
      try {
        if (!socket.data.user) {
          ack?.({ success: false, error: "Authentication required" });
          return;
        }

        const { groupId } = data || {};
        if (!groupId || !uuidSchema.safeParse(groupId).success) {
          ack?.({ success: false, error: "Valid groupId is required" });
          return;
        }

        // Verify membership
        const isMember = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: socket.data.user.id } },
        });
        if (!isMember) {
          ack?.({ success: false, error: "You are not a member of this group" });
          return;
        }

        const rawIds = data.messageIds || (data.messageId ? [data.messageId] : []);
        const validIds = rawIds.filter((id) => typeof id === "string" && uuidSchema.safeParse(id).success);
        if (validIds.length === 0) {
          ack?.({ success: true, count: 0 });
          return;
        }

        const updates = await messageService.markDelivered(socket.data.user.id, validIds, groupId);
        for (const update of updates) {
          io.to(`group:${groupId}`).to(groupId).emit("message:receipt:update", update);
          io.to(`group:${groupId}`).to(groupId).emit("receipt_update", update);
        }

        ack?.({ success: true, count: updates.length });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error marking delivered";
        ack?.({ success: false, error: msg });
      }
    };

    socket.on("message:delivered", handleMessageDelivered);
    socket.on("message_delivered", handleMessageDelivered);

    /**
     * Message Read Receipt Handler
     */
    const handleMessageRead = async (
      data: { groupId: string; messageIds?: string[]; messageId?: string },
      ack?: (res: any) => void
    ) => {
      try {
        if (!socket.data.user) {
          ack?.({ success: false, error: "Authentication required" });
          return;
        }

        const { groupId } = data || {};
        if (!groupId || !uuidSchema.safeParse(groupId).success) {
          ack?.({ success: false, error: "Valid groupId is required" });
          return;
        }

        // Verify membership
        const isMember = await prisma.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: socket.data.user.id } },
        });
        if (!isMember) {
          ack?.({ success: false, error: "You are not a member of this group" });
          return;
        }

        const rawIds = data.messageIds || (data.messageId ? [data.messageId] : []);
        const validIds = rawIds.filter((id) => typeof id === "string" && uuidSchema.safeParse(id).success);
        if (validIds.length === 0) {
          ack?.({ success: true, count: 0 });
          return;
        }

        const updates = await messageService.markRead(socket.data.user.id, validIds, groupId);
        for (const update of updates) {
          io.to(`group:${groupId}`).to(groupId).emit("message:receipt:update", update);
          io.to(`group:${groupId}`).to(groupId).emit("receipt_update", update);
        }

        ack?.({ success: true, count: updates.length });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Error marking read";
        ack?.({ success: false, error: msg });
      }
    };

    socket.on("message:read", handleMessageRead);
    socket.on("message_read", handleMessageRead);

    /**
     * Typing indicators
     */
    socket.on("typing_start", (data: { groupId: string }) => {
      if (
        socket.data.user &&
        data?.groupId &&
        uuidSchema.safeParse(data.groupId).success &&
        checkSocketTypingThrottle(socket.data.user.id, data.groupId)
      ) {
        socket.to(`group:${data.groupId}`).to(data.groupId).emit("user_typing", {
          groupId: data.groupId,
          userId: socket.data.user.id,
          name: socket.data.user.name,
        });
      }
    });

    socket.on("typing_stop", (data: { groupId: string }) => {
      if (socket.data.user && data?.groupId && uuidSchema.safeParse(data.groupId).success) {
        socket.to(`group:${data.groupId}`).to(data.groupId).emit("user_stopped_typing", {
          groupId: data.groupId,
          userId: socket.data.user.id,
        });
      }
    });

    socket.on("disconnect", () => {
      // Clean disconnect
    });
  });

  return io;
};
