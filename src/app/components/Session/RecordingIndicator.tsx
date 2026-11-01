"use client";
// src/app/components/Session/RecordingIndicator.tsx
// Displays recording state in the session controls bar.
// Receives state from useRecordingStorage — no logic here.
//
// NEW: when audioEnabled is true, renders a second "AUD" pill alongside the
// REC pill. This makes the two parallel data streams (video and audio-only)
// visible to the user — and to us, when verifying audio chunks are landing
// in R2 for the post-session diarization pipeline.
//
// Time display: chunks * 2.5s → formatted as "42s", "1.2m", or "1h 4m".
// Fixed-width tabular-nums so digits don't shift neighboring elements.

import type { RecordingState, RecordingTier } from "@/lib/plugins/recording/types";

interface Props {
  state:      RecordingState;
  tier:       RecordingTier;
  chunkCount: number;
  enabled:    boolean;
  // both optional — existing call sites without them still work unchanged.
  audioEnabled?:    boolean;
  audioChunkCount?: number;
}

// ── Time formatter ────────────────────────────────────────────────────────────
// Input: chunk count. Each chunk is CHUNK_DURATION_MS = 2500ms = 2.5s.
// Output: "42s" | "1.2m" | "1h 4m"

function formatRecordingTime(chunks: number): string {
  const secs = Math.floor(chunks * 2.5);
  if (secs < 60) return `${secs}s`;
  const totalMins = secs / 60;
  if (totalMins < 60) return `${totalMins.toFixed(1)}m`;
  const h = Math.floor(totalMins / 60);
  const m = Math.floor(totalMins % 60);
  return `${h}h ${m}m`;
}

export default function RecordingIndicator({
  state,
  tier,
  chunkCount,
  enabled,
  audioEnabled = false,
  audioChunkCount = 0,
}: Props) {
  if (!enabled || state === "idle" || state === "stopped") return null;

  const isError  = state === "error";
  const isActive = state === "recording" || state === "uploading";

  const wrapCls = isError
    ? "bg-red-950/40 border-red-900/50 text-red-400"
    : "bg-[#1a1a2e] border-[#1e1e3a] text-[#a0a0c0]";

  const audioWrapCls = "bg-[#1a1a2e] border-[#1e1e3a] text-[#a0a0c0]";

  // Dot color: green when recording, red when error
  const dotColor = isError ? "bg-red-500" : "bg-green-500";

  return (
    <>
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${wrapCls}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor} ${isActive ? "animate-pulse" : ""}`} />
        <span>{isError ? "REC ERR" : `REC ${tier}`}</span>
        {!isError && (
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "3ch", display: "inline-block", textAlign: "right" }}>
            {formatRecordingTime(chunkCount)}
          </span>
        )}
      </div>
      {audioEnabled && (
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ml-1.5 ${audioWrapCls}`}>
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 bg-purple-500 ${isActive ? "animate-pulse" : ""}`} />
          <span>AUD</span>
          <span style={{ fontVariantNumeric: "tabular-nums", minWidth: "3ch", display: "inline-block", textAlign: "right" }}>
            {formatRecordingTime(audioChunkCount)}
          </span>
        </div>
      )}
    </>
  );
}