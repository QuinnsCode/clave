/**
 * src/lib/alerts/webhook.ts
 *
 * Outbound webhook dispatcher.
 * Detects destination from URL, formats payload accordingly.
 * Supported: Slack, Discord, PagerDuty, Teams, Linear, Datadog, Generic JSON
 *
 * Coming soon: OpsGenie, VictorOps, Opsgenie, Splunk On-Call
 */

export interface AlertPayload {
    event:       string;  // "budget.threshold" | "spike.detected" | "test"
    accountId:   string;
    tierName:    string;
    budgetPct:   number;
    currentSpend: number;
    projected:   number;
    budget:      number;
    topService:  string;
    timestamp:   string;
    appUrl:      string;
  }
  
  export type WebhookDestination =
    | "slack"
    | "discord"
    | "pagerduty"
    | "teams"
    | "linear"
    | "datadog"
    | "generic";
  
  export function detectDestination(url: string): WebhookDestination {
    if (url.includes("hooks.slack.com"))          return "slack";
    if (url.includes("discord.com/api/webhooks")) return "discord";
    if (url.includes("events.pagerduty.com"))     return "pagerduty";
    if (url.includes("webhook.office.com"))       return "teams";
    if (url.includes("linear.app"))               return "linear";
    if (url.includes("api.datadoghq"))            return "datadog";
    return "generic";
  }
  
  function formatSlack(p: AlertPayload): unknown {
    const color = p.budgetPct >= 100 ? "#ef4444" : p.budgetPct >= 75 ? "#f97316" : "#eab308";
    return {
      text: `🔥 FlareUp: ${p.tierName} — ${p.budgetPct}% of budget`,
      attachments: [{
        color,
        fields: [
          { title: "Account",          value: `\`${p.accountId.slice(0, 8)}…\``, short: true },
          { title: "Current spend",    value: `$${p.currentSpend.toFixed(2)}`,   short: true },
          { title: "Projected",        value: `$${p.projected.toFixed(2)}`,      short: true },
          { title: "Budget",           value: `$${p.budget.toFixed(2)}`,         short: true },
          { title: "Top service",      value: p.topService,                      short: true },
        ],
        actions: [{
          type: "button",
          text: "Open Dashboard →",
          url:  `https://${p.appUrl}/dashboard`,
        }],
        footer: "FlareUp",
        ts: Math.floor(Date.parse(p.timestamp) / 1000),
      }],
    };
  }
  
  function formatDiscord(p: AlertPayload): unknown {
    const color = p.budgetPct >= 100 ? 0xef4444 : p.budgetPct >= 75 ? 0xf97316 : 0xeab308;
    return {
      embeds: [{
        title:       `🔥 ${p.tierName} — ${p.budgetPct}% of budget`,
        color,
        description: `Account \`${p.accountId.slice(0, 8)}…\``,
        fields: [
          { name: "Current spend",   value: `$${p.currentSpend.toFixed(2)}`, inline: true },
          { name: "Projected",       value: `$${p.projected.toFixed(2)}`,    inline: true },
          { name: "Budget",          value: `$${p.budget.toFixed(2)}`,       inline: true },
          { name: "Top service",     value: p.topService,                    inline: true },
        ],
        url:       `https://${p.appUrl}/dashboard`,
        timestamp: p.timestamp,
        footer: { text: "FlareUp" },
      }],
    };
  }
  
  function formatPagerDuty(p: AlertPayload): unknown {
    return {
      routing_key:  "", // caller must set — injected at send time
      event_action: p.budgetPct >= 100 ? "trigger" : "acknowledge",
      dedup_key:    `flareup-${p.accountId}-${p.tierName}`,
      payload: {
        summary:   `FlareUp: ${p.tierName} — ${p.budgetPct}% of budget ($${p.projected.toFixed(2)} projected)`,
        source:    `FlareUp / ${p.accountId.slice(0, 8)}`,
        severity:  p.budgetPct >= 100 ? "critical" : p.budgetPct >= 75 ? "error" : "warning",
        timestamp: p.timestamp,
        custom_details: {
          current_spend: p.currentSpend,
          projected:     p.projected,
          budget:        p.budget,
          top_service:   p.topService,
        },
      },
      links: [{ href: `https://${p.appUrl}/dashboard`, text: "Open Dashboard" }],
    };
  }
  
  function formatTeams(p: AlertPayload): unknown {
    return {
      "@type":    "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: p.budgetPct >= 100 ? "ef4444" : p.budgetPct >= 75 ? "f97316" : "eab308",
      summary:    `FlareUp: ${p.tierName} — ${p.budgetPct}% of budget`,
      sections: [{
        activityTitle:    `🔥 ${p.tierName}`,
        activitySubtitle: `${p.budgetPct}% of budget · acct ${p.accountId.slice(0, 8)}…`,
        facts: [
          { name: "Current spend",   value: `$${p.currentSpend.toFixed(2)}` },
          { name: "Projected",       value: `$${p.projected.toFixed(2)}` },
          { name: "Budget",          value: `$${p.budget.toFixed(2)}` },
          { name: "Top service",     value: p.topService },
        ],
      }],
      potentialAction: [{
        "@type": "OpenUri",
        name:    "Open Dashboard",
        targets: [{ os: "default", uri: `https://${p.appUrl}/dashboard` }],
      }],
    };
  }
  
  function formatLinear(p: AlertPayload): unknown {
    // Linear webhook — creates an issue comment via generic payload
    return {
      title: `🔥 FlareUp: ${p.tierName} — ${p.budgetPct}% of budget`,
      body:  `**Account:** \`${p.accountId.slice(0, 8)}…\`\n**Current:** $${p.currentSpend.toFixed(2)}\n**Projected:** $${p.projected.toFixed(2)}\n**Top service:** ${p.topService}\n\n[Open Dashboard](https://${p.appUrl}/dashboard)`,
    };
  }
  
  function formatDatadog(p: AlertPayload): unknown {
    return {
      title:      `FlareUp: ${p.tierName} — ${p.budgetPct}% of budget`,
      text:       `Current: $${p.currentSpend.toFixed(2)} · Projected: $${p.projected.toFixed(2)} · Top: ${p.topService}`,
      priority:   p.budgetPct >= 100 ? "normal" : "low",
      alert_type: p.budgetPct >= 100 ? "error" : p.budgetPct >= 75 ? "warning" : "info",
      source_type_name: "flareup",
      tags: [
        `account:${p.accountId.slice(0, 8)}`,
        `tier:${p.tierName}`,
        `budget_pct:${p.budgetPct}`,
      ],
    };
  }
  
  function formatGeneric(p: AlertPayload): unknown {
    return {
      event:     p.event,
      timestamp: p.timestamp,
      data: {
        accountId:    p.accountId,
        tierName:     p.tierName,
        budgetPct:    p.budgetPct,
        currentSpend: p.currentSpend,
        projected:    p.projected,
        budget:       p.budget,
        topService:   p.topService,
        dashboardUrl: `https://${p.appUrl}/dashboard`,
      },
    };
  }
  
  export function formatPayload(destination: WebhookDestination, payload: AlertPayload): unknown {
    switch (destination) {
      case "slack":      return formatSlack(payload);
      case "discord":    return formatDiscord(payload);
      case "pagerduty":  return formatPagerDuty(payload);
      case "teams":      return formatTeams(payload);
      case "linear":     return formatLinear(payload);
      case "datadog":    return formatDatadog(payload);
      default:           return formatGeneric(payload);
    }
  }
  
  export interface WebhookResult {
    ok:          boolean;
    status?:     number;
    error?:      string;
    destination: WebhookDestination;
  }
  
  export async function fireWebhook(
    url:     string,
    payload: AlertPayload,
    options: { timeoutMs?: number; routingKey?: string } = {}
  ): Promise<WebhookResult> {
    const destination = detectDestination(url);
    let body = formatPayload(destination, payload);
  
    // PagerDuty needs the routing key injected
    if (destination === "pagerduty" && options.routingKey) {
      (body as any).routing_key = options.routingKey;
    }
  
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
  
    try {
      const res = await fetch(url, {
        method:  "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "FlareUp/1.0" },
        body:    JSON.stringify(body),
        signal:  controller.signal,
      });
      clearTimeout(timeout);
      return { ok: res.ok, status: res.status, destination };
    } catch (err: any) {
      clearTimeout(timeout);
      return { ok: false, error: err?.message ?? "Network error", destination };
    }
  }
  
  // Supported destinations for UI display
  export const WEBHOOK_DESTINATIONS = [
    { id: "slack",     name: "Slack",      supported: true,  urlHint: "hooks.slack.com/…" },
    { id: "discord",   name: "Discord",    supported: true,  urlHint: "discord.com/api/webhooks/…" },
    { id: "pagerduty", name: "PagerDuty",  supported: true,  urlHint: "events.pagerduty.com/…" },
    { id: "teams",     name: "MS Teams",   supported: true,  urlHint: "webhook.office.com/…" },
    { id: "linear",    name: "Linear",     supported: true,  urlHint: "linear.app/…" },
    { id: "datadog",   name: "Datadog",    supported: true,  urlHint: "api.datadoghq.com/…" },
    { id: "generic",   name: "Custom URL", supported: true,  urlHint: "https://…" },
    { id: "opsgenie",  name: "OpsGenie",   supported: false, urlHint: "coming soon" },
    { id: "splunk",    name: "Splunk",     supported: false, urlHint: "coming soon" },
    { id: "victorops", name: "VictorOps",  supported: false, urlHint: "coming soon" },
    { id: "telegram",  name: "Telegram",   supported: false, urlHint: "coming soon" },
  ] as const;