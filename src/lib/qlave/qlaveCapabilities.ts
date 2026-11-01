// src/lib/qlave/qlaveCapabilities.ts
//
// NEW FILE. Resolves what subsystems actually run in a qlave session.
//
// Inputs:  the owner's UI choices + their already-resolved plugin states
// Outputs: a flat SessionCapabilities object that hooks and queue consumers
//          read from. No tier logic here — tiers live in @/lib/tiers.
//
// Why this layer exists:
//   - Capability flags are derived from {user choice} ∩ {tier allows it}.
//     Doing that math inline in every hook and queue consumer guarantees drift.
//   - The owner picks at room-creation time; we snapshot the result into
//     room.plugins.capabilities so visitors inherit the owner's resolved set
//     and nothing changes mid-session if the owner's tier flips.
//
// Back-compat:
//   Code reading caps from a pre-existing room (no `capabilities` snapshot)
//   should call deriveCapabilitiesFromLegacyRoom() with the legacy
//   {transcription, recording} blocks. It returns sensible defaults with
//   diarize=false so nothing in any live or old session breaks.

import type {
    ResolvedTranscriptionPlugin,
    ResolvedRecordingPlugin,
    ResolvedDiarizationPlugin,
  } from "@/lib/plugins/resolver";
  
  // ── UI-facing options ────────────────────────────────────────────────────────
  // What the create-room UI collects. Owner picks for the whole room.
  
  export interface SessionUIOptions {
    recordVideo:  boolean;
    liveCaptions: boolean;
    diarize:      boolean;
  }
  
  // Defaults: everything off. The create-room route uses these when the request
  // body has no `ui` field (back-compat with clients that don't yet send it).
  export const DEFAULT_UI_OPTIONS: SessionUIOptions = {
    recordVideo:  false,
    liveCaptions: false,
    diarize:      false,
  };
  
  // ── Resolved capabilities ────────────────────────────────────────────────────
  // What actually runs. Hooks (useRecordingStorage, useTranscribe) and the
  // post-process queue consumer read from here, not from SessionUIOptions.
  
  export interface SessionCapabilities {
    capture: {
      videoRecorder:  boolean;
      audioRecorder:  boolean;   // forced true when videoRecorder OR diarize
      liveTranscribe: boolean;
    };
    postProcess: {
      diarize: boolean;
    };
    // Planned-for, always disabled in v1. Vocabulary work (custom dictionary,
    // correction learning) is on the roadmap; we leave the shape here so it's
    // already in the room snapshot when we build it out — no migration needed.
    vocabulary: {
      enabled: false;
      learn:   false;
    };
  }
  
  // ── Resolver ─────────────────────────────────────────────────────────────────
  
  export interface CapabilityTierContext {
    transcription: ResolvedTranscriptionPlugin;
    recording:     ResolvedRecordingPlugin;
    diarization:   ResolvedDiarizationPlugin;
  }
  
  export function resolveCapabilities(
    ui:   SessionUIOptions,
    tier: CapabilityTierContext,
  ): SessionCapabilities {
  
    // Each branch: "user asked for it AND tier allows it".
    // Note recording also has a cap (atCap) — even if the tier is enabled,
    // we don't start a recorder when the org is over its monthly limit.
    const liveTranscribe = ui.liveCaptions && tier.transcription.enabled;
    const diarize        = ui.diarize      && tier.diarization.enabled;
    const videoRecorder  = ui.recordVideo  && tier.recording.enabled && !tier.recording.atCap;
  
    // Audio recorder is forced on whenever video records OR diarize runs.
    //   - With video: audio is a cheap backup if the video stream fails
    //     (~7 MB / 30min / peer extra for Opus — negligible vs video)
    //   - With diarize: diarization literally cannot run without stored audio,
    //     and a chunked-but-not-stitched audio track would break per-speaker
    //     consistency. We need one continuous audio file per peer.
    const audioRecorder = videoRecorder || diarize;
  
    return {
      capture: {
        videoRecorder,
        audioRecorder,
        liveTranscribe,
      },
      postProcess: {
        diarize,
      },
      vocabulary: {
        enabled: false,
        learn:   false,
      },
    };
  }
  
  // ── Back-compat: derive caps for rooms without a snapshot ────────────────────
  // Old rooms have room.plugins.transcription and room.plugins.recording but no
  // `capabilities` snapshot. This rebuilds a sensible SessionCapabilities from
  // those legacy fields so nothing breaks for in-flight sessions.
  
  export interface LegacyRoomPluginsSnapshot {
    transcription?: { enabled: boolean };
    recording?:     { enabled: boolean };
  }
  
  export function deriveCapabilitiesFromLegacyRoom(
    legacy: LegacyRoomPluginsSnapshot,
  ): SessionCapabilities {
    const videoRecorder  = !!legacy.recording?.enabled;
    // Legacy rooms only ever had A/V video recording — no parallel audio track.
    // The audio backup behavior is a new-rooms-only feature.
    const audioRecorder  = videoRecorder;
    const liveTranscribe = !!legacy.transcription?.enabled;
  
    return {
      capture: {
        videoRecorder,
        audioRecorder,
        liveTranscribe,
      },
      postProcess: {
        // Never on for legacy rooms — they never had audio-only chunks stored
        // separately, so there's nothing to diarize even if we wanted to.
        diarize: false,
      },
      vocabulary: {
        enabled: false,
        learn:   false,
      },
    };
  }
  
  // ── UI coupling rules ────────────────────────────────────────────────────────
  // Helper for the create-room UI to know which toggles to force/disable as the
  // user clicks around. Mirrors the constraints in resolveCapabilities so the UI
  // never lets the user pick something invalid (e.g. diarize on + audio off).
  
  export interface UICoupling {
    forceAudioRecorder:  boolean;
    audioRecorderReason: string | null;
  }
  
  export function deriveUICoupling(ui: SessionUIOptions): UICoupling {
    if (ui.diarize) {
      return {
        forceAudioRecorder:  true,
        audioRecorderReason: "Required for diarization",
      };
    }
    if (ui.recordVideo) {
      return {
        forceAudioRecorder:  true,
        audioRecorderReason: "Bundled with video recording",
      };
    }
    return {
      forceAudioRecorder:  false,
      audioRecorderReason: null,
    };
  }