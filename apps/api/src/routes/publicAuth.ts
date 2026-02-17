import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { env } from "../lib/env.js";
import { sendEmail } from "../services/email.js";

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

  // NOTE: keep builds resilient if Prisma Client types are temporarily out of sync on CI/Render.
  const emailVerifiedAt = (user as any).emailVerifiedAt as Date | null | undefined;
  if (!emailVerifiedAt) {
    return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", message: "Email non verificata" });
  }

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
      data: { email, displayName, passwordHash, globalRole: "USER", isActive: true, ...({ emailVerifiedAt: null } as any) },
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

  // Generate and email a 6-digit OTP (valid 10 minutes)
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const emailVerificationToken = (prisma as any).emailVerificationToken;
  await prisma.$transaction([
    // Invalidate previous pending tokens
    emailVerificationToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    emailVerificationToken.create({
      data: { userId: user.id, codeHash, expiresAt },
    }),
  ]);

  const subject = "Verifica email - Fanta Pronostici";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Verifica la tua email</h2>
      <p>Inserisci questo codice per completare la registrazione (valido 10 minuti):</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</div>
      <p>Se non sei stato tu, puoi ignorare questa email.</p>
    </div>
  `;
  const text = `Verifica la tua email. Codice (valido 10 minuti): ${code}`;

  const sendRes = await sendEmail({ to: email, subject, html, text });

  if (!sendRes?.ok) {
    // eslint-disable-next-line no-console
    console.error("[auth] Verification email send failed", {
      to: email,
      provider: env.RESEND_API_KEY ? "resend" : env.SENDGRID_API_KEY ? "sendgrid" : "none",
      skipped: (sendRes as any)?.skipped,
    });
  }

  // In development, always log the OTP if the email could not be sent (or no provider is configured).
  if (env.NODE_ENV !== "production" && (!sendRes?.ok || (!env.RESEND_API_KEY && !env.SENDGRID_API_KEY))) {
    // eslint-disable-next-line no-console
    console.log(`[auth] DEV email verification code for ${email}: ${code}`);
  }

  return res.status(201).json({ ok: true, requiresVerification: true, email });
});

const VerifyEmailSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

authRouter.post("/verify-email", async (req, res) => {
  const { email, code } = VerifyEmailSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.status(400).json({ message: "Codice non valido o scaduto" });

  const now = new Date();
  const emailVerificationToken = (prisma as any).emailVerificationToken;
  const candidates = await emailVerificationToken.findMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  let matched: { id: string } | null = null;
  for (const c of candidates) {
    const ok = await bcrypt.compare(code, c.codeHash);
    if (ok) {
      matched = { id: c.id };
      break;
    }
  }

  if (!matched) return res.status(400).json({ message: "Codice non valido o scaduto" });

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { ...({ emailVerifiedAt: (user as any).emailVerifiedAt ?? new Date() } as any) } }),
    emailVerificationToken.update({ where: { id: matched.id }, data: { usedAt: new Date() } }),
  ]);

  const token = signToken({ sub: user.id });
  return res.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, globalRole: user.globalRole } });
});

const ResendSchema = z.object({ email: z.string().email() });

authRouter.post("/resend-verification", async (req, res) => {
  const { email } = ResendSchema.parse(req.body);

  // Privacy: always return ok.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.json({ ok: true });
  if ((user as any).emailVerifiedAt) return res.json({ ok: true });

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const emailVerificationToken = (prisma as any).emailVerificationToken;
  await prisma.$transaction([
    emailVerificationToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    emailVerificationToken.create({ data: { userId: user.id, codeHash, expiresAt } }),
  ]);

  const subject = "Nuovo codice verifica - Fanta Pronostici";
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Nuovo codice di verifica</h2>
      <p>Ecco il tuo nuovo codice (valido 10 minuti):</p>
      <div style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</div>
    </div>
  `;
  const text = `Nuovo codice di verifica (valido 10 minuti): ${code}`;
  const sendRes = await sendEmail({ to: email, subject, html, text });

  if (!sendRes?.ok) {
    // eslint-disable-next-line no-console
    console.error("[auth] Resend verification email send failed", {
      to: email,
      provider: env.RESEND_API_KEY ? "resend" : env.SENDGRID_API_KEY ? "sendgrid" : "none",
      skipped: (sendRes as any)?.skipped,
    });
  }

  if (env.NODE_ENV !== "production" && (!sendRes?.ok || (!env.RESEND_API_KEY && !env.SENDGRID_API_KEY))) {
    // eslint-disable-next-line no-console
    console.log(`[auth] DEV resend verification code for ${email}: ${code}`);
  }

  return res.json({ ok: true });
});

// Password reset (email-based)
const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

authRouter.post("/forgot-password", async (req, res) => {
  const { email } = ForgotPasswordSchema.parse(req.body);

  // Always return success for privacy.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    return res.json({ ok: true });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  const resetUrl = `${env.WEB_ORIGIN}/reset-password?email=${encodeURIComponent(email)}&token=${rawToken}`;

  await sendEmail({
    to: email,
    subject: "Recupero password - Fanta Pronostici",
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5">
        <h2>Recupero password</h2>
        <p>Hai richiesto il reset della password.</p>
        <p>Clicca qui per impostare una nuova password (valido 1 ora):</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>Se non sei stato tu, puoi ignorare questa email.</p>
      </div>
    `,
    text: `Recupero password. Apri questo link (valido 1 ora): ${resetUrl}`,
  });

  return res.json({ ok: true });
});

const ResetPasswordSchema = z.object({
  email: z.string().email(),
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

authRouter.post("/reset-password", async (req, res) => {
  const { email, token, newPassword } = ResetPasswordSchema.parse(req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return res.status(400).json({ message: "Token non valido o scaduto" });

  const now = new Date();
  const candidates = await prisma.passwordResetToken.findMany({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  let matched: { id: string } | null = null;
  for (const c of candidates) {
    const ok = await bcrypt.compare(token, c.tokenHash);
    if (ok) {
      matched = { id: c.id };
      break;
    }
  }

  if (!matched) return res.status(400).json({ message: "Token non valido o scaduto" });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: matched.id }, data: { usedAt: new Date() } }),
  ]);

  return res.json({ ok: true });
});

// NOTE: endpoints defined above.
