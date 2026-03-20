/**
 * src/app/api/alerts/config.ts
 * GET — read alert config from KV
 * POST — write alert config to KV
 */

import { getAlertConfig, setAlertConfig, type AlertConfig } from "@/lib/alerts/config";
import { env } from "cloudflare:workers";

export default async function handler({ request }: { request: Request }): Promise<Response> {
  const kv = (env as any).ALERT_CONFIG_KV as KVNamespace | undefined;
  if (!kv) {
    return Response.json({ error: "ALERT_CONFIG_KV not configured" }, { status: 503 });
  }

  if (request.method === "GET") {
    const config = await getAlertConfig(kv);
    return Response.json(config);
  }

  if (request.method === "POST") {
    let config: AlertConfig;
    try {
      config = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (typeof config.monthlyBudget !== "number" || config.monthlyBudget <= 0) {
      return Response.json({ error: "monthlyBudget must be a positive number" }, { status: 400 });
    }

    await setAlertConfig(kv, config);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Method not allowed" }, { status: 405 });
}