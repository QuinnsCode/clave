// src/lib/plugins/resolver.ts
// Single source of truth for plugin config resolution.
// Used by: transcribe route, session room, dashboard, widget config endpoint.

import type { OrgPlugin } from "@/db";
import { TRANSCRIPTION_MODELS, type TranscriptionModelKey } from "@/lib/transcription/models";
import { TRANSCRIPTION_TIERS } from "@/lib/transcription/usage";
import type { RecordingTier } from "@/lib/plugins/recording/types";
// CHANGED: tier definitions live in @/lib/tiers now (the god file).
// VALID_TIERS / AppTier / resolveAppTier below are re-exported from there
// so existing imports of those symbols from this file keep working unchanged.
import { ALL_TIER_KEYS, normalizeTier, type TierKey } from "@/lib/tiers";

export type PluginMode = "sample" | "trial" | "active" | "disabled";

// ── Transcription ─────────────────────────────────────────────────────────────

export interface ResolvedTranscriptionPlugin {
  enabled:           boolean;
  mode:              PluginMode;
  tier:              string;
  tierLabel:         string;
  modelKey:          TranscriptionModelKey;
  modelId:           string;
  capMinutes:        number;
  trialCapMinutes:   number;
  trialEndsAt:       Date | null;
  maxMinutesPerUser: number | null;
  sampleMaxSeconds:  number;
  minutesUsed:       number;
}

const TIER_MODEL: Record<string, TranscriptionModelKey> = {
  free:    "whisper-tiny-en",
  founder: "whisper-large-v3-turbo",
  pro:     "whisper-large-v3-turbo",
  creator: "nova-3",
};

const SAMPLE_MAX_SECONDS = 60;

// ── Canonical tier list ────────────────────────────────────────────────────

// CHANGED: VALID_TIERS / AppTier / resolveAppTier moved to @/lib/tiers so
// there's one source of truth across the app. These re-exports preserve the
// existing import surface — nothing downstream of this file needs to change.
// The legacy alias map (basic/starter/enterprise/unlimited) is preserved
// inside normalizeTier in tiers.ts, plus we added "scale" → "creator".
export const VALID_TIERS    = ALL_TIER_KEYS;
export type  AppTier        = TierKey;
export const resolveAppTier = normalizeTier;
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

export function resolveTranscriptionPlugin(
  plugin: OrgPlugin | null,
  minutesUsed = 0,
): ResolvedTranscriptionPlugin {
  if (!plugin || !plugin.enabled) {
    return {
      enabled:           false,
      mode:              "disabled",
      tier:              "free",
      tierLabel:         "Free",
      modelKey:          "whisper-tiny-en",
      modelId:           TRANSCRIPTION_MODELS["whisper-tiny-en"].id,
      capMinutes:        0,
      trialCapMinutes:   60,
      trialEndsAt:       null,
      maxMinutesPerUser: null,
      sampleMaxSeconds:  SAMPLE_MAX_SECONDS,
      minutesUsed,
    };
  }

  const mode       = resolveMode(plugin);
  const tier        = resolveAppTier(plugin.tier);
  const tierLabel  = TRANSCRIPTION_TIERS[tier as keyof typeof TRANSCRIPTION_TIERS]?.label ?? tier;
  const modelKey   = (TIER_MODEL[tier] ?? "whisper-large-v3-turbo") as TranscriptionModelKey;
  const capMinutes = TRANSCRIPTION_TIERS[tier as keyof typeof TRANSCRIPTION_TIERS]?.capMinutes ?? 600;

  return {
    enabled:           true,
    mode,
    tier,
    tierLabel,
    modelKey,
    modelId:           TRANSCRIPTION_MODELS[modelKey].id,
    capMinutes,
    trialCapMinutes:   plugin.trialMinuteCap ?? 60,
    trialEndsAt:       plugin.trialEndsAt ?? null,
    maxMinutesPerUser: plugin.maxMinutesPerUser ?? null,
    sampleMaxSeconds:  SAMPLE_MAX_SECONDS,
    minutesUsed,
  };
}

function resolveMode(plugin: OrgPlugin): PluginMode {
  if (!plugin.enabled) return "disabled";
  if (plugin.mode === "active") return "active";
  if (plugin.mode === "trial") {
    if (plugin.trialEndsAt && new Date() > plugin.trialEndsAt) return "sample";
    return "trial";
  }
  return "sample";
}

export async function getTranscriptionPlugin(
  db: any,
  organizationId: string,
  kv?: KVNamespace,
): Promise<ResolvedTranscriptionPlugin> {
  const plugin = await db.orgPlugin.findUnique({
    where: { organizationId_plugin: { organizationId, plugin: "transcription" } },
  });

  let minutesUsed = 0;
  if (kv && plugin?.enabled) {
    const { getOrgMinutesUsed } = await import("@/lib/transcription/usage");
    minutesUsed = await getOrgMinutesUsed(kv, organizationId);
  }

  return resolveTranscriptionPlugin(plugin, minutesUsed);
}

export async function getTranscriptionPluginByUserId(
  db: any,
  userId: string,
  kv?: KVNamespace,
): Promise<ResolvedTranscriptionPlugin> {
  const site = await db.site.findFirst({
    where: { userId },
    select: { organizationId: true },
  });
  if (!site?.organizationId) return resolveTranscriptionPlugin(null);
  return getTranscriptionPlugin(db, site.organizationId, kv);
}

// ── Recording ─────────────────────────────────────────────────────────────────

export interface RecordingPluginConfig {
  resolution:      RecordingTier;
  maxHoursPerMonth: number;
  retentionDays:   number;
}

export interface ResolvedRecordingPlugin {
  enabled:         boolean;
  resolution:      RecordingTier;
  maxHoursPerMonth: number;
  retentionDays:   number;
  hoursUsed:       number;         // hydrated where needed, 0 elsewhere
  atCap:           boolean;
}

const RECORDING_DEFAULTS: RecordingPluginConfig = {
  resolution:      "720p",
  maxHoursPerMonth: 10,
  retentionDays:   30,
};

export function resolveRecordingPlugin(
  plugin: OrgPlugin | null,
  hoursUsed = 0,
): ResolvedRecordingPlugin {
  if (!plugin || !plugin.enabled) {
    return {
      enabled:          false,
      resolution:       "720p",
      maxHoursPerMonth: 0,
      retentionDays:    30,
      hoursUsed,
      atCap:            true,     // disabled = always at cap
    };
  }

  // Config blob holds resolution, cap, retention — falls back to defaults
  let config: RecordingPluginConfig = RECORDING_DEFAULTS;
  if (plugin.config) {
    try {
      config = { ...RECORDING_DEFAULTS, ...JSON.parse(plugin.config) };
    } catch { /* malformed config — use defaults */ }
  }

  return {
    enabled:          true,
    resolution:       config.resolution,
    maxHoursPerMonth: config.maxHoursPerMonth,
    retentionDays:    config.retentionDays,
    hoursUsed,
    atCap:            hoursUsed >= config.maxHoursPerMonth,
  };
}

export async function getRecordingPlugin(
  db: any,
  organizationId: string,
  kv?: KVNamespace,
): Promise<ResolvedRecordingPlugin> {
  const plugin = await db.orgPlugin.findUnique({
    where: { organizationId_plugin: { organizationId, plugin: "recording" } },
  });

  // TODO: hydrate hoursUsed from KV when usage tracking is implemented
  return resolveRecordingPlugin(plugin, 0);
}

export async function getRecordingPluginByUserId(
  db: any,
  userId: string,
  kv?: KVNamespace,
): Promise<ResolvedRecordingPlugin> {
  const site = await db.site.findFirst({
    where: { userId },
    select: { organizationId: true },
  });
  if (!site?.organizationId) return resolveRecordingPlugin(null);
  return getRecordingPlugin(db, site.organizationId, kv);
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW section below — nothing above was removed; only the inline tier definitions
// were replaced with re-exports (see CHANGED comment in that section).
// ─────────────────────────────────────────────────────────────────────────────

// ── Diarization ───────────────────────────────────────────────────────────────
//
// Diarization is bundled with the transcription tier — there is no separate
// OrgPlugin row for it today. We derive enabled/mode/tier from the resolved
// transcription plugin, but expose it as its own ResolvedDiarizationPlugin so:
//   - Code that needs to ask "can this org diarize" reads one clean shape
//   - Future divergence (separate tier, separate cap, separate trial) is a
//     surface-level change here, not a hunt across the codebase
//   - The room snapshot can carry a `diarization` block parallel to
//     `transcription` and `recording`
//
// Tier coupling rule today: enabled iff transcription is enabled AND mode is
// not "sample" (i.e. real transcription access, not the 60-second demo).

export interface ResolvedDiarizationPlugin {
  enabled:   boolean;
  mode:      PluginMode;
  tier:      string;
  tierLabel: string;
  // No cap of its own yet — diarization runs once per recorded session, and
  // the recording cap (hoursPerMonth) already gates how many sessions exist
  // to diarize. If we want a separate cap later, add it here.
}

export function resolveDiarizationPlugin(
  transcription: ResolvedTranscriptionPlugin,
): ResolvedDiarizationPlugin {
  // Sample mode (no real transcription access) does not get diarization —
  // the 60-second demo is for the live captions feature, not post-process.
  const enabled = transcription.enabled && transcription.mode !== "sample";

  return {
    enabled,
    mode:      enabled ? transcription.mode : "disabled",
    tier:      transcription.tier,
    tierLabel: transcription.tierLabel,
  };
}

export async function getDiarizationPluginByUserId(
  db: any,
  userId: string,
  kv?: KVNamespace,
): Promise<ResolvedDiarizationPlugin> {
  const transcription = await getTranscriptionPluginByUserId(db, userId, kv);
  return resolveDiarizationPlugin(transcription);
}