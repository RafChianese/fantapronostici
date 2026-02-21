import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";

/**
 * LEGACY router (email/password + verification/reset).
 *
 * Step 1 requirement: app is OAuth-only, so this router is NOT mounted.
 * Keep it around so it can be restored later by re-mounting it under /api/auth.
 */
export const legacyEmailAuthRouter = Router();

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

legacyEmailAuthRouter.post("/login", async (req, res) => {
  const { email, password } = LoginSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.status(401).json({ message: "Credenziali non valide" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ message: "Credenziali non valide" });

  const token = signToken({ sub: user.id });
  return res.json({
    token,
    user: { id: user.id, email: user.email, displayName: user.displayName, globalRole: user.globalRole },
  });
});

const RegisterSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(2).max(50),
  password: z.string().min(8),
});

legacyEmailAuthRouter.post("/register", async (req, res) => {
  const { email, displayName, password } = RegisterSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(400).json({ message: "Email già registrata" });

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

legacyEmailAuthRouter.post("/verify-email", async (req, res) => {
  VerifyEmailSchema.parse(req.body);
  return res.status(410).json({ message: "Verifica email temporaneamente disattivata" });
});

const ResendSchema = z.object({ email: z.string().email() });

legacyEmailAuthRouter.post("/resend-verification", async (req, res) => {
  ResendSchema.parse(req.body);
  return res.status(410).json({ message: "Verifica email temporaneamente disattivata" });
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

legacyEmailAuthRouter.post("/forgot-password", async (req, res) => {
  ForgotPasswordSchema.parse(req.body);
  return res.status(410).json({ message: "Recupero password via email temporaneamente disattivato" });
});

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

legacyEmailAuthRouter.post("/reset-password", async (req, res) => {
  ResetPasswordSchema.parse(req.body);
  return res.status(410).json({ message: "Recupero password via email temporaneamente disattivato" });
});
