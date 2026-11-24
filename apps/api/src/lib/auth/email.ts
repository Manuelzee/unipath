import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "../logger";
import type { CodePurpose } from "./codes";

/**
 * Sends one-time codes through Resend or SMTP. Without provider credentials,
 * development writes each code to the API server log; production turns email
 * codes off instead.
 */
export type OutgoingEmail = { to: string; subject: string; text: string; html: string };
export type Mailer = (message: OutgoingEmail) => Promise<void>;
export type EmailDelivery = "email" | "server_log" | "unavailable";

export class EmailUnavailableError extends Error {
  constructor() { super("Email delivery is not configured."); }
}
/** The provider refused or could not take the message; the reason is in the server log. */
export class EmailSendError extends Error {
  constructor() { super("The email could not be sent."); }
}

let replacement: Mailer | null = null;
/** Swap the delivery method (used by the integration tests). Pass null to restore SMTP. */
export function setMailer(mailer: Mailer | null) { replacement = mailer; }

const smtpUrl = () => process.env.SMTP_URL?.trim() ?? "";
const fromAddress = () => process.env.EMAIL_FROM?.trim() ?? "";

/**
 * The Resend API key: RESEND_API_KEY, or the password of an SMTP_URL that
 * points at smtp.resend.com (Resend's SMTP password is the same API key).
 * Resend is always used through its HTTPS API, because hosts such as Render's
 * free plan block outgoing SMTP ports and every send would time out.
 */
export function resendApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.RESEND_API_KEY?.trim();
  if (explicit) return explicit;
  try {
    const url = new URL(env.SMTP_URL?.trim() ?? "");
    if (url.hostname.toLowerCase() === "smtp.resend.com" && url.password) return decodeURIComponent(url.password);
  } catch { /* SMTP_URL unset or not a URL */ }
  return "";
}

export function emailDelivery(): EmailDelivery {
  if (replacement || ((resendApiKey() || smtpUrl()) && fromAddress())) return "email";
  return process.env.NODE_ENV === "production" ? "unavailable" : "server_log";
}

let transport: Transporter | null = null;
async function deliver(message: OutgoingEmail) {
  if (replacement) { await replacement(message); return; }
  const apiKey = resendApiKey();
  const from = fromAddress();
  if (apiKey && from) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // Resend explains refusals, e.g. a sender whose domain is not verified
      // can only email the account owner. Keep that for the server log.
      let reason = "";
      try {
        const body = await response.json() as { name?: unknown; message?: unknown };
        reason = [body.name, body.message].filter(part => typeof part === "string" && part).join(": ");
      } catch { /* not JSON */ }
      throw Object.assign(new Error(`Resend refused the email (status ${response.status}).`), {
        code: "RESEND_API_ERROR",
        responseCode: response.status,
        response: reason || `HTTP ${response.status}`,
      });
    }
    return;
  }
  const url = smtpUrl();
  if (!url || !from) throw new Error("Email delivery is not configured.");
  transport ??= nodemailer.createTransport({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  await transport.sendMail({ from, ...message });
}

const COPY: Record<CodePurpose, { subject: string; intro: string }> = {
  verify_email: { subject: "Confirm your email for UniPath AI", intro: "Use this code to confirm your email address and finish creating your UniPath AI account." },
  reset_password: { subject: "Reset your UniPath AI password", intro: "Use this code to choose a new password for your UniPath AI account." },
};

export function codeEmail(to: string, code: string, purpose: CodePurpose, validMinutes: number): OutgoingEmail {
  const { subject, intro } = COPY[purpose];
  const ignore = purpose === "reset_password"
    ? "If you didn’t ask to reset your password, you can ignore this email. Your password stays the same."
    : "If you didn’t ask for this code, you can ignore this email.";
  const text = `${intro}\n\n${code}\n\nThe code works for ${validMinutes} minutes. Never share it with anyone, including people who say they work for UniPath.\n\n${ignore}\n\nUniPath AI`;
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f5f8fa;font-family:'DM Sans',Arial,sans-serif;color:#20354a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f8fa;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border:1px solid #dbe4e9;border-radius:16px">
<tr><td style="padding:28px 32px 8px;font:700 18px Manrope,Arial,sans-serif;color:#173e62">UniPath<span style="color:#378b82"> AI</span></td></tr>
<tr><td style="padding:8px 32px 0;font-size:15px;line-height:1.6">${intro}</td></tr>
<tr><td style="padding:20px 32px"><div style="padding:16px 0;background:#f0f7f5;border-radius:12px;text-align:center;font:700 32px/1 Manrope,Arial,sans-serif;letter-spacing:10px;color:#173e62">${code}</div></td></tr>
<tr><td style="padding:0 32px 8px;font-size:13px;line-height:1.6;color:#687b8c">The code works for ${validMinutes} minutes. Never share it with anyone, including people who say they work for UniPath.</td></tr>
<tr><td style="padding:0 32px 28px;font-size:13px;line-height:1.6;color:#687b8c">${ignore}</td></tr>
</table></td></tr></table></body></html>`;
  return { to, subject: `${subject}: ${code}`, text, html };
}

/** Delivers a code and reports how. Throws EmailUnavailableError when codes are off. */
export async function sendCodeEmail(to: string, code: string, purpose: CodePurpose, validMinutes: number): Promise<"email" | "server_log"> {
  const mode = emailDelivery();
  if (mode === "unavailable") throw new EmailUnavailableError();
  if (mode === "server_log") {
    logger.warn(`[email not configured] ${purpose} code for ${to}: ${code} (valid ${validMinutes} minutes). Set RESEND_API_KEY and EMAIL_FROM to send real emails.`);
    return "server_log";
  }
  try {
    await deliver(codeEmail(to, code, purpose, validMinutes));
  } catch (error) {
    // For the operator: the provider's reason (for example Resend's test mode
    // only delivering to the account owner). Never the code or credentials.
    const e = error as { code?: string; responseCode?: number; response?: string; message?: string };
    logger.error({ purpose, code: e.code, responseCode: e.responseCode, reason: (e.response ?? e.message ?? "").slice(0, 300) },
      "Could not send a sign-in code email");
    throw new EmailSendError();
  }
  return "email";
}
