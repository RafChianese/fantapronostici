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
app.use(helmet());
// CORS
// WEB_ORIGIN can be a comma-separated allowlist (useful for prod web domains too).
// Always allow local dev + Capacitor origins.
const allowedOrigins = new Set(
  (env.WEB_ORIGIN || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
);
allowedOrigins.add("http://localhost:5173");
allowedOrigins.add("https://localhost");
allowedOrigins.add("http://localhost");
allowedOrigins.add("capacitor://localhost");

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow non-browser clients (no Origin header)
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
  })
);
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
