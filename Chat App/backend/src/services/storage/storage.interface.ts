import { Readable } from "stream";

export interface StorageUploadResult {
  fileKey: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  duration?: number | null;
}

export interface StorageFileStream {
  stream: Readable;
  size: number;
  mimeType?: string;
}

export interface IStorageService {
  /**
   * Save a file buffer to storage
   */
  saveFile(
    buffer: Buffer,
    fileKey: string,
    mimeType: string,
    groupId: string
  ): Promise<StorageUploadResult>;

  /**
   * Stream a file from storage, supporting optional range requests
   */
  getFileStream(
    fileKey: string,
    groupId: string,
    start?: number,
    end?: number
  ): Promise<StorageFileStream>;

  /**
   * Delete a file from storage
   */
  deleteFile(fileKey: string, groupId: string): Promise<void>;

  /**
   * Get the relative or absolute API URL for the file
   */
  getFileUrl(fileKey: string, groupId: string): string;
}
