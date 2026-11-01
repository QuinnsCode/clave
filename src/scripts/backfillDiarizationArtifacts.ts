// src/scripts/backfillDiarizationArtifacts.ts
//
// ONE-TIME MIGRATION SCRIPT — run after deploying migration 0025
// (add-artifact-tracking).
//
// WHY THIS EXISTS:
// Migration 0025 added per-step artifact tracking fields to SessionDiarization
// (audioKey, waveformKey, diarizationKey, timelineKey + bytes/status/timestamps
// for each). Existing rows have all those new fields as null. This script
// populates them from what's actually in R2.
//
// It also copies the LEGACY r2Key field into the new diarizationKey for
// existing rows so all code can read from one consistent place going forward.
//
// WHEN TO RUN:
// - Once, after `pnpm migrate:prd` for migration 0025
// - Safe to run multiple times (idempotent — skips rows already backfilled)
// - Run against production: `pnpm backfill:diarization-artifacts`
//
// WHEN NOT TO RUN AGAIN:
// - New diarization runs (via the new runPipeline harness) populate all
//   artifact fields directly at write time. Backfill only matters for
//   pre-harness rows.
//
// WHAT IT DOES per row (idempotent — checks for null before writing):
//   1. If diarizationKey is null but r2Key is set → copy r2Key into diarizationKey
//   2. HEAD R2 for {org}/{session}/{peer}/audio.webm
//      If exists → set audioKey, audioBytes, audioStatus="done", audioGeneratedAt
//   3. HEAD R2 for {org}/{session}/{peer}/waveform.dat
//      If exists → set waveformKey, waveformBytes, waveformStatus="done", etc
//      (waveformPps comes from R2 customMetadata if present)
//   4. HEAD R2 for {org}/{session}/{peer}/timeline.json
//      Same pattern
//   5. HEAD R2 for the diarizationKey path itself
//      If exists → set diarizationBytes, diarizationStatus="done",
//      diarizationGeneratedAt
//
// FALLBACK BEHAVIOR:
// If R2 HEAD fails for a file, the corresponding fields stay null. Status
// fields use null = "never checked / unknown" rather than "failed" so the
// UI can distinguish "not done yet" from "tried and failed".
//
// PROGRESS:
// Logs every 10 rows + a final summary.

import { db, setupDb } from "@/db";
import { env } from "cloudflare:workers";

await setupDb(env);

// ── R2 key helpers — same shape used by runPostProcessing.ts ───────────────
const audioKey      = (o: string, s: string, p: string) => `${o}/${s}/${p}/audio.webm`;
const waveformKey   = (o: string, s: string, p: string) => `${o}/${s}/${p}/waveform.dat`;
const timelineKey   = (o: string, s: string, p: string) => `${o}/${s}/${p}/timeline.json`;

// ── Find candidate rows ────────────────────────────────────────────────────
// We process EVERY row, not just incomplete ones, because:
//   - Some rows may have partial backfill from a previous incomplete run
//   - HEAD is cheap (~50ms per object)
//   - The per-field null check inside the loop is what makes it idempotent
const rows = await db.sessionDiarization.findMany({
  select: {
    id: true,
    organizationId: true,
    sessionId: true,
    peerId: true,
    r2Key: true,
    diarizationKey: true,
    audioKey: true,
    waveformKey: true,
    timelineKey: true,
  },
});

console.log(`[backfill] found ${rows.length} diarization rows to inspect`);

const bucket = (env as any).RECORDING_BUCKET as R2Bucket;
if (!bucket) {
  throw new Error("RECORDING_BUCKET binding not found — check wrangler config");
}

// ── Per-row backfill ───────────────────────────────────────────────────────
let processed = 0;
let updated   = 0;
let r2Missing = 0;
const errors: string[] = [];

for (const row of rows) {
  processed++;
  const { id, organizationId, sessionId, peerId } = row;

  // Build the per-row update patch. Only fields that need backfilling go in.
  const patch: Record<string, unknown> = {};

  try {
    // (1) Copy r2Key → diarizationKey if missing
    if (!row.diarizationKey && row.r2Key) {
      patch.diarizationKey = row.r2Key;
    }

    // (2) Audio — HEAD R2 for the canonical path
    if (!row.audioKey) {
      const key = audioKey(organizationId, sessionId, peerId);
      const head = await bucket.head(key);
      if (head) {
        patch.audioKey         = key;
        patch.audioBytes       = head.size;
        patch.audioStatus      = "done";
        patch.audioGeneratedAt = head.uploaded;
      }
      // If not found, leave fields null (status null = "never checked").
    }

    // (3) Waveform
    if (!row.waveformKey) {
      const key = waveformKey(organizationId, sessionId, peerId);
      const head = await bucket.head(key);
      if (head) {
        patch.waveformKey         = key;
        patch.waveformBytes       = head.size;
        patch.waveformStatus      = "done";
        patch.waveformGeneratedAt = head.uploaded;
        // pps lives in customMetadata.pps per runPostProcessing's put options.
        const pps = head.customMetadata?.pps;
        if (typeof pps === "string") {
          patch.waveformPps = pps;
        }
      }
    }

    // (4) Timeline
    if (!row.timelineKey) {
      const key = timelineKey(organizationId, sessionId, peerId);
      const head = await bucket.head(key);
      if (head) {
        patch.timelineKey         = key;
        patch.timelineBytes       = head.size;
        patch.timelineStatus      = "done";
        patch.timelineGeneratedAt = head.uploaded;
      }
    }

    // (5) Diarization JSON — populate the bytes/status/timestamp on the
    //     existing or newly-copied diarizationKey path
    const diarKey = patch.diarizationKey ?? row.diarizationKey;
    if (typeof diarKey === "string" && diarKey.length > 0) {
      const head = await bucket.head(diarKey);
      if (head) {
        // Only set fields if not already present (idempotent on re-run)
        if (!row.diarizationKey || patch.diarizationKey) {
          // diarizationKey was just set above OR was already there but other
          // fields may still be null — set the rest unconditionally since
          // these are derived from R2 which is source of truth.
          patch.diarizationBytes       = head.size;
          patch.diarizationStatus      = "done";
          patch.diarizationGeneratedAt = head.uploaded;
        }
      } else {
        // r2Key/diarizationKey pointed at a file that no longer exists.
        // Mark status so we can see it in the UI/admin and decide what to do.
        if (patch.diarizationKey || row.diarizationKey) {
          patch.diarizationStatus = "missing";
          patch.diarizationError  = "r2 object not found at key";
          r2Missing++;
        }
      }
    }

    // Skip update if nothing to write (row was already complete)
    if (Object.keys(patch).length === 0) {
      continue;
    }

    await db.sessionDiarization.update({
      where: { id },
      data:  patch,
    });
    updated++;
  } catch (err: any) {
    const msg = `row ${id}: ${err?.message ?? err}`;
    console.error(`[backfill] ${msg}`);
    errors.push(msg);
  }

  if (processed % 10 === 0) {
    console.log(`[backfill] ${processed}/${rows.length} processed, ${updated} updated`);
  }
}

// ── Summary ────────────────────────────────────────────────────────────────
console.log(`[backfill] DONE`);
console.log(`[backfill]   processed:   ${processed}`);
console.log(`[backfill]   updated:     ${updated}`);
console.log(`[backfill]   no changes:  ${processed - updated - errors.length}`);
console.log(`[backfill]   r2 missing:  ${r2Missing}`);
console.log(`[backfill]   errors:      ${errors.length}`);
if (errors.length > 0) {
  console.log(`[backfill] error details:`);
  for (const e of errors) console.log(`[backfill]   - ${e}`);
}