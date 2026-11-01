import express from "express";
import cors from "cors";
import helmet from "helmet";
import { ENV } from "./config/env";
import { apiRouter } from "./routes";
import { notFoundMiddleware } from "./middleware/notFound.middleware";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

// Security headers
app.use(
  helmet({
    frameguard: { action: "deny" },
    noSniff: true,
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

// CORS configuration
app.use(
  cors({
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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Request body parsing
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// API Routes
app.use("/api", apiRouter);

// 404 Not Found Middleware
app.use(notFoundMiddleware);

// Centralized Error Handling Middleware
app.use(errorMiddleware);

export { app };
