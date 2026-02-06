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
    if (!user || !user.isActive)
        return res.status(401).json({ message: "Credenziali non valide" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
        return res.status(401).json({ message: "Credenziali non valide" });
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
    if (existing)
        return res.status(400).json({ message: "Email già registrata" });
    // Enforce unique display name so league member display names can't collide.
    const existingName = await prisma.user.findUnique({ where: { displayName } });
    if (existingName)
        return res.status(400).json({ message: "Nome visualizzato già in uso" });
    const passwordHash = await bcrypt.hash(password, 10);
    let user;
    try {
        user = await prisma.user.create({ data: { email, displayName, passwordHash, globalRole: "USER", isActive: true } });
    }
    catch (e) {
        // Prisma unique constraint (race condition safe)
        if (e?.code === "P2002") {
            const target = Array.isArray(e?.meta?.target) ? e.meta.target.join(",") : String(e?.meta?.target || "");
            if (target.includes("email"))
                return res.status(400).json({ message: "Email già registrata" });
            if (target.includes("displayName"))
                return res.status(400).json({ message: "Nome visualizzato già in uso" });
            return res.status(400).json({ message: "Dati già presenti" });
        }
        throw e;
    }
    const token = signToken({ sub: user.id });
    return res.status(201).json({ token, user: { id: user.id, email: user.email, displayName: user.displayName, globalRole: user.globalRole } });
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
    if (!user || !user.isActive)
        return res.status(400).json({ message: "Token non valido o scaduto" });
    const now = new Date();
    const candidates = await prisma.passwordResetToken.findMany({
        where: { userId: user.id, usedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        take: 5,
    });
    let matched = null;
    for (const c of candidates) {
        const ok = await bcrypt.compare(token, c.tokenHash);
        if (ok) {
            matched = { id: c.id };
            break;
        }
    }
    if (!matched)
        return res.status(400).json({ message: "Token non valido o scaduto" });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
        prisma.passwordResetToken.update({ where: { id: matched.id }, data: { usedAt: new Date() } }),
    ]);
    return res.json({ ok: true });
});
// NOTE: endpoints defined above.
