"use client";
// src/app/components/Session/RecordingIndicator.tsx
// Displays recording state in the session controls bar.
// Receives state from useRecordingStorage — no logic here.

import type { RecordingState, RecordingTier } from "@/lib/plugins/recording/types";

interface Props {
  state:      RecordingState;
  tier:       RecordingTier;
  chunkCount: number;
  enabled:    boolean;
}

export default function RecordingIndicator({ state, tier, chunkCount, enabled }: Props) {
  if (!enabled || state === "idle" || state === "stopped") return null;

  const isError  = state === "error";
  const isActive = state === "recording" || state === "uploading";

  const wrapCls = isError
    ? "bg-red-950/40 border-red-900/50 text-red-400"
    : "bg-[#1a1a2e] border-[#1e1e3a] text-[#a0a0c0]";

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${wrapCls}`}>
      <span className={`w-1.5 h-1.5 rounded-full bg-red-500 ${isActive ? "animate-pulse" : ""}`} />
      {isError ? "REC ERR" : `REC ${tier} · ${chunkCount}`}
    </div>
  );
}