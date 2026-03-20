/**
 * src/lib/email/resend.ts
 *
 * Resend implementation of EmailSender.
 * Pass apiKey explicitly — supports Worker secret or BYO key.
 *
 * Usage:
 *   const email = createResendSender(env.RESEND_API_KEY);
 *   const email = createResendSender(userConfig.resendApiKey ?? env.RESEND_API_KEY);
 */

import type { EmailSender, EmailMessage, EmailResult } from "./types";

const RESEND_API = "https://api.resend.com/emails";

export function createResendSender(apiKey: string): EmailSender {
  return {
    async send(message: EmailMessage): Promise<EmailResult> {
      try {
        const res = await fetch(RESEND_API, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:     message.from,
            to:       Array.isArray(message.to) ? message.to : [message.to],
            subject:  message.subject,
            html:     message.html,
            text:     message.text,
            reply_to: message.replyTo,
            tags:     message.tags
              ? Object.entries(message.tags).map(([name, value]) => ({ name, value }))
              : undefined,
          }),
        });

        const data = await res.json() as any;

        if (!res.ok) {
          return { ok: false, error: data.message ?? `Resend error ${res.status}` };
        }

        return { ok: true, messageId: data.id };
      } catch (err: any) {
        return { ok: false, error: err?.message ?? "Unknown email error" };
      }
    },
  };
}