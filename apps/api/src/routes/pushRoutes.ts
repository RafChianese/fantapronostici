import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/authMiddleware.js";
import { env } from "../lib/env.js";

// web-push is CommonJS; in ESM we import dynamically to avoid typing friction.
async function getWebPush() {
  const mod: any = await import("web-push");
  return mod?.default || mod;
}

function isPushEnabled() {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

async function configureWebPush() {
  if (!isPushEnabled()) return null;
  const webPush = await getWebPush();
  const contact = env.EMAIL_FROM ? `mailto:${env.EMAIL_FROM}` : `mailto:no-reply@${new URL(env.WEB_ORIGIN.split(",")[0]).hostname}`;
  webPush.setVapidDetails(contact, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return webPush;
}

export const pushRouter = Router();

// NOTE: cast to keep builds resilient if Prisma Client types are temporarily out of sync on CI/Render.
const pushSubscription = (prisma as any).pushSubscription;

pushRouter.post(
  "/subscribe",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const Body = z.object({
      endpoint: z.string().min(1),
      keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
      }),
    });

    const { endpoint, keys } = Body.parse(req.body);
    const userId = req.user!.id;

    // Upsert by unique endpoint.
    await pushSubscription.upsert({
      where: { endpoint },
      create: {
        userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        lastUsedAt: new Date(),
      },
      update: {
        userId,
        p256dh: keys.p256dh,
        auth: keys.auth,
        lastUsedAt: new Date(),
      },
    });

    return res.json({ ok: true });
  }
);

pushRouter.post(
  "/unsubscribe",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const Body = z.object({ endpoint: z.string().min(1) });
    const { endpoint } = Body.parse(req.body);
    const userId = req.user!.id;

    await pushSubscription.deleteMany({ where: { endpoint, userId } });
    return res.json({ ok: true });
  }
);

pushRouter.post(
  "/test",
  requireAuth,
  async (req: AuthedRequest, res) => {
    // No-op if VAPID missing (must not crash)
    if (!isPushEnabled()) {
      return res.json({ ok: true, skipped: true });
    }

    const webPush = await configureWebPush();
    if (!webPush) return res.json({ ok: true, skipped: true });

    const userId = req.user!.id;
    const subs = await pushSubscription.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 5 });
    if (subs.length === 0) return res.json({ ok: true, skipped: true });

    const payload = JSON.stringify({
      title: "Fanta Pronostici",
      body: "Notifica di test attiva! ✅",
      url: "/account",
    });

    let sent = 0;
    for (const s of subs) {
      try {
        await webPush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          payload
        );
        sent += 1;
        await pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } });
      } catch (err: any) {
        const statusCode = err?.statusCode;
        // Subscription expired/invalid
        if (statusCode === 404 || statusCode === 410) {
          await pushSubscription.delete({ where: { id: s.id } }).catch(() => null);
        }
        // eslint-disable-next-line no-console
        if (env.NODE_ENV !== "production") console.warn("[push] send error", { statusCode, message: err?.message });
      }
    }

    return res.json({ ok: true, sent });
  }
);
