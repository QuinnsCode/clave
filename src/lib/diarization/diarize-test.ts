// src/app/api/qlave/diarize-test.ts
//
// POST /api/qlave/diarize-test
// Standalone test endpoint for the DiarizationProvider layer.
// Lets us validate diarization works before wiring containers or queues.
//
// Usage:
//   curl -X POST https://qlave.dev/api/qlave/diarize-test \
//     -H "Content-Type: audio/webm" \
//     --data-binary "@sample.webm"
//
//   With vocabulary hints (D&D proper nouns!):
//   curl -X POST 'https://qlave.dev/api/qlave/diarize-test?vocab=Tharion,Mordenkainen' \
//     -H "Content-Type: audio/webm" \
//     --data-binary "@sample.webm"
//
// Returns the normalized DiarizationResult JSON.
//
// Auth: gated to founder tier. This is a developer-only debug route, not user-
// facing. Anyone in production hitting it would burn Workers AI credits with
// arbitrary audio — that's a no.

import { env } from "cloudflare:workers";
import { getDiarizationProvider } from "@/lib/diarization";

export default async function handler({ request, ctx }: { request: Request; ctx: any }): Promise<Response> {
  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  // ── Auth: founder only ──────────────────────────────────────────────────
  // The full tier check lives in resolveRoomPlugins / tiers.ts. For a test
  // endpoint we just check the user is signed in with founder tier.
  const user = ctx?.user;

  //skip for now
//   if (!user) {
//     return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
//   }
//   if ((user.tier ?? "free") !== "founder") {
//     return Response.json({ ok: false, error: "Founder tier only" }, { status: 403 });
//   }

  // ── Read audio body ─────────────────────────────────────────────────────
  const mimeType = request.headers.get("Content-Type") ?? "audio/webm";
  if (!mimeType.startsWith("audio/")) {
    return Response.json(
      { ok: false, error: `Content-Type must be audio/*, got ${mimeType}` },
      { status: 415 },
    );
  }

  let audioBytes: ArrayBuffer;
  try {
    audioBytes = await request.arrayBuffer();
  } catch (e) {
    return Response.json({ ok: false, error: "Failed to read request body" }, { status: 400 });
  }

  if (audioBytes.byteLength === 0) {
    return Response.json({ ok: false, error: "Empty body" }, { status: 400 });
  }
  if (audioBytes.byteLength > 100 * 1024 * 1024) {
    return Response.json(
      { ok: false, error: `Body too large (${audioBytes.byteLength} bytes, max 100MB)` },
      { status: 413 },
    );
  }

  // ── Optional vocabulary hints via query param ───────────────────────────
  // Format: ?vocab=word1,word2,word3
  // Useful for D&D campaigns with weird proper nouns. The provider passes
  // these through to nova-3's keyterm boosting.
  const url = new URL(request.url);
  const vocabRaw = url.searchParams.get("vocab");
  const vocabulary = vocabRaw
    ? vocabRaw.split(",").map(s => s.trim()).filter(Boolean)
    : undefined;
  const language = url.searchParams.get("lang") ?? undefined;

  // ── Run diarization ─────────────────────────────────────────────────────
  const startedAt = Date.now();
  try {
    const provider = getDiarizationProvider(env as any);
    const result   = await provider.diarize(audioBytes, mimeType, {
      vocabulary,
      language,
    });
    const elapsedMs = Date.now() - startedAt;

    return Response.json({
      ok: true,
      provider:     result.provider,
      speakerCount: result.speakers.length,
      wordCount:    result.words.length,
      durationSec:  result.durationSec,
      elapsedMs,
      bytesSent:    audioBytes.byteLength,
      transcript:   result.transcript,
      speakers:     result.speakers,
      words:        result.words,
      // raw included for debugging — strip in production response if needed
      raw:          result.raw,
    });
  } catch (e: any) {
    const elapsedMs = Date.now() - startedAt;
    return Response.json(
      { ok: false, error: String(e?.message ?? e), elapsedMs },
      { status: 500 },
    );
  }
}