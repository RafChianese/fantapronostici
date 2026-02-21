import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { env } from "../lib/env.js";

/**
 * OAuth-only auth router.
 *
 * Legacy email/password routes are intentionally NOT mounted.
 * If you ever need to restore them, re-mount the router exported by:
 *   src/routes/legacyEmailAuth.ts
 */
export const authRouter = Router();

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
    // Random hash (not used for login in OAuth-only mode).
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
    const info: any = await userinfoRes.json();

    const user = await upsertOAuthUser({
      provider: "GOOGLE",
      providerUserId: String(info.sub || info.id || ""),
      email: info.email || null,
      displayName: info.name || info.given_name || null,
    });

    const token = signToken({ sub: user.id });
    const returnTo = normalizeReturnTo(String(state?.returnTo || env.WEB_BASE_URL));
    return res.redirect(`${returnTo}/oauth/callback#token=${encodeURIComponent(token)}`);
  } catch (e: any) {
    return res.status(400).send(e?.message || "OAuth error");
  }
});

authRouter.get("/oauth/microsoft/start", async (req, res) => {
  if (!env.MICROSOFT_OAUTH_CLIENT_ID || !env.MICROSOFT_OAUTH_CLIENT_SECRET || !env.MICROSOFT_OAUTH_TENANT) {
    return res.status(500).send("Microsoft OAuth non configurato");
  }
  const { returnTo } = OauthStartSchema.parse(req.query);
  const state = signOauthState({ provider: "MICROSOFT", returnTo: returnTo || env.WEB_BASE_URL });
  const redirectUri = `${getApiBase(req)}/api/auth/oauth/microsoft/callback`;
  const url = new URL(
    `https://login.microsoftonline.com/${env.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/authorize`
  );
  url.searchParams.set("client_id", env.MICROSOFT_OAUTH_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile offline_access");
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

    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${env.MICROSOFT_OAUTH_TENANT}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }
    );
    if (!tokenRes.ok) return res.status(400).send("OAuth token exchange fallito");
    const tokenJson: any = await tokenRes.json();
    const accessToken = tokenJson.access_token as string;

    // Prefer OIDC userinfo.
    let info: any = null;
    const userinfoRes = await fetch("https://graph.microsoft.com/oidc/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userinfoRes.ok) {
      info = await userinfoRes.json();
    } else {
      const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!meRes.ok) return res.status(400).send("OAuth userinfo fallito");
      info = await meRes.json();
    }

    const providerUserId = String(info.sub || info.id || "");
    const userEmail = info.email || info.preferred_username || null;
    const userDisplayName = info.name || info.displayName || null;

    const user = await upsertOAuthUser({
      provider: "MICROSOFT",
      providerUserId,
      email: userEmail,
      displayName: userDisplayName,
    });

    const token = signToken({ sub: user.id });
    const returnTo = normalizeReturnTo(String(state?.returnTo || env.WEB_BASE_URL));
    return res.redirect(`${returnTo}/oauth/callback#token=${encodeURIComponent(token)}`);
  } catch (e: any) {
    return res.status(400).send(e?.message || "OAuth error");
  }
});

// Optional FE-only logout is enough; this exists for symmetry.
authRouter.post("/logout", async (_req, res) => {
  return res.json({ ok: true });
});
