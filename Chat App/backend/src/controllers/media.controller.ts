import { Request, Response, NextFunction } from "express";
import path from "path";
import { prisma } from "../lib/prisma";
import { AppError } from "../middlewares/error.middleware";
import { StorageFactory } from "../services/storage/storage.factory";
import { validateFile } from "../utils/fileValidation";
import { getIO } from "../socket";
import { computeMessageStatus } from "../services/message.service";

interface CachedUpload {
  timestamp: number;
  data: any;
}
const recentUploadsCache = new Map<string, CachedUpload>();

export class MediaController {
  private storage = StorageFactory.getStorage();

  /**
   * Upload attachment (Image, Video, Document, Voice) for a group and create message
   * POST /api/groups/:groupId/attachments
   * POST /api/groups/:groupId/upload
   */
  async uploadAttachment(req: Request, res: Response, next: NextFunction): Promise<void> {
    let savedFileKey: string | null = null;
    let targetGroupId: string | null = null;

    try {
      const { groupId } = req.params;
      targetGroupId = groupId;
      const userId = req.user?.id;

      if (!userId) {
        const error: AppError = new Error("Authentication required");
        error.statusCode = 401;
        error.code = "UNAUTHORIZED";
        throw error;
      }

      // Check deduplication if tempId provided
      const tempId = typeof req.body.tempId === "string" ? req.body.tempId : undefined;
      if (tempId && recentUploadsCache.has(tempId)) {
        const cached = recentUploadsCache.get(tempId)!;
        if (Date.now() - cached.timestamp < 60000) {
          res.status(200).json({
            success: true,
            data: cached.data,
            isDuplicate: true,
          });
          return;
        }
      }

      // 1. Verify caller is a member of the group
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId, userId },
        },
      });

      if (!membership) {
        const error: AppError = new Error("You are not a member of this group");
        error.statusCode = 403;
        error.code = "FORBIDDEN";
        throw error;
      }

      // 2. Validate uploaded file
      if (!req.file) {
        const error: AppError = new Error("No file provided");
        error.statusCode = 400;
        error.code = "FILE_MISSING";
        throw error;
      }

      const category = typeof req.body.category === "string" ? req.body.category : undefined;
      const validated = validateFile(req.file, category);
      savedFileKey = validated.safeKey;

      // Parse and validate duration (e.g. for video or voice)
      let duration: number | null = null;
      if (req.body.duration !== undefined && req.body.duration !== null && req.body.duration !== "") {
        const parsed = parseFloat(req.body.duration);
        if (isNaN(parsed) || parsed < 0) {
          const error: AppError = new Error("Invalid duration value");
          error.statusCode = 400;
          error.code = "INVALID_DURATION";
          throw error;
        }

        // Voice duration constraints per PRD Section 14
        if (validated.type === "VOICE" || category === "VOICE") {
          if (parsed < 0.5) {
            const error: AppError = new Error("Voice recording is too short (minimum duration is 0.5 seconds)");
            error.statusCode = 400;
            error.code = "VOICE_TOO_SHORT";
            throw error;
          }
          if (parsed > 300) {
            const error: AppError = new Error("Voice recording exceeds maximum duration of 300 seconds (5 minutes)");
            error.statusCode = 400;
            error.code = "VOICE_TOO_LONG";
            throw error;
          }
        }
        duration = parsed;
      }

      // 3. Save file to storage abstraction
      let uploadResult;
      try {
        uploadResult = await this.storage.saveFile(
          req.file.buffer,
          validated.safeKey,
          validated.mimeType,
          groupId
        );
      } catch (storageErr) {
        const error: AppError = new Error("Failed to store uploaded file");
        error.statusCode = 502;
        error.code = "STORAGE_ERROR";
        throw error;
      }

      // 4. Save message and attachment metadata in database
      const rawText = (req.body.text || req.body.content || req.body.caption || "").toString().trim();

      // Retrieve all group members to generate delivery/read receipts
      const members = await prisma.groupMember.findMany({
        where: { groupId },
        select: { userId: true },
      });
      const recipientUserIds = members.map((m) => m.userId).filter((id) => id !== userId);

      let message;
      try {
        message = await prisma.$transaction(async (tx) => {
          const createdMsg = await tx.message.create({
            data: {
              groupId,
              senderId: userId,
              type: validated.type,
              text: rawText || null,
              content: rawText || null,
              fileUrl: uploadResult.fileUrl,
              fileKey: validated.safeKey,
              fileName: validated.sanitizedOriginalName,
              fileSize: validated.fileSize,
              mimeType: validated.mimeType,
              duration,
            },
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  profileImage: true,
                },
              },
            },
          });

          let receipts: Array<{ id: string; userId: string; deliveredAt: Date | null; readAt: Date | null }> = [];
          const receiptDb = (tx as any).messageReceipt;
          if (recipientUserIds.length > 0 && receiptDb) {
            await receiptDb.createMany({
              data: recipientUserIds.map((rId) => ({
                messageId: createdMsg.id,
                userId: rId,
                deliveredAt: null,
                readAt: null,
              })),
            });

            receipts = await receiptDb.findMany({
              where: { messageId: createdMsg.id },
              select: { id: true, userId: true, deliveredAt: true, readAt: true },
            });
          }

          // Touch group updatedAt
          await tx.group.update({
            where: { id: groupId },
            data: { updatedAt: new Date() },
          });

          return {
            ...createdMsg,
            receipts,
          };
        });
      } catch (dbErr) {
        // Safe cleanup: Delete uploaded file from storage if DB save fails
        if (savedFileKey && targetGroupId) {
          try {
            await this.storage.deleteFile(savedFileKey, targetGroupId);
          } catch (delErr) {
            console.error("[Storage] Failed to cleanup orphaned file:", delErr);
          }
        }
        throw dbErr;
      }

      const status = computeMessageStatus(message.receipts);
      const formattedMessage = {
        id: message.id,
        groupId: message.groupId,
        senderId: message.senderId,
        sender: message.sender,
        type: message.type,
        text: message.text,
        content: message.content,
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
        receipts: message.receipts?.map((r) => ({
          userId: r.userId,
          deliveredAt: r.deliveredAt,
          readAt: r.readAt,
        })) || [],
      };

      // 5. Broadcast message to group room via Socket.IO
      try {
        const io = getIO();
        io.to(`group:${groupId}`).to(groupId).emit("message:new", { ...formattedMessage, message: formattedMessage, tempId });
        io.to(`group:${groupId}`).to(groupId).emit("new_message", { ...formattedMessage, message: formattedMessage, tempId });
      } catch (ioErr) {
        // Socket.IO may not be active in isolated unit test sessions
      }

      // 6. Return response
      const responsePayload = {
        message: formattedMessage,
        tempId,
        attachment: {
          id: message.id,
          messageId: message.id,
          fileName: validated.sanitizedOriginalName,
          fileKey: validated.safeKey,
          fileUrl: uploadResult.fileUrl,
          fileSize: validated.fileSize,
          mimeType: validated.mimeType,
          type: validated.type,
          createdAt: message.createdAt,
        },
        fileKey: validated.safeKey,
        fileUrl: uploadResult.fileUrl,
        fileName: validated.sanitizedOriginalName,
        fileSize: validated.fileSize,
        mimeType: validated.mimeType,
        duration,
        type: validated.type,
      };

      if (tempId) {
        recentUploadsCache.set(tempId, {
          timestamp: Date.now(),
          data: responsePayload,
        });
      }

      res.status(201).json({
        success: true,
        data: responsePayload,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Alias for backward compatibility
   */
  async uploadMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
    return this.uploadAttachment(req, res, next);
  }

  /**
   * Stream or download a private group file with membership authorization
   * GET /api/groups/:groupId/files/:fileKey
   * GET /api/groups/:groupId/attachments/:fileKey
   */
  async serveGroupFile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { groupId, fileKey } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        const error: AppError = new Error("Authentication required");
        error.statusCode = 401;
        error.code = "UNAUTHORIZED";
        throw error;
      }

      // 1. Verify caller is a member of the group
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId, userId },
        },
      });

      if (!membership) {
        const error: AppError = new Error("You do not have access to this group's files");
        error.statusCode = 403;
        error.code = "FORBIDDEN";
        throw error;
      }

      // 2. Sanitize file key against path traversal
      const safeKey = path.basename(fileKey);

      // 3. Verify message and file exist within this group
      const message = await prisma.message.findFirst({
        where: {
          groupId,
          fileKey: safeKey,
        },
        select: {
          fileName: true,
          mimeType: true,
        },
      });

      if (!message) {
        const error: AppError = new Error("File not found in this group");
        error.statusCode = 404;
        error.code = "NOT_FOUND";
        throw error;
      }

      const mimeType = message.mimeType || "application/octet-stream";
      const originalFileName = message.fileName || safeKey;

      // 4. Check for HTTP Range header (for video & audio streaming / seeking)
      const range = req.headers.range;

      if (range) {
        const fullFile = await this.storage.getFileStream(safeKey, groupId);
        const totalSize = fullFile.size;

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

        if (start >= totalSize || end >= totalSize) {
          res
            .status(416)
            .set({
              "Content-Range": `bytes */${totalSize}`,
            })
            .end();
          return;
        }

        const chunksize = end - start + 1;
        const partialFile = await this.storage.getFileStream(safeKey, groupId, start, end);

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${totalSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize,
          "Content-Type": mimeType,
        });

        partialFile.stream.pipe(res);
      } else {
        const fileStreamData = await this.storage.getFileStream(safeKey, groupId);

        const isDownload = req.query.download === "true";
        const disposition = isDownload
          ? `attachment; filename="${encodeURIComponent(originalFileName)}"`
          : "inline";

        res.writeHead(200, {
          "Content-Length": fileStreamData.size,
          "Content-Type": mimeType,
          "Accept-Ranges": "bytes",
          "Content-Disposition": disposition,
          // Cache private group media securely in client memory
          "Cache-Control": "private, max-age=3600",
        });

        fileStreamData.stream.pipe(res);
      }
    } catch (error) {
      next(error);
    }
  }
}

export const mediaController = new MediaController();
