// src/durableObjects/recordingCoordinatorDO.ts
// Coordinates recording for one session.
// Tracks which chunks landed per peer, autosaves to R2 every 3min (JRPG pattern),
// triggers assembly queue fan-out when session ends.
//
// Linked to QlaveSessionDO only by sessionId string.
// Instantiated lazily on first chunk-done — no cost if recording not used.
//
// NEW: when chunk-done arrives with kind="audio" we track it as audioChunkCount
// on the peer record alongside the existing chunkCount. Same peer record,
// different counter — the diarize container reads audioChunkCount to know what
// to concat. Video chunks (default) behave identically to before.

import { putJson } from "@/lib/plugins/recording/r2";
import type { RecordingCoordinatorState, RecordingTier } from "@/lib/plugins/recording/types";
import { enqueueDiarization } from "@/lib/diarization/enqueue";

const AUTOSAVE_INTERVAL_MS = 3 * 60 * 1000; // 3min, same as transcript autosave

export class RecordingCoordinatorDO {
  private state: DurableObjectState;
  private env: Env;
  private coordinator: RecordingCoordinatorState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  // ── HTTP API ──────────────────────────────────────────────────────────────
  // All access via fetch — called from API routes via DO stub.

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    switch (action) {
      case "init":        return this.handleInit(request);
      case "chunk-done":  return this.handleChunkDone(request);
      case "status":      return this.handleStatus();
      case "session-end": return this.handleSessionEnd();
      default:
        return new Response("Unknown action", { status: 400 });
    }
  }

  // ── Init — called once per session when recording starts ──────────────────

  private async handleInit(request: Request): Promise<Response> {
    if (this.coordinator) {
      return Response.json({ ok: true, alreadyInit: true });
    }

    const body = await request.json() as {
      sessionId: string;
      orgId: string;
      siteKey: string;
      tier: RecordingTier;
    };

    this.coordinator = {
      sessionId: body.sessionId,
      orgId:     body.orgId,
      siteKey:   body.siteKey,
      tier:      body.tier,
      startedAt: Date.now(),
      flushed:   false,
      peers:     {},
    };

    await this.state.storage.put("coordinator", this.coordinator);
    await this.state.storage.setAlarm(Date.now() + AUTOSAVE_INTERVAL_MS);

    return Response.json({ ok: true });
  }

  // ── Chunk done — client notifies after successful R2 upload ───────────────

  private async handleChunkDone(request: Request): Promise<Response> {
    await this.ensureLoaded();
    if (!this.coordinator) return Response.json({ ok: false, error: "Not initialized" }, { status: 400 });

    // CHANGED: added optional `kind` field to body type. Default "video"
    // preserves all prior behavior for clients that don't send it.
    const body = await request.json() as {
      peerId: string;
      displayName: string;
      chunkIndex: number;
      r2Key: string;
      kind?: "video" | "audio";
    };

    const { peerId, displayName, chunkIndex } = body;
    // NEW: default kind=video so legacy calls hit the same code path as before.
    const kind = body.kind ?? "video";

    if (!this.coordinator.peers[peerId]) {
      this.coordinator.peers[peerId] = {
        displayName,
        chunkCount: 0,
        lastChunkAt: 0,
        assembled: false,
      };
    }

    const peer = this.coordinator.peers[peerId];
    // CHANGED: bump the right counter based on chunk kind. The peer record
    // shape gains an optional audioChunkCount field (added at the types layer
    // — non-breaking because optional). Video continues to use chunkCount
    // exactly as before, so all existing assembly logic stays valid.
    if (kind === "audio") {
      (peer as any).audioChunkCount = Math.max((peer as any).audioChunkCount ?? 0, chunkIndex + 1);
    } else {
      peer.chunkCount = Math.max(peer.chunkCount, chunkIndex + 1);
    }
    peer.lastChunkAt = Date.now();

    // Persist state — strongly consistent, survives hibernation
    await this.state.storage.put("coordinator", this.coordinator);

    return Response.json({ ok: true });
  }

  // ── Status — polled by API route for server component SSR ─────────────────

  private async handleStatus(): Promise<Response> {
    await this.ensureLoaded();

    if (!this.coordinator) {
      return Response.json({ ok: true, enabled: false, tier: null, peers: {}, assembled: false });
    }

    const allAssembled = Object.values(this.coordinator.peers).every(p => p.assembled);

    return Response.json({
      ok:       true,
      enabled:  true,
      tier:     this.coordinator.tier,
      peers:    this.coordinator.peers,
      assembled: allAssembled && Object.keys(this.coordinator.peers).length > 0,
    });
  }

  // ── Session end — triggered from QlaveSessionDO.flushToD1 ────────────────

  private async handleSessionEnd(): Promise<Response> {
    await this.ensureLoaded();
    if (!this.coordinator || this.coordinator.flushed) {
      return Response.json({ ok: true, skipped: true });
    }

    this.coordinator.flushed = true;
    await this.state.storage.put("coordinator", this.coordinator);

    await this.triggerAssembly();

    return Response.json({ ok: true });
  }

  // ── Alarm — JRPG autosave ─────────────────────────────────────────────────

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    if (!this.coordinator) return;

    await this.syncPeerListToR2();

    if (!this.coordinator.flushed) {
      await this.state.storage.setAlarm(Date.now() + AUTOSAVE_INTERVAL_MS);
    }
  }

  // ── Assembly trigger ──────────────────────────────────────────────────────
  //
  // Called on session end. Fans out:
  //   1. Video assembly via RECORDING_QUEUE  (existing)
  //   2. Per-peer diarization via DIARIZE_QUEUE for peers with audio  (NEW)
  //
  // Both queue sends are best-effort with their own try/catch — one failing
  // shouldn't block the other.
  //

  private async triggerAssembly(): Promise<void> {
    if (!this.coordinator) return;
    const { sessionId, orgId, siteKey } = this.coordinator;
 
    await this.syncPeerListToR2();
 
    // ── Video assembly (existing) ────────────────────────────────────────
    try {
      const queue = (this.env as any).RECORDING_QUEUE as Queue;
      await queue.send({
        type: "session-ended",
        sessionId,
        orgId,
        siteKey,
      });
      console.log(`[RecordingCoordinatorDO] queued assembly for session ${sessionId}`);
    } catch (e) {
      console.error("[RecordingCoordinatorDO] failed to queue assembly:", e);
    }
 
    // ── NEW: per-peer diarization fan-out ────────────────────────────────
    // Source of truth for "this peer has audio worth diarizing" is the
    // audioChunkCount field we track in handleChunkDone. Filter to >0 to
    // skip peers with no audio (video-only recordings, or peers who never
    // unmuted).
    const audioPeerIds = Object.entries(this.coordinator.peers)
      .filter(([_, p]) => ((p as any).audioChunkCount ?? 0) > 0)
      .map(([peerId]) => peerId);
 
    if (audioPeerIds.length === 0) {
      console.log(`[RecordingCoordinatorDO] no audio peers in session ${sessionId} — skipping diarization`);
      return;
    }
 
    try {
      const { enqueued, failed } = await enqueueDiarization(this.env as any, {
        organizationId: orgId,
        siteKey,
        sessionId,
        peerIds:        audioPeerIds,
        // diarizationOpts: omitted for now — provider defaults apply.
        // Wire per-room config from OrgPlugin here when UI lands.
      });
      console.log(`[RecordingCoordinatorDO] diarization fan-out for session ${sessionId}: ${enqueued} enqueued, ${failed} failed`);
    } catch (e) {
      console.error("[RecordingCoordinatorDO] diarization fan-out crashed:", e);
    }
  }

  // ── Sync peer list to R2 — queue consumer reads this ─────────────────────

  private async syncPeerListToR2(): Promise<void> {
    if (!this.coordinator) return;
    const { orgId, sessionId, peers } = this.coordinator;

    try {
        await putJson(this.env as any, `${orgId}/${sessionId}/_peers.json`, {
            peers: Object.keys(peers),
            meta:  peers,
            tier:  this.coordinator.tier, // ← add this
            updatedAt: Date.now(),
        });
    } catch (e) {
      console.error("[RecordingCoordinatorDO] R2 peer sync failed:", e);
    }
  }

  // ── Lazy load from DO storage after hibernation ───────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (this.coordinator) return;
    this.coordinator = await this.state.storage.get<RecordingCoordinatorState>("coordinator") ?? null;
  }
}