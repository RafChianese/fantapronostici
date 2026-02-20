import sgMail from "@sendgrid/mail";
import { env } from "../lib/env.js";
/**
 * Send transactional email via SendGrid.
 *
 * Requirements:
 * - SENDGRID_API_KEY in apps/api/.env
 * - EMAIL_FROM must be a verified Sender Identity in SendGrid (Single Sender or Domain Authentication)
 */
export async function sendEmail(args) {
    if (!env.EMAIL_FROM) {
        // eslint-disable-next-line no-console
        console.warn("[email] EMAIL_FROM missing. Email not sent.", { to: args.to, subject: args.subject });
        return { ok: false, skipped: true };
    }
    // Prefer Resend if configured (works well on Render).
    if (env.RESEND_API_KEY) {
        try {
            const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${env.RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    from: env.EMAIL_FROM,
                    to: [args.to],
                    subject: args.subject,
                    html: args.html,
                    text: args.text,
                    reply_to: env.EMAIL_REPLY_TO || undefined,
                }),
            });
            if (!res.ok) {
                const body = await res.text().catch(() => "");
                const log = env.NODE_ENV === "production" ? console.warn : console.error;
                log("[email] Resend error", { status: res.status, body, to: args.to, subject: args.subject });
                return { ok: false };
            }
            return { ok: true };
        }
        catch (err) {
            const log = env.NODE_ENV === "production" ? console.warn : console.error;
            log("[email] Resend error", { message: err?.message, to: args.to, subject: args.subject });
            return { ok: false };
        }
    }
    // Fallback: SendGrid
    if (!env.SENDGRID_API_KEY) {
        // No email key configured: don't fail the app.
        // eslint-disable-next-line no-console
        console.warn("[email] Missing RESEND_API_KEY/SENDGRID_API_KEY. Email not sent.", { to: args.to, subject: args.subject });
        return { ok: false, skipped: true };
    }
    sgMail.setApiKey(env.SENDGRID_API_KEY);
    try {
        await sgMail.send({
            to: args.to,
            from: env.EMAIL_FROM,
            replyTo: env.EMAIL_REPLY_TO || undefined,
            subject: args.subject,
            text: args.text,
            html: args.html,
        });
        return { ok: true };
    }
    catch (err) {
        const log = env.NODE_ENV === "production" ? console.warn : console.error;
        log("[email] SendGrid error", {
            message: err?.message,
            code: err?.code,
            responseBody: err?.response?.body,
            to: args.to,
            subject: args.subject,
        });
        return { ok: false };
    }
}
