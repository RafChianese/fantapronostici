import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./lib/env.js";
import { apiRouter } from "./routes/index.js";
import { startScheduler } from "./jobs/syncJob.js";
import { bootstrapDefaults } from "./bootstrapDefaults.js";

const app = express();
// Needed on Render / reverse proxies so req.protocol uses X-Forwarded-Proto.
app.set("trust proxy", 1);
app.use(helmet());
// CORS
// WEB_ORIGIN can be a comma-separated allowlist.
// Example: WEB_ORIGIN=https://fantapronosticiapp.it,https://www.fantapronosticiapp.it
// Always allow local dev + Capacitor origins.
const allowedOrigins = new Set(
  (env.WEB_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);

// If you provide only one of the two, automatically allow both apex and www.
// Example: https://www.example.com -> also allow https://example.com (same scheme), and vice versa.
for (const origin of Array.from(allowedOrigins)) {
  try {
    const u = new URL(origin);
    if (u.hostname.startsWith("www.")) {
      allowedOrigins.add(`${u.protocol}//${u.hostname.replace(/^www\./, "")}`);
    } else {
      allowedOrigins.add(`${u.protocol}//www.${u.hostname}`);
    }
  } catch {
    // ignore invalid origin strings
  }
}

allowedOrigins.add("http://localhost:5173");
allowedOrigins.add("https://localhost");
allowedOrigins.add("http://localhost");
allowedOrigins.add("capacitor://localhost");

const corsOptions: import("cors").CorsOptions = {
  origin: (origin, cb) => {
    // Allow non-browser clients (no Origin header)
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // IMPORTANT: include custom headers used by the frontend (triggers preflight)
  allowedHeaders: ["Content-Type", "Authorization", "X-League-Id"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// Handle preflight for all routes
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", apiRouter);

// Serve built web app in production (optional local production)
if (env.NODE_ENV === "production") {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const webDist = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

app.use((err: any, _req: any, res: any, _next: any) => {
  // Zod validation errors => 400 (avoid crashing client with non-JSON bodies)
  if (err?.name === "ZodError") {
    const issues = Array.isArray(err.issues) ? err.issues : [];
    const message = issues[0]?.message || "Dati non validi";
    return res.status(400).json({ message, issues });
  }
  const status = err?.status || 500;
  if (err?.body) return res.status(status).json(err.body);
  return res.status(status).json({ message: err?.message || "Server error" });
});

app.listen(env.PORT, () => {
  console.log(`✅ API listening on http://localhost:${env.PORT}`);
  // Ensure default users/league/config exist so login always works after a fresh DB push.
  bootstrapDefaults().catch((e) => console.error("Bootstrap error:", e));
  startScheduler();
});
