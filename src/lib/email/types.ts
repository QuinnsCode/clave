/**
 * src/lib/email/types.ts
 *
 * Injectable email interface. Everything takes EmailSender, not a raw client.
 * Swap Resend for Postmark/SES/etc by implementing this interface.
 */

export interface EmailMessage {
    to: string | string[];
    from: string;        // "FlareUp <alerts@flareup.dev>"
    subject: string;
    html: string;
    text?: string;       // plain-text fallback
    replyTo?: string;
    tags?: Record<string, string>;
  }
  
  export type EmailResult =
    | { ok: true;  messageId: string }
    | { ok: false; error: string };
  
  export interface EmailSender {
    send(message: EmailMessage): Promise<EmailResult>;
  }