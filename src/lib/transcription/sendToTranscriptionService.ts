// lib/transcription/sendToTranscriptionService.ts
// Wraps either CF Workers AI or a MurmurQ node.
// Swap TRANSCRIPTION_BACKEND env var to switch — no call-site changes needed.

import type { TranscribeInput, TranscribeResult } from "@/types";

// "cf" | "murmurq"
const BACKEND = (typeof process !== "undefined" ? process.env : (globalThis as any).env)
  ?.TRANSCRIPTION_BACKEND ?? "cf";

// Only used when BACKEND === "murmurq"
const MURMURQ_URL    = (typeof process !== "undefined" ? process.env : (globalThis as any).env)
  ?.MURMURQ_URL ?? "http://localhost:3000";
const MURMURQ_SECRET = (typeof process !== "undefined" ? process.env : (globalThis as any).env)
  ?.MURMURQ_SECRET;

// ── CF runner (your existing logic, untouched) ─────────────────────────────

async function sendToCF(
  ai: Ai,
  input: TranscribeInput
): Promise<TranscribeResult> {
  const { transcribeAudio } = await import("./transcribe");
  return transcribeAudio(ai, input);
}

// ── MurmurQ runner ─────────────────────────────────────────────────────────

async function sendToMurmurQ(input: TranscribeInput): Promise<TranscribeResult> {
  const res = await fetch(`${MURMURQ_URL}/transcribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(MURMURQ_SECRET ? { Authorization: `Bearer ${MURMURQ_SECRET}` } : {}),
    },
    body: JSON.stringify({
      audio:          input.audioBase64,
      language:       input.language,
      previousText:   input.previousText,
      chunkStartTime: input.chunkStartTime,
      ext:            mimeToExt(input.mimeType),
    }),
  });

  if (res.status === 503) throw new Error("murmurq: all workers busy");
  if (!res.ok)            throw new Error(`murmurq: ${res.status} ${await res.text()}`);

  const data = await res.json() as TranscribeResult & { error?: string };
  if (data.error) throw new Error(`murmurq: ${data.error}`);
  return data;
}

// ── Dispatcher ─────────────────────────────────────────────────────────────

export async function sendToTranscriptionService(
  ai: Ai | null,
  input: TranscribeInput
): Promise<TranscribeResult> {
  if (BACKEND === "murmurq") {
    return sendToMurmurQ(input);
  }
  if (!ai) throw new Error("CF Workers AI binding required when BACKEND=cf");
  return sendToCF(ai, input);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function mimeToExt(mime?: string): string {
  const map: Record<string, string> = {
    "audio/webm":  ".webm",
    "audio/wav":   ".wav",
    "audio/mp4":   ".m4a",
    "audio/mpeg":  ".mp3",
    "audio/ogg":   ".ogg",
  };
  return map[mime ?? ""] ?? ".wav";
}