/**
 * src/app/api/alerts/test-webhook.ts
 * Fires a test payload to a webhook URL. Used by WebhookEditor.
 */

import { fireWebhook, detectDestination, type AlertPayload } from "@/lib/alerts/webhook";
import { env } from "cloudflare:workers";

const TEST_PAYLOAD: Omit<AlertPayload, "appUrl"> = {
  event:        "test",
  accountId:    "abc123def456test",
  tierName:     "Test alert 🔥",
  budgetPct:    75,
  currentSpend: 74.20,
  projected:    98.93,
  budget:       100,
  topService:   "Workers AI",
  timestamp:    new Date().toISOString(),
};

export default async function handler({ request }: { request: Request }): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body: { url: string; routingKey?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.url) {
    return Response.json({ error: "url is required" }, { status: 400 });
  }

  const appUrl = (env as any).APP_URL ?? "flareup.dev";
  const result = await fireWebhook(
    body.url,
    { ...TEST_PAYLOAD, appUrl },
    { routingKey: body.routingKey }
  );

  return Response.json({
    ok:          result.ok,
    destination: result.destination,
    status:      result.status,
    error:       result.error,
  });
}