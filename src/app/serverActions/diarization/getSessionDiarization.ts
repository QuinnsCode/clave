"use server";
// src/app/serverActions/diarization/getSessionDiarization.ts
//
// Read-side server action for the drawer. Returns everything the
// SpeakerBubbles + SpeakerTimeline components need to render a session:
//   - utterances (grouped from raw words)
//   - speakers (canonical order)
//   - speakerLabels (display name overrides + "me" pointer)
//   - peerId (which peer this diarization is for)
//   - pod info (id, name, slug)        ← NEW (R1 pods pass)
//   - wordOverrides (edits + locks)    ← NEW (R1 pods pass)
//   - diarizationId                    ← NEW (R1 pods pass) for save actions
//
// CHANGED (R1 pods pass) — the returned utterances have edits applied
// in-place. The component sees the corrected text without doing its own
// merge. Locks are returned alongside so words can be visually marked.
//
// Self-healing: if the session's QlaveSessionLog row has no podId, we lazily
// create a pod-of-1 and attach it. This matches pipeline Phase 0 behavior
// for sessions that pre-date the R1 release.
//
// CHANGED (R1.5 fix) — pod self-heal now calls `createPodService` (the pure
// service) instead of the `createPod` server action. We're already inside a
// server action with a verified org; bouncing through another server action
// just re-validates the auth needlessly and risks signature mismatches.

import { db } from "@/db";
import {
  groupWordsToUtterances,
  parseWordOverrides,
  applyEditsToWords,
  type Utterance,
  type DiarizedWord,
  type WordOverrides,
} from "@/lib/diarization/utterances";
import { createPodService } from "@/lib/pods/podsService";

interface SpeakerLabelsParsed {
  labels?: Record<string, string>;
  me?:     string;
}

interface PodInfo {
  id:   string;
  name: string;
  slug: string;
}

export interface SessionDiarizationView {
  diarizationId: string;
  peerId:        string;
  speakers:      string[];
  utterances:    Utterance[];        // with edits already applied
  speakerLabels: SpeakerLabelsParsed | null;
  durationSec:   number | null;
  // NEW (R1 pods pass)
  pod:           PodInfo | null;
  overrides:     WordOverrides;
}

export async function getSessionDiarization(
  sessionId: string,
  userId:    string,
  orgId:     string,
): Promise<SessionDiarizationView | null> {

  console.log("[getSessionDiarization] called with:", { sessionId, userId, orgId });

  if (!sessionId || !orgId) {
    console.log("[getSessionDiarization] missing inputs, returning null");
    return null;
  }

  // Most recent successful diarization for this session, scoped to the org.
  // (Multiple diarization rows can exist per session for A/B testing — we
  // pick the latest "done" row.)
  const row = await db.sessionDiarization.findFirst({
    where: {
      sessionId,
      organizationId: orgId,
      status:         "done",
    },
    orderBy: { createdAt: "desc" },
    select: {
      id:            true,
      peerId:        true,
      result:        true,
      speakerLabels: true,
      durationSec:   true,
      siteKey:       true,
      wordOverrides: true,
    },
  });

  console.log("[getSessionDiarization] row found:", row?.id, "peerId:", row?.peerId, "result_len:", row?.result?.length);

  if (!row || !row.result) {
    console.log("[getSessionDiarization] returning null - no row or no result");
    return null;
  }

  // Parse the slim result blob the pipeline wrote.
  let parsedResult: { words?: DiarizedWord[]; speakers?: string[] } = {};
  try {
    parsedResult = JSON.parse(row.result);
  } catch (err) {
    console.error("[getSessionDiarization] failed to parse result JSON:", err);
    return null;
  }
  const rawWords: DiarizedWord[] = parsedResult.words ?? [];
  const speakers: string[]       = parsedResult.speakers ?? [];

  console.log("[getSessionDiarization] parsed result. words:", rawWords.length, "speakers:", speakers.length);

  // Parse overrides and apply edits BEFORE grouping. This way utterance text
  // (joined token string) reflects the corrected words, AND each Utterance's
  // .words[] array carries the corrected text per-word for the UI.
  const overrides    = parseWordOverrides(row.wordOverrides);
  const editedWords  = applyEditsToWords(rawWords, overrides.edits);
  const utterances   = groupWordsToUtterances(editedWords);

  // Parse speaker labels (may be null/malformed)
  let speakerLabels: SpeakerLabelsParsed | null = null;
  if (row.speakerLabels) {
    try { speakerLabels = JSON.parse(row.speakerLabels); } catch { speakerLabels = null; }
  }

  // Look up + lazily heal the session's pod.
  let pod: PodInfo | null = null;
  try {
    pod = await resolveSessionPod({
      sessionId,
      siteKey:        row.siteKey,
      organizationId: orgId,
    });
  } catch (err) {
    console.error("[getSessionDiarization] resolveSessionPod threw:", err);
    pod = null;
  }

  console.log("[getSessionDiarization] returning view. peerId:", row.peerId, "utterances:", utterances.length, "pod:", pod?.id ?? "null");

  return {
    diarizationId: row.id,
    peerId:        row.peerId,
    speakers,
    utterances,
    speakerLabels,
    durationSec:   row.durationSec,
    pod,
    overrides,
  };
}

// ── Pod resolution + lazy self-heal ─────────────────────────────────────────
// NEW (R1 pods pass).
//
// The session might:
//   (a) Have a QlaveSessionLog row with podId set → return that pod.
//   (b) Have a QlaveSessionLog row but podId is null → create pod-of-1, link, return.
//   (c) Have no QlaveSessionLog row → return null (drawer renders "no pod yet").
//
// (b) is the self-healing path for sessions created before this release.

async function resolveSessionPod(args: {
  sessionId:      string;
  siteKey:        string;
  organizationId: string;
}): Promise<PodInfo | null> {
  const { sessionId, siteKey, organizationId } = args;

  const log = await db.qlaveSessionLog.findFirst({
    where:  { sessionId, siteKey },
    select: {
      id: true,
      pod: { select: { id: true, name: true, slug: true } },
    },
  });

  if (!log) return null;                       // case (c)
  if (log.pod) return log.pod;                 // case (a)

  // case (b) — heal it.
  // NOTE: we call the SERVICE (createPodService), not the server action.
  // Server actions read auth from requestInfo.ctx; we're already inside an
  // authenticated server-side flow with a verified orgId in hand. Calling
  // the service directly avoids signature mismatches and a redundant auth
  // bounce.
  try {
    const created = await createPodService({ organizationId });
    if (!created.ok || !created.data) {
      console.error(`[getSessionDiarization] createPodService failed for session ${sessionId}:`, created.error);
      return null;
    }
    await db.qlaveSessionLog.update({
      where: { id: log.id },
      data:  { podId: created.data.id },
    });
    return {
      id:   created.data.id,
      name: created.data.name,
      slug: created.data.slug,
    };
  } catch (err) {
    console.error(`[getSessionDiarization] pod self-heal failed for session ${sessionId}:`, err);
    return null;
  }
}