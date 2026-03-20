// src/lib/plugins/resolver.ts
// Single source of truth for plugin config resolution.
// Used by: transcribe route, session room, dashboard, widget config endpoint.

import type { OrgPlugin } from "@/db";
import { TRANSCRIPTION_MODELS, type TranscriptionModelKey } from "@/lib/transcription/models";
import { TRANSCRIPTION_TIERS } from "@/lib/transcription/usage";
import type { RecordingTier } from "@/lib/plugins/recording/types";

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
  const tier       = plugin.tier ?? "pro";
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