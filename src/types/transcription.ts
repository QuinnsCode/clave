// src/types/transcription.ts

import type { TierKey } from "@/lib/tiers";

export interface TranscribeInput {
    audioBase64: string;
    mimeType: string;
    previousText?: string;
    language?: string;
    chunkStartTime?: number | undefined;
    model?: string;  // add this
}
  
export interface TranscribeSegment {
    start: number;   // seconds within chunk
    end: number;
    text: string;
}
  
export interface TranscribeResult {
  text: string;
  durationSeconds: number;
  segments: TranscribeSegment[];
  chunkStartTime?: number | undefined;  // echoed back for dedup alignment
}

export interface TranscribeError {
  code: "CAP_REACHED" | "INVALID_AUDIO" | "AI_ERROR" | "INVALID_SITE_KEY";
  message: string;
}

export type TranscribeResponse =
  | { ok: true; result: TranscribeResult }
  | { ok: false; error: TranscribeError };

export interface UsageRecord {
  siteKey: string;
  month: string;
  minutesUsed: number;
  capMinutes: number;
}

export type TranscriptionTier = TierKey;

export interface CaptionMessage {
  type: "caption";
  peerId: string;
  displayName?: string;
  text: string;
  timestamp: number;
  isFinal: boolean;
}