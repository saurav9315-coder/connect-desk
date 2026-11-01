import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { IStorageService, StorageFileStream, StorageUploadResult } from "./storage.interface";
import { AppError } from "../../middlewares/error.middleware";

export class LocalStorageService implements IStorageService {
  private baseDir: string;

  constructor(customBaseDir?: string) {
    this.baseDir = customBaseDir || path.resolve(process.cwd(), "uploads");
  }

  /**
   * Resolve safe group directory
   */
  private getGroupDir(groupId: string): string {
    const safeGroupId = path.basename(groupId);
    const allowedRoot = path.resolve(this.baseDir, "groups");
    const resolvedDir = path.resolve(allowedRoot, safeGroupId);
    if (!resolvedDir.startsWith(allowedRoot)) {
      const err: AppError = new Error("Invalid storage group path traversal attempt");
      err.statusCode = 400;
      err.code = "INVALID_PATH";
      throw err;
    }
    return resolvedDir;
  }

  /**
   * Resolve safe file path
   */
  private getFilePath(groupId: string, fileKey: string): string {
    const groupDir = this.getGroupDir(groupId);
    const safeKey = path.basename(fileKey);
    const resolvedPath = path.resolve(groupDir, safeKey);
    if (!resolvedPath.startsWith(groupDir)) {
      const err: AppError = new Error("Invalid storage file path traversal attempt");
      err.statusCode = 400;
      err.code = "INVALID_PATH";
      throw err;
    }
    return resolvedPath;
  }

  /**
   * Save a file buffer to local disk
   */
  async saveFile(
    buffer: Buffer,
    fileKey: string,
    mimeType: string,
    groupId: string
  ): Promise<StorageUploadResult> {
    const groupDir = this.getGroupDir(groupId);
    await fs.promises.mkdir(groupDir, { recursive: true });

    const filePath = this.getFilePath(groupId, fileKey);
    await fs.promises.writeFile(filePath, buffer);

    return {
      fileKey,
      fileUrl: this.getFileUrl(fileKey, groupId),
      fileName: fileKey,
      fileSize: buffer.length,
      mimeType,
    };
  }

  /**
   * Get file stream for read/streaming, supporting HTTP Range requests
   */
  async getFileStream(
    fileKey: string,
    groupId: string,
    start?: number,
    end?: number
  ): Promise<StorageFileStream> {
    const filePath = this.getFilePath(groupId, fileKey);

    try {
      const stats = await fs.promises.stat(filePath);

      let stream: Readable;
      if (start !== undefined && end !== undefined) {
        stream = fs.createReadStream(filePath, { start, end });
      } else if (start !== undefined) {
        stream = fs.createReadStream(filePath, { start });
      } else {
        stream = fs.createReadStream(filePath);
      }

      return {
        stream,
        size: stats.size,
      };
    } catch (err: any) {
      if (err.code === "ENOENT") {
        const error: AppError = new Error("File not found");
        error.statusCode = 404;
        error.code = "NOT_FOUND";
        throw error;
      }
      throw err;
    }
  }

  /**
   * Delete file from local disk
   */
  async deleteFile(fileKey: string, groupId: string): Promise<void> {
    const filePath = this.getFilePath(groupId, fileKey);
    try {
      await fs.promises.unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") {
        throw err;
      }
    }
  }

  /**
   * Return relative API endpoint URL
   */
  getFileUrl(fileKey: string, groupId: string): string {
    const safeKey = encodeURIComponent(path.basename(fileKey));
    return `/api/groups/${groupId}/files/${safeKey}`;
  }
}
