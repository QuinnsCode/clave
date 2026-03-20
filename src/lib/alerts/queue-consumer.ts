/**
 * src/lib/alerts/queue-consumer.ts
 *
 * Receives alert messages from CF Queue, fans out to webhooks + email.
 * CF Queue handles retries — we just fire and report.
 *
 * Wire into worker.ts:
 *   queue(batch, env) {
 *     if (batch.queue === "ALERT_QUEUE") return handleAlertQueue(batch, env);
 *     ...
 *   }
 */

import { fireWebhook, type AlertPayload } from "./webhook";
import { createResendSender } from "@/lib/email/resend";
import { alertEmailHtml, alertEmailText } from "@/lib/email/templates/alert";
import type { AlertTier, Webhook } from "./config";

export interface AlertQueueMessage {
  type:         "alert";
  payload:      AlertPayload;
  tiers:        AlertTier[];       // tiers that fired
  webhooks:     Webhook[];         // all configured webhooks
  notifyEmail?: string;
  appUrl:       string;
}

export async function handleAlertQueue(
  batch: MessageBatch<AlertQueueMessage>,
  env:   any
): Promise<void> {
  const resendKey = env.RESEND_API_KEY as string | undefined;

  for (const msg of batch.messages) {
    const { payload, tiers, webhooks, notifyEmail } = msg.body;

    // Fan out webhooks — fire all enabled webhooks for all fired tiers
    const webhookIds = new Set(tiers.flatMap(t => t.webhookIds));
    const activeWebhooks = webhooks.filter(w => w.enabled && webhookIds.has(w.id));

    const webhookResults = await Promise.allSettled(
      activeWebhooks.map(w =>
        fireWebhook(w.url, payload, { routingKey: w.routingKey })
      )
    );

    webhookResults.forEach((r, i) => {
      if (r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)) {
        console.error(`[alert-queue] webhook failed: ${activeWebhooks[i].name}`, r);
      }
    });

    // Email — send if any tier has emailEnabled
    const shouldEmail = tiers.some(t => t.emailEnabled) && notifyEmail && resendKey;
    if (shouldEmail) {
      // BYO key takes priority if stored in payload (for hosted platform)
      const key = (payload as any).byoResendKey ?? resendKey;
      const sender = createResendSender(key);
      const result = await sender.send({
        to:      notifyEmail!,
        from:    `FlareUp <alerts@${payload.appUrl}>`,
        subject: `🔥 ${payload.tierName} — ${payload.budgetPct}% of budget`,
        html:    alertEmailHtml(payload),
        text:    alertEmailText(payload),
        tags:    { event: payload.event, account: payload.accountId.slice(0, 8) },
      });
      if (!result.ok) {
        console.error("[alert-queue] email failed:", result.error);
      }
    }

    msg.ack();
  }
}