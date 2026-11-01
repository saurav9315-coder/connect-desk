import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { messageService } from "../services/message.service";
import { aiOrchestrator } from "../services/ai/ai.orchestrator";
import { getIO } from "../socket";

const sendMessageSchema = z
  .object({
    text: z.string().trim().max(5000, "Message cannot exceed 5000 characters").optional(),
    content: z.string().trim().max(5000, "Message cannot exceed 5000 characters").optional(),
    type: z.enum(["TEXT", "IMAGE", "VIDEO", "FILE", "VOICE"]).optional().default("TEXT"),
    fileUrl: z.string().url("fileUrl must be a valid URL").optional().or(z.literal("")),
    fileKey: z
      .string()
      .regex(/^[0-9]+-[a-f0-9]+(\.[a-zA-Z0-9]+)?$/, "Invalid fileKey format")
      .optional()
      .or(z.literal("")),
    fileName: z.string().max(255).optional().or(z.literal("")),
    fileSize: z.number().int().nonnegative().max(52428800).optional(),
    mimeType: z.string().max(100).optional().or(z.literal("")),
    duration: z.number().nonnegative().nullable().optional(),
    fileInfo: z.record(z.unknown()).optional(),
    tempId: z.string().max(100).optional(),
  })
  .refine(
    (data) => {
      const textVal = (data.text !== undefined ? data.text : data.content)?.trim();
      return Boolean(textVal || data.fileUrl);
    },
    { message: "Message text cannot be empty", path: ["text"] }
  );

export class MessageController {
  /**
   * GET /api/groups/:groupId/messages
   */
  async getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const cursor = req.query.cursor as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      const result = await messageService.getMessages(groupId, req.user!.id, cursor, limit);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/groups/:groupId/messages
   */
  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const parsed = sendMessageSchema.safeParse(req.body);
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

      const text = (parsed.data.text !== undefined ? parsed.data.text : parsed.data.content)?.trim();

      const message = await messageService.createMessage(groupId, req.user!.id, {
        text,
        content: text,
        type: parsed.data.type || "TEXT",
        fileUrl: parsed.data.fileUrl || undefined,
        fileKey: parsed.data.fileKey || undefined,
        fileName: parsed.data.fileName || undefined,
        fileSize: parsed.data.fileSize || undefined,
        mimeType: parsed.data.mimeType || undefined,
        duration: parsed.data.duration ?? undefined,
        fileInfo: parsed.data.fileInfo,
      });

      // Broadcast via Socket.IO
      const tempId = parsed.data.tempId || (typeof req.body.tempId === "string" ? req.body.tempId : undefined);
      try {
        const io = getIO();
        io.to(`group:${groupId}`).to(groupId).emit("message:new", { ...message, message, tempId });
        io.to(`group:${groupId}`).to(groupId).emit("new_message", { ...message, message, tempId });
      } catch (ioErr) {
        // Socket.IO may not be initialized in isolated tests
      }

      // Check and handle @AI Assistant trigger asynchronously
      if (text && aiOrchestrator.isAITrigger(text)) {
        setImmediate(() => {
          aiOrchestrator.handleAITrigger(groupId, req.user!.id, text, message.id).catch((err) => {
            console.error("[AI Orchestrator REST Error]", err);
          });
        });
      }

      res.status(201).json({
        success: true,
        message: "Message sent successfully",
        data: {
          ...message,
          message,
          tempId,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/groups/:groupId/messages/delivered
   */
  async acknowledgeDelivered(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const messageIds = Array.isArray(req.body.messageIds)
        ? req.body.messageIds
        : req.body.messageId
        ? [req.body.messageId]
        : [];

      const updates = await messageService.markDelivered(req.user!.id, messageIds, groupId);
      try {
        const io = getIO();
        for (const update of updates) {
          io.to(`group:${groupId}`).to(groupId).emit("message:receipt:update", update);
          io.to(`group:${groupId}`).to(groupId).emit("receipt_update", update);
        }
      } catch {}

      res.status(200).json({
        success: true,
        data: { updatedCount: updates.length, updates },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/groups/:groupId/messages/read
   */
  async acknowledgeRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId } = req.params;
      const messageIds = Array.isArray(req.body.messageIds)
        ? req.body.messageIds
        : req.body.messageId
        ? [req.body.messageId]
        : [];

      const updates = await messageService.markRead(req.user!.id, messageIds, groupId);
      try {
        const io = getIO();
        for (const update of updates) {
          io.to(`group:${groupId}`).to(groupId).emit("message:receipt:update", update);
          io.to(`group:${groupId}`).to(groupId).emit("receipt_update", update);
        }
      } catch {}

      res.status(200).json({
        success: true,
        data: { updatedCount: updates.length, updates },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const messageController = new MessageController();
