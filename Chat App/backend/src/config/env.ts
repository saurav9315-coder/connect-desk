import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL must be specified"),
  FRONTEND_URL: z.string().default(process.env.CLIENT_ORIGIN || "http://localhost:3000"),
  CLIENT_ORIGIN: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().default("dev-insecure-jwt-access-key-only-for-local-testing-32-chars"),
  JWT_ACCESS_EXPIRES_IN: z.string().default("15m"),
  JWT_REFRESH_SECRET: z.string().default("dev-insecure-jwt-refresh-key-only-for-local-testing-32-chars"),
  JWT_REFRESH_EXPIRES_IN: z.string().default("7d"),
  STORAGE_PROVIDER: z.string().default("local"),
  UPLOAD_DIR: z.string().default("./uploads"),
  AI_PROVIDER: z.string().default("mock"),
  GEMINI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ FATAL: Environment variable validation failed:");
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const ENV = parsedEnv.data;
