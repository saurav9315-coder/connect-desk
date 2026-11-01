import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { AppError } from "./error.middleware";

// In-memory buffer upload up to 50MB (max video size)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB global ceiling
  },
});

export const singleFileUpload = (fieldName = "file") => {
  const multerMiddleware = upload.single(fieldName);

  return (req: Request, res: Response, next: NextFunction) => {
    multerMiddleware(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === "LIMIT_FILE_SIZE") {
            const error: AppError = new Error("File exceeds global upload size limit of 50MB");
            error.statusCode = 413;
            error.code = "FILE_TOO_LARGE";
            return next(error);
          }
          const error: AppError = new Error(`Upload error: ${err.message}`);
          error.statusCode = 400;
          error.code = "UPLOAD_ERROR";
          return next(error);
        }
        return next(err);
      }
      next();
    });
  };
};
