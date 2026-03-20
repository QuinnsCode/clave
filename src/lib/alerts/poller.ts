/**
 * src/lib/alerts/poller.ts
 *
 * Cron entry point. Runs on schedule, fetches CF usage,
 * compares against configured tiers, enqueues alerts that fired.
 *
 * Wire into worker.ts:
 *   scheduled(event, env, ctx) {
 *     ctx.waitUntil(runAlertPoller(env));
 *   }
 *
 * wrangler.jsonc:
 *   [triggers]
 *   crons = ["*\/5 * * * *"]   ← every 5 min, CF filters by user frequency
 */

import { getAlertConfig, FREQUENCY_MINUTES, type AlertConfig, type AlertTier } from "./config";
import type { AlertQueueMessage } from "./queue-consumer";
import type { AlertPayload } from "./webhook";

interface CfUsageResult {
  total:      number;
  projected:  number;
  topService: string;
}

// ── Self-hosted poller (single account from Worker secrets) ──────────────────

export async function runAlertPoller(env: any): Promise<void> {
  const token     = env.CLOUDFLARE_API_TOKEN as string | undefined;
  const accountId = env.CF_ACCOUNT_ID       as string | undefined;
  const kv        = env.ALERT_CONFIG_KV     as KVNamespace | undefined;
  const queue     = env.ALERT_QUEUE         as Queue | undefined;
  const appUrl    = env.APP_URL             as string ?? "flareup.dev";

  if (!token || !accountId || !kv || !queue) {
    console.warn("[poller] missing env — CLOUDFLARE_API_TOKEN, CF_ACCOUNT_ID, ALERT_CONFIG_KV, ALERT_QUEUE required");
    return;
  }

  const config = await getAlertConfig(kv);

  // Check if enough time has passed since last poll for this frequency
  if (!shouldPoll(config)) return;

  const usage = await fetchCfUsage(token, accountId);
  if (!usage) return;

  await evaluateAndEnqueue({ config, usage, accountId, queue, appUrl });
}

// ── Hosted poller (per-user, called with explicit deps) ───────────────────────

export async function runHostedAlertPoller(deps: {
  token:     string;
  accountId: string;
  config:    AlertConfig;
  queue:     Queue;
  appUrl:    string;
  email?:    string;
}): Promise<void> {
  const usage = await fetchCfUsage(deps.token, deps.accountId);
  if (!usage) return;

  await evaluateAndEnqueue({
    config:    deps.config,
    usage,
    accountId: deps.accountId,
    queue:     deps.queue,
    appUrl:    deps.appUrl,
    email:     deps.email,
  });
}

// ── Core evaluation ───────────────────────────────────────────────────────────

async function evaluateAndEnqueue(opts: {
  config:    AlertConfig;
  usage:     CfUsageResult;
  accountId: string;
  queue:     Queue;
  appUrl:    string;
  email?:    string;
  kv?:       KVNamespace;
}): Promise<void> {
  const { config, usage, accountId, queue, appUrl } = opts;
  const budgetPct = usage.projected / config.monthlyBudget;

  // Find all tiers that have been crossed and haven't fired recently
  const firedTiers: AlertTier[] = [];
  const now = new Date();

  for (const tier of config.tiers) {
    if (!tier.enabled) continue;
    if (budgetPct < tier.budgetPercent) continue;

    // Check repeat cooldown
    const lastFired = config.lastFiredAt?.[tier.id];
    if (lastFired && tier.repeatEveryMinutes) {
      const msSinceFired = now.getTime() - new Date(lastFired).getTime();
      const cooldownMs = tier.repeatEveryMinutes * 60_000;
      if (msSinceFired < cooldownMs) continue;
    } else if (lastFired && !tier.repeatEveryMinutes) {
      continue; // fire once only
    }

    firedTiers.push(tier);
  }

  if (firedTiers.length === 0) return;

  const payload: AlertPayload = {
    event:        "budget.threshold",
    accountId,
    tierName:     firedTiers[firedTiers.length - 1].name, // highest tier name
    budgetPct:    Math.round(budgetPct * 100),
    currentSpend: usage.total,
    projected:    usage.projected,
    budget:       config.monthlyBudget,
    topService:   usage.topService,
    timestamp:    now.toISOString(),
    appUrl,
  };

  const msg: AlertQueueMessage = {
    type:         "alert",
    payload,
    tiers:        firedTiers,
    webhooks:     config.webhooks,
    notifyEmail:  opts.email ?? config.notifyEmail,
    appUrl,
  };

  await queue.send(msg);
}

// ── Frequency gate — don't enqueue if too soon ────────────────────────────────

function shouldPoll(config: AlertConfig): boolean {
  // cron runs every 5 min — gate on user's chosen frequency
  const minInterval = FREQUENCY_MINUTES[config.frequency] * 60_000;
  const lastFired   = config.lastFiredAt
    ? Math.max(...Object.values(config.lastFiredAt).map(t => new Date(t).getTime()))
    : 0;
  return Date.now() - lastFired >= minInterval;
}

// ── CF usage fetch ────────────────────────────────────────────────────────────

async function fetchCfUsage(
  token:     string,
  accountId: string
): Promise<CfUsageResult | null> {
  const now   = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end   = now.toISOString();

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method:  "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{
          viewer {
            accounts(filter: { accountTag: "${accountId}" }) {
              workersInvocationsAdaptive(
                limit: 1,
                filter: { datetime_geq: "${start}", datetime_leq: "${end}" }
              ) { sum { requests } }
              r2StorageAdaptiveGroups(
                limit: 1,
                filter: { date_geq: "${start.slice(0,10)}", date_leq: "${end.slice(0,10)}" }
              ) { sum { objectCount } }
            }
          }
        }`,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json() as any;
    const acct = data?.data?.viewer?.accounts?.[0];
    if (!acct) return null;

    // Simple cost estimation — real implementation would mirror your dashboard Worker
    const workerRequests = acct.workersInvocationsAdaptive?.[0]?.sum?.requests ?? 0;
    const r2Objects      = acct.r2StorageAdaptiveGroups?.[0]?.sum?.objectCount ?? 0;

    const workerCost = Math.max(0, (workerRequests - 100_000) / 1_000_000 * 0.30);
    const r2Cost     = Math.max(0, (r2Objects - 10_000_000_000) / 1_000_000_000 * 0.015);
    const total      = workerCost + r2Cost;

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const projected   = (total / now.getDate()) * daysInMonth;

    const topService = workerCost >= r2Cost ? "Workers" : "R2 Storage";

    return { total, projected, topService };
  } catch (err) {
    console.error("[poller] CF usage fetch failed:", err);
    return null;
  }
}