import sgMail from "@sendgrid/mail";
import { env } from "../lib/env.js";

type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

/**
 * Send transactional email via SendGrid.
 *
 * Requirements:
 * - SENDGRID_API_KEY in apps/api/.env
 * - EMAIL_FROM must be a verified Sender Identity in SendGrid (Single Sender or Domain Authentication)
 */
export async function sendEmail(args: SendEmailArgs) {
  if (!env.SENDGRID_API_KEY) {
    // No email key configured: don't fail the app. Log for developers.
    // eslint-disable-next-line no-console
    console.warn("[email] SENDGRID_API_KEY missing. Email not sent.", { to: args.to, subject: args.subject });
    return { ok: false, skipped: true };
  }
  if (!env.EMAIL_FROM) {
    // eslint-disable-next-line no-console
    console.warn("[email] EMAIL_FROM missing. Email not sent.", { to: args.to, subject: args.subject });
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
  } catch (err: any) {
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
