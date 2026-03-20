/**
 * src/lib/alerts/config.ts
 *
 * Alert configuration — stored in KV per user/account.
 *
 * Frequency scale (dumpster fire slider):
 * 🗑️  Weekly   ←── least on fire, cheapest
 *     Daily
 *     12hr
 *     6hr
 *     3hr
 *     Hourly
 *     30min
 *     15min
 * 🔥🔥🔥 5min  ←── most on fire, most expensive
 *
 * The UI renders the slider backwards on purpose:
 * dragging right = more fire = more polling = more cost = more urgent.
 */

export type AlertFrequency =
  | "weekly"    // 10,080 min
  | "daily"     // 1,440 min
  | "12hr"      //   720 min
  | "6hr"       //   360 min
  | "3hr"       //   180 min
  | "hourly"    //    60 min
  | "30min"
  | "15min"
  | "5min";     // 🔥🔥🔥

export const FREQUENCY_MINUTES: Record<AlertFrequency, number> = {
  weekly:  10_080,
  daily:    1_440,
  "12hr":     720,
  "6hr":      360,
  "3hr":      180,
  hourly:      60,
  "30min":     30,
  "15min":     15,
  "5min":       5,
};

export const FREQUENCY_LABELS: Record<AlertFrequency, string> = {
  weekly:  "Weekly",
  daily:   "Daily",
  "12hr":  "Every 12 hours",
  "6hr":   "Every 6 hours",
  "3hr":   "Every 3 hours",
  hourly:  "Hourly",
  "30min": "Every 30 minutes",
  "15min": "Every 15 minutes",
  "5min":  "Every 5 minutes",
};

export const FREQUENCY_FIRE: Record<AlertFrequency, string> = {
  weekly:  "🗑️",
  daily:   "🗑️",
  "12hr":  "🌫️",
  "6hr":   "🌫️",
  "3hr":   "⚠️",
  hourly:  "⚠️",
  "30min": "🔥",
  "15min": "🔥🔥",
  "5min":  "🔥🔥🔥",
};

// Ordered for slider display (low fire → high fire)
export const FREQUENCY_SCALE: AlertFrequency[] = [
  "weekly", "daily", "12hr", "6hr", "3hr", "hourly", "30min", "15min", "5min",
];

export interface AlertTier {
  id:                  string;
  name:                string;
  budgetPercent:       number;   // 0.75 = 75%
  webhookIds:          string[];
  emailEnabled:        boolean;
  enabled:             boolean;
  repeatEveryMinutes?: number;   // 0 or undefined = fire once per period
}

export interface Webhook {
  id:           string;
  name:         string;
  url:          string;
  enabled:      boolean;
  routingKey?:  string;          // PagerDuty routing key
}

export interface AlertConfig {
  monthlyBudget:  number;
  frequency:      AlertFrequency;
  tiers:          AlertTier[];
  webhooks:       Webhook[];
  notifyEmail?:   string;        // override — defaults to account email
  byoResendKey?:  string;        // BYO Resend key — falls back to Worker secret
  lastFiredAt?:   Record<string, string>; // tierId → ISO timestamp
}

export const DEFAULT_CONFIG: AlertConfig = {
  monthlyBudget: 100,
  frequency:     "hourly",
  tiers: [
    { id: "t-25",  name: "Warming up",     budgetPercent: 0.25, webhookIds: [], emailEnabled: false, enabled: true },
    { id: "t-50",  name: "Getting toasty", budgetPercent: 0.50, webhookIds: [], emailEnabled: true,  enabled: true },
    { id: "t-75",  name: "On fire",        budgetPercent: 0.75, webhookIds: [], emailEnabled: true,  enabled: true },
    { id: "t-100", name: "Fully engulfed", budgetPercent: 1.00, webhookIds: [], emailEnabled: true,  enabled: true },
  ],
  webhooks: [],
};

const KV_KEY = "alert:config";

export async function getAlertConfig(kv: KVNamespace, userId?: string): Promise<AlertConfig> {
  const key = userId ? `${KV_KEY}:${userId}` : KV_KEY;
  const raw = await kv.get(key, "json") as AlertConfig | null;
  return raw ?? { ...DEFAULT_CONFIG };
}

export async function setAlertConfig(
  kv: KVNamespace,
  config: AlertConfig,
  userId?: string
): Promise<void> {
  const key = userId ? `${KV_KEY}:${userId}` : KV_KEY;
  await kv.put(key, JSON.stringify(config));
}