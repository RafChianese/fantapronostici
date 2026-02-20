import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.string().default("development"),
  // Comma-separated allowlist of browser origins.
  // Defaults include local dev (Vite) + Capacitor WebView.
  WEB_ORIGIN: z.string().default("http://localhost:5173,https://localhost"),
  // Base URL of the web app used for OAuth redirects (e.g. https://your-app.onrender.com)
  WEB_BASE_URL: z.string().default("http://localhost:5173"),
  JWT_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default("7d"),
  DATABASE_URL: z.string().min(1),

  // football-data.org v4
  FOOTBALL_DATA_API_KEY: z.string().optional().default(""),
  SYNC_EVERY_MINUTES: z.coerce.number().int().positive().default(5),

  // API-FOOTBALL (api-football.com) v3
  API_FOOTBALL_KEY: z.string().optional().default(""),
  API_FOOTBALL_BASE_URL: z.string().optional().default("https://v3.football.api-sports.io"),
  API_FOOTBALL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  API_FOOTBALL_CACHE_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),

  // Email (SendGrid)
  SENDGRID_API_KEY: z.string().optional().default(""),
  // Email (Resend)
  RESEND_API_KEY: z.string().optional().default(""),
  EMAIL_FROM: z.string().optional().default(""),
  EMAIL_REPLY_TO: z.string().optional().default(""),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional().default(""),
  VAPID_PRIVATE_KEY: z.string().optional().default(""),

  // OAuth (Google)
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional().default(""),

  // OAuth (Microsoft)
  MICROSOFT_OAUTH_CLIENT_ID: z.string().optional().default(""),
  MICROSOFT_OAUTH_CLIENT_SECRET: z.string().optional().default(""),
  MICROSOFT_OAUTH_TENANT: z.string().optional().default("common"),
});


export const env = EnvSchema.parse(process.env);
