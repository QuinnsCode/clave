// lib/transcription/usage.ts
// Two-layer usage tracking:
//   KV  — fast enforcement on every request (org cap + per-user slice)
//   D1  — async analytics via Queue (see transcription-usage-worker.ts)

const KV_TTL = 60 * 60 * 24 * 40; // 40 days — full month + buffer

// ── Key builders ──────────────────────────────────────────────────────────────

function monthStr() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function orgCapKey(orgId: string)                    { return `transcribe:cap:${orgId}:${monthStr()}`; }
export function userSliceKey(orgId: string, userId: string) { return `transcribe:cap:${orgId}:${userId}:${monthStr()}`; }
export function trialTotalKey(orgId: string)                { return `transcribe:trial:${orgId}`; }

// ── Tier caps ─────────────────────────────────────────────────────────────────
// capMinutes: 0 = unlimited (founder / internal)

export const TRANSCRIPTION_TIERS = {
  free:    { capMinutes: 0,    monthlyPrice: 0,  label: "Free"    },
  founder: { capMinutes: 0,    monthlyPrice: 0,  label: "Founder" }, // secret — manual grant only
  pro:     { capMinutes: 600,  monthlyPrice: 8,  label: "Pro"     }, // early adopter price
  creator: { capMinutes: 3000, monthlyPrice: 20, label: "Creator" },
} as const;

export type TierKey = keyof typeof TRANSCRIPTION_TIERS;

export function getCapForTier(tier: string): number {
  return TRANSCRIPTION_TIERS[tier as TierKey]?.capMinutes ?? 0;
}

export function getLabelForTier(tier: string): string {
  return TRANSCRIPTION_TIERS[tier as TierKey]?.label ?? tier;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export interface OrgUsage {
  orgMinutesUsed:   number;
  userMinutesUsed:  number;
  trialMinutesUsed: number;
}

export async function getOrgUsage(
  kv: KVNamespace,
  orgId: string,
  userId: string
): Promise<OrgUsage> {
  const [orgRaw, userRaw, trialRaw] = await Promise.all([
    kv.get(orgCapKey(orgId)),
    kv.get(userSliceKey(orgId, userId)),
    kv.get(trialTotalKey(orgId)),
  ]);
  return {
    orgMinutesUsed:   orgRaw   ? parseFloat(orgRaw)   : 0,
    userMinutesUsed:  userRaw  ? parseFloat(userRaw)  : 0,
    trialMinutesUsed: trialRaw ? parseFloat(trialRaw) : 0,
  };
}

// Org-level only — for dashboard display (no userId needed)
export async function getOrgMinutesUsed(kv: KVNamespace, orgId: string): Promise<number> {
  const raw = await kv.get(orgCapKey(orgId));
  return raw ? parseFloat(raw) : 0;
}

// ── Check + increment ─────────────────────────────────────────────────────────

export type DenyReason = "ORG_CAP" | "USER_CAP" | "TRIAL_CAP" | "TRIAL_EXPIRED" | "SAMPLE_ONLY" | "DISABLED";

export interface UsageCheckResult {
  allowed:    boolean;
  denyReason: DenyReason | null;
  usage:      OrgUsage;
}

export async function checkAndIncrementUsage(
  kv: KVNamespace,
  orgId: string,
  userId: string,
  addSeconds: number,
  opts: {
    mode:              "sample" | "trial" | "active";
    capMinutes:        number;
    trialCapMinutes:   number;
    trialEndsAt:       Date | null;
    maxMinutesPerUser: number | null;
  }
): Promise<UsageCheckResult> {
  const addMinutes = addSeconds / 60;
  const usage = await getOrgUsage(kv, orgId, userId);

  if (opts.mode === "sample")   return { allowed: false, denyReason: "SAMPLE_ONLY", usage };
  if (opts.mode === "disabled") return { allowed: false, denyReason: "DISABLED",    usage };

  if (opts.mode === "trial" && opts.trialEndsAt && new Date() > opts.trialEndsAt)
    return { allowed: false, denyReason: "TRIAL_EXPIRED", usage };

  if (opts.mode === "trial" && usage.trialMinutesUsed >= opts.trialCapMinutes)
    return { allowed: false, denyReason: "TRIAL_CAP", usage };

  // capMinutes 0 = unlimited (founder tier bypasses this check)
  if (opts.mode === "active" && opts.capMinutes > 0 && usage.orgMinutesUsed >= opts.capMinutes)
    return { allowed: false, denyReason: "ORG_CAP", usage };

  if (opts.maxMinutesPerUser && usage.userMinutesUsed >= opts.maxMinutesPerUser)
    return { allowed: false, denyReason: "USER_CAP", usage };

  const writes: Promise<void>[] = [
    kv.put(orgCapKey(orgId),            String(usage.orgMinutesUsed  + addMinutes), { expirationTtl: KV_TTL }),
    kv.put(userSliceKey(orgId, userId), String(usage.userMinutesUsed + addMinutes), { expirationTtl: KV_TTL }),
  ];
  if (opts.mode === "trial") {
    writes.push(kv.put(trialTotalKey(orgId), String(usage.trialMinutesUsed + addMinutes), { expirationTtl: KV_TTL }));
  }
  await Promise.all(writes);

  return {
    allowed: true,
    denyReason: null,
    usage: {
      orgMinutesUsed:   usage.orgMinutesUsed   + addMinutes,
      userMinutesUsed:  usage.userMinutesUsed  + addMinutes,
      trialMinutesUsed: usage.trialMinutesUsed + (opts.mode === "trial" ? addMinutes : 0),
    },
  };
}