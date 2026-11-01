import path from "path";
import crypto from "crypto";
import { AppError } from "../middlewares/error.middleware";
import { MessageType } from "../types/enums";

// Blacklisted dangerous file extensions
const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bash", ".php", ".phtml", ".php3", ".php4", ".php5",
  ".js", ".mjs", ".ts", ".py", ".pl", ".cgi", ".msi", ".dll", ".vbs", ".ps1", ".scr",
  ".jar", ".apk", ".com", ".hta", ".jsp", ".asp", ".aspx", ".reg", ".vbe", ".wsf"
]);

export interface CategoryRule {
  type: MessageType;
  maxSize: number; // in bytes
  allowedExtensions: string[];
  allowedMimes: string[];
}

export const CATEGORY_RULES: Record<string, CategoryRule> = {
  IMAGE: {
    type: MessageType.IMAGE,
    maxSize: 10 * 1024 * 1024, // 10MB
    allowedExtensions: [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"],
    allowedMimes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  },
  VIDEO: {
    type: MessageType.VIDEO,
    maxSize: 50 * 1024 * 1024, // 50MB
    allowedExtensions: [".mp4", ".webm", ".ogg", ".mov", ".mkv"],
    allowedMimes: ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-matroska"],
  },
  VOICE: {
    type: MessageType.VOICE,
    maxSize: 15 * 1024 * 1024, // 15MB
    allowedExtensions: [".webm", ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".opus"],
    allowedMimes: [
      "audio/webm",
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/ogg",
      "audio/x-m4a",
      "audio/aac",
      "audio/opus",
      "audio/mp4",
    ],
  },
  FILE: {
    type: MessageType.FILE,
    maxSize: 25 * 1024 * 1024, // 25MB
    allowedExtensions: [
      ".pdf",
      ".txt",
      ".csv",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".zip",
      ".tar",
      ".gz",
      ".json",
      ".md",
    ],
    allowedMimes: [
      "application/pdf",
      "text/plain",
      "text/csv",
      "application/zip",
      "application/x-zip-compressed",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/json",
      "text/markdown",
      "application/octet-stream",
    ],
  },
};

export interface ValidatedFile {
  type: MessageType;
  safeKey: string;
  sanitizedOriginalName: string;
  mimeType: string;
  fileSize: number;
}

/**
 * Sanitize untrusted original filename
 */
export function sanitizeFileName(name: string): string {
  // Strip paths, null bytes, and non-printable characters
  const base = path.basename(name).replace(/\0/g, "");
  // Replace illegal filesystem characters with underscore
  const sanitized = base.replace(/[/\\?%*:|"<>]/g, "_").trim();
  return sanitized.length > 200 ? sanitized.substring(0, 200) : sanitized || "attachment";
}

/**
 * Inspect file buffer header / magic bytes to detect spoofed MIME types and executables
 */
export function verifyMagicBytes(buffer: Buffer, ext: string, mime: string): boolean {
  if (!buffer || buffer.length < 2) return true;

  // 1. Permanent rejection of executable / script signatures
  // Windows PE executable / DLL ('MZ' -> 0x4D 0x5A)
  if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return false;
  }
  // Linux ELF executable (\x7fELF -> 0x7F 0x45 0x4C 0x46)
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return false;
  }
  // Shell script shebang ('#!' -> 0x23 0x21)
  if (buffer[0] === 0x23 && buffer[1] === 0x21) {
    return false;
  }
  // Embedded PHP script execution tags
  const headerPreview = buffer.slice(0, 100).toString("utf8").toLowerCase();
  if (headerPreview.includes("<?php") || headerPreview.includes("<?=")) {
    return false;
  }

  // 2. Specific magic byte verification for common formats
  if (ext === ".png" || mime === "image/png") {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (ext === ".jpg" || ext === ".jpeg" || mime === "image/jpeg") {
    if (buffer.length < 3) return false;
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (ext === ".gif" || mime === "image/gif") {
    if (buffer.length < 4) return false;
    return buffer.slice(0, 4).toString("ascii") === "GIF8";
  }

  if (ext === ".pdf" || mime === "application/pdf") {
    if (buffer.length < 5) return false;
    return buffer.slice(0, 5).toString("ascii").startsWith("%PDF");
  }

  return true;
}

/**
 * Validate uploaded file strictly against MIME, extension, size, and blacklist
 */
export function validateFile(
  file: Express.Multer.File,
  requestedCategory?: string
): ValidatedFile {
  if (!file || !file.buffer || file.buffer.length === 0 || file.size === 0) {
    const error: AppError = new Error("File is empty (0 bytes)");
    error.statusCode = 400;
    error.code = "FILE_EMPTY";
    throw error;
  }

  const sanitizedOriginalName = sanitizeFileName(file.originalname || "attachment");
  const ext = path.extname(sanitizedOriginalName).toLowerCase();
  const rawMime = (file.mimetype || "").toLowerCase().trim();

  // 1. Check dangerous blacklist immediately
  if (DANGEROUS_EXTENSIONS.has(ext)) {
    const error: AppError = new Error(`Dangerous file type '${ext}' is strictly prohibited`);
    error.statusCode = 400;
    error.code = "DANGEROUS_FILE_TYPE";
    throw error;
  }

  // 2. Inspect magic bytes and headers
  const isHeaderValid = verifyMagicBytes(file.buffer, ext, rawMime);
  if (!isHeaderValid) {
    const error: AppError = new Error(
      "File content does not match expected format or contains prohibited executable header"
    );
    error.statusCode = 400;
    error.code = "MALICIOUS_OR_CORRUPT_FILE";
    throw error;
  }


  // 2. Identify target category
  let matchedRule: CategoryRule | null = null;
  let categoryKey = (requestedCategory || "").toUpperCase();

  // Map "AUDIO" to "VOICE"
  if (categoryKey === "AUDIO") categoryKey = "VOICE";

  if (categoryKey && CATEGORY_RULES[categoryKey]) {
    matchedRule = CATEGORY_RULES[categoryKey];
  } else {
    // Auto-detect category based on MIME and extension
    if (rawMime.startsWith("image/") || CATEGORY_RULES.IMAGE.allowedExtensions.includes(ext)) {
      matchedRule = CATEGORY_RULES.IMAGE;
    } else if (rawMime.startsWith("video/") || CATEGORY_RULES.VIDEO.allowedExtensions.includes(ext)) {
      matchedRule = CATEGORY_RULES.VIDEO;
    } else if (rawMime.startsWith("audio/") || CATEGORY_RULES.VOICE.allowedExtensions.includes(ext)) {
      matchedRule = CATEGORY_RULES.VOICE;
    } else {
      matchedRule = CATEGORY_RULES.FILE;
    }
  }

  // 3. Verify extension is allowed in the matched rule
  const isExtAllowed = matchedRule.allowedExtensions.includes(ext);
  const isMimeAllowed = matchedRule.allowedMimes.includes(rawMime);

  // If both extension and MIME mismatch, reject
  if (!isExtAllowed && !isMimeAllowed) {
    const error: AppError = new Error(
      `File extension '${ext}' or MIME type '${rawMime}' is not permitted for category ${matchedRule.type}`
    );
    error.statusCode = 400;
    error.code = "INVALID_FILE_TYPE";
    throw error;
  }

  // 4. Verify file size
  if (file.size > matchedRule.maxSize) {
    const maxMb = Math.round(matchedRule.maxSize / (1024 * 1024));
    const error: AppError = new Error(
      `File size (${(file.size / (1024 * 1024)).toFixed(2)} MB) exceeds maximum permitted size of ${maxMb} MB for ${matchedRule.type}`
    );
    error.statusCode = 413;
    error.code = "FILE_TOO_LARGE";
    throw error;
  }

  // 5. Generate secure, collision-free key (UUID + clean extension)
  const safeExt = ext || (matchedRule.allowedExtensions[0] ?? ".bin");
  const randomSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const safeKey = `${Date.now()}-${randomSuffix}${safeExt}`;

  // Normalized MIME type
  const normalizedMime = isMimeAllowed ? rawMime : (matchedRule.allowedMimes[0] ?? "application/octet-stream");

  return {
    type: matchedRule.type,
    safeKey,
    sanitizedOriginalName,
    mimeType: normalizedMime,
    fileSize: file.size,
  };
}
