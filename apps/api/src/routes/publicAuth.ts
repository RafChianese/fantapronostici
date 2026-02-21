import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { env } from "../lib/env.js";
// Email flows are temporarily disabled (no paid provider required).
// import { sendEmail } from "../services/email.js";

export const authRouter = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = LoginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.status(401).json({ message: "Credenziali non valide" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Credenziali non valide" });

  const token = signToken({ sub: user.id });
  return res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, globalRole: user.globalRole } });
});

// Optional self-register (can be disabled by admin by simply not using it in UI)
const RegisterSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(50),
  password: z.string().min(8),
});

authRouter.post("/register", async (req, res) => {
  const { email, displayName, password } = RegisterSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ message: "Email già registrata" });

  // Enforce unique display name so league member display names can't collide.
  const existingName = await prisma.user.findUnique({ where: { displayName } });
  if (existingName) return res.status(400).json({ message: "Nome visualizzato già in uso" });

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await prisma.user.create({
      // Email verification is temporarily bypassed.
      data: { email, displayName, passwordHash, globalRole: "USER", isActive: true, ...({ emailVerifiedAt: new Date() } as any) },
    });
  } catch (e: any) {
    // Prisma unique constraint (race condition safe)
    if (e?.code === "P2002") {
      const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : String(e?.meta?.target || "");
      if (target.includes("email")) return res.status(400).json({ message: "Email già registrata" });
      if (target.includes("displayName")) return res.status(400).json({ message: "Nome visualizzato già in uso" });
      return res.status(400).json({ message: "Dati già presenti" });
    }
    throw e;
  }

  const token = signToken({ sub: user.id });
  return res.status(201).json({
    ok: true,
    requiresVerification: false,
    email,
    token,
    user: { id: user.id, email: user.email, displayName: user.displayName, globalRole: user.globalRole },
  });
});

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

authRouter.post("/verify-email", async (req, res) => {
  VerifyEmailSchema.parse(req.body);
  return res.status(410).json({ message: "Verifica email temporaneamente disattivata" });
});

const ResendSchema = z.object({ email: z.string().email() });

authRouter.post("/resend-verification", async (req, res) => {
  ResendSchema.parse(req.body);
  return res.status(410).json({ message: "Verifica email temporaneamente disattivata" });
});

// Password reset (email-based)
const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

authRouter.post("/forgot-password", async (req, res) => {
  ForgotPasswordSchema.parse(req.body);
  return res.status(410).json({ message: "Recupero password via email temporaneamente disattivato" });
});

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

authRouter.post("/reset-password", async (req, res) => {
  ResetPasswordSchema.parse(req.body);
  return res.status(410).json({ message: "Recupero password via email temporaneamente disattivato" });
});

// -------- OAuth (Google / Microsoft) --------

const OauthStartSchema = z.object({
  returnTo: z.string().optional(),
});

function signOauthState(payload: object) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "10m" });
}

function verifyOauthState(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as any;
}

function getApiBase(req: any) {
  return `${req.protocol}://${req.get("host")}`;
}

function normalizeReturnTo(input: string) {
  // Some static hosts expose the SPA at /index.html; we always want an app base URL.
  let s = String(input || "").trim();
  if (!s) return env.WEB_BASE_URL;
  // Drop trailing index.html
  s = s.replace(/\/index\.html\/?$/i, "");
  // Drop trailing slash
  s = s.replace(/\/$/, "");
  return s;
}

async function ensureUniqueDisplayName(base: string) {
  const normalized = base.trim().slice(0, 30) || "utente";
  let candidate = normalized;
  for (let i = 0; i < 10; i++) {
    const exists = await prisma.user.findUnique({ where: { displayName: candidate } });
    if (!exists) return candidate;
    candidate = `${normalized}-${Math.floor(Math.random() * 9999)}`;
  }
  return `${normalized}-${crypto.randomInt(10000, 99999)}`;
}

async function upsertOAuthUser(params: {
  provider: "GOOGLE" | "MICROSOFT";
  providerUserId: string;
  email?: string | null;
  displayName?: string | null;
}) {
  const { provider, providerUserId, email, displayName } = params;

  const existingAccount = await prisma.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider: provider as any, providerUserId } },
    include: { user: true },
  });
  if (existingAccount?.user) return existingAccount.user;

  let user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user) {
    const baseName = displayName || (email ? email.split("@")[0] : "utente");
    const uniqueName = await ensureUniqueDisplayName(baseName);
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    user = await prisma.user.create({
      data: {
        email: email || `${provider.toLowerCase()}_${providerUserId}@local.invalid`,
        displayName: uniqueName,
        passwordHash,
        globalRole: "USER",
        isActive: true,
        ...({ emailVerifiedAt: new Date() } as any),
      },
    });
  }

  await prisma.oAuthAccount.create({
    data: {
      provider: provider as any,
      providerUserId,
      email: email || null,
      userId: user.id,
    },
  });

  return user;
}

authRouter.get("/oauth/google/start", async (req, res) => {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return res.status(500).send("Google OAuth non configurato");
  }
  const { returnTo } = OauthStartSchema.parse(req.query);
  const state = signOauthState({ provider: "GOOGLE", returnTo: returnTo || env.WEB_BASE_URL });
  const redirectUri = `${getApiBase(req)}/api/auth/oauth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return res.redirect(url.toString());
});

authRouter.get("/oauth/google/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const stateToken = String(req.query.state || "");
    if (!code || !stateToken) return res.status(400).send("OAuth callback non valido");
    const state = verifyOauthState(stateToken);
    const redirectUri = `${getApiBase(req)}/api/auth/oauth/google/callback`;

    const body = new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) return res.status(400).send("OAuth token exchange fallito");
    const tokenJson: any = await tokenRes.json();
    const accessToken = tokenJson.access_token as string;

    const userinfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!userinfoRes.ok) return res.status(400).send("OAuth userinfo fallito");
    const u: any = await userinfoRes.json();

    const user = await upsertOAuthUser({
      provider: "GOOGLE",
      providerUserId: String(u.sub),
      email: u.email,
      displayName: u.name,
    });

    const token = signToken({ sub: user.id });
    const dest = `${normalizeReturnTo(state.returnTo || env.WEB_BASE_URL)}/oauth/callback#token=${encodeURIComponent(token)}`;
    return res.redirect(dest);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[oauth] google callback error", e);
    return res.status(500).send("Errore OAuth");
  }
});

authRouter.get("/oauth/microsoft/start", async (req, res) => {
  if (!env.MICROSOFT_OAUTH_CLIENT_ID || !env.MICROSOFT_OAUTH_CLIENT_SECRET) {
    return res.status(500).send("Microsoft OAuth non configurato");
  }
  const { returnTo } = OauthStartSchema.parse(req.query);
  const state = signOauthState({ provider: "MICROSOFT", returnTo: returnTo || env.WEB_BASE_URL });
  const redirectUri = `${getApiBase(req)}/api/auth/oauth/microsoft/callback`;
  const url = new URL(`https://login.microsoftonline.com/${env.MICROSOFT_OAUTH_TENANT || "common"}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", env.MICROSOFT_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", "openid email profile User.Read");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  return res.redirect(url.toString());
});

authRouter.get("/oauth/microsoft/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const stateToken = String(req.query.state || "");
    if (!code || !stateToken) return res.status(400).send("OAuth callback non valido");
    const state = verifyOauthState(stateToken);
    const redirectUri = `${getApiBase(req)}/api/auth/oauth/microsoft/callback`;

    const body = new URLSearchParams({
      code,
      client_id: env.MICROSOFT_OAUTH_CLIENT_ID,
      client_secret: env.MICROSOFT_OAUTH_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch(`https://login.microsoftonline.com/${env.MICROSOFT_OAUTH_TENANT || "common"}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!tokenRes.ok) return res.status(400).send("OAuth token exchange fallito");
    const tokenJson: any = await tokenRes.json();
    const accessToken = tokenJson.access_token as string;

    let email: string | null = null;
    let providerUserId: string | null = null;
    let displayName: string | null = null;

    const userinfoRes = await fetch("https://graph.microsoft.com/oidc/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userinfoRes.ok) {
      const ui: any = await userinfoRes.json();
      providerUserId = ui.sub ? String(ui.sub) : null;
      email = ui.email ? String(ui.email) : (ui.preferred_username ? String(ui.preferred_username) : null);
      displayName = ui.name ? String(ui.name) : null;
    }

    if (!providerUserId || !email) {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (meRes.ok) {
        const me: any = await meRes.json();
        providerUserId = providerUserId || (me.id ? String(me.id) : null);
        email = email || (me.mail ? String(me.mail) : (me.userPrincipalName ? String(me.userPrincipalName) : null));
        displayName = displayName || (me.displayName ? String(me.displayName) : null);
      }
    }

    if (!providerUserId) return res.status(400).send("OAuth userinfo fallito");

    const user = await upsertOAuthUser({
      provider: "MICROSOFT",
      providerUserId,
      email,
      displayName,
    });

    const token = signToken({ sub: user.id });
    const dest = `${normalizeReturnTo(state.returnTo || env.WEB_BASE_URL)}/oauth/callback#token=${encodeURIComponent(token)}`;
    return res.redirect(dest);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[oauth] microsoft callback error", e);
    return res.status(500).send("Errore OAuth");
  }
});

// NOTE: endpoints defined above.
