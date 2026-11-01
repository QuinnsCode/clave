// src/durableObjects/qlaveSessionDO.ts
// Signaling-only DO — never touches media.
// Tracks usage in KV (live) and flushes to D1 on session end via alarm.
// Pro tier: persists transcript chunks to DO storage — survives refresh forever.
//
// Crash safety:
//   - sessionState persisted to DO KV storage on every meaningful change
//   - Reconstructed from storage on restart
//   - Alarm always set — fires even after crash, reconstructs + flushes
//   - KV always has latest snapshot for orphan recovery
//
// Identity model:
//   roomCode  — stored on first connect, used at flush to read the room snapshot
//   orgId     — read from room snapshot at flush time, passed to diarize queue
//   siteKey   — read from room snapshot, used for billing KV keys
// The DO never re-derives identity from userId. It trusts the room snapshot.

import { setupDb, db } from "@/db";

const TRANSCRIPT_SAVE_INTERVAL_MS = 3 * 60 * 1000;
const KV_TTL_SECONDS              = 60 * 60 * 24 * 2; // 48hr — covers crash + recovery window
const MAX_TRANSCRIPT_CHUNKS       = 5000;
const SILENCE_GAP_MS              = 10_000; // 10s gap = silence
const STATE_STORAGE_KEY           = "sessionState";

// ── Session state — persisted to DO KV storage ────────────────────────────────

interface SessionState {
  sessionId:           string;
  roomCode:            string | null; // stored on first connect, used at flush to read room snapshot
  siteKey:             string;
  startedAt:           number;
  peakPeers:           number;
  messageCount:        number;
  peerIds:             string[];
  peerNames:           Record<string, string>;
  flushed:             boolean;
  // ── Usage tracking ─────────────────────────────────────────────────────────
  peerJoinTimes:       Record<string, number>; // peerId → joinedAt ms
  peerMinutes:         number;                 // accumulated peer-minutes
  transcriptChunks:    number;                 // total captions received
  lastCaptionAt:       number;                 // ms, for silence tracking
  silenceMs:           number;                 // accumulated silence
}

// ── DO ────────────────────────────────────────────────────────────────────────

export class QlaveSessionDO {
  private state:        DurableObjectState;
  private env:          Env;
  private sessionState: SessionState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env   = env;

    // Restore persisted state on restart/crash — blocks until complete
    this.state.blockConcurrencyWhile(async () => {
      try {
        const stored = await this.state.storage.get<SessionState>(STATE_STORAGE_KEY);
        if (stored && !stored.flushed) {
          this.sessionState = stored;
          console.log(`[QlaveSessionDO] Restored session ${stored.sessionId} from storage`);
        }
      } catch (e) {
        console.error("[QlaveSessionDO] Failed to restore state:", e);
      }
    });
  }

  // ── Persist state to DO storage ───────────────────────────────────────────

  private async persistState(): Promise<void> {
    if (!this.sessionState) return;
    try {
      await this.state.storage.put(STATE_STORAGE_KEY, this.sessionState);
    } catch (e) {
      console.error("[QlaveSessionDO] Failed to persist state:", e);
    }
  }

  // ── Fetch / WebSocket upgrade ─────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url     = new URL(request.url);
    const peerId  = url.searchParams.get("peerId");
    const siteKey = url.searchParams.get("siteKey") ?? "unknown";

    if (request.method === "GET" && url.pathname.endsWith("/transcript")) {
      return this.handleGetTranscript(request);
    }

    if (!peerId) return new Response("Missing peerId", { status: 400 });
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    // Init session state if not already set (new session or first peer after crash)
    if (!this.sessionState) {
      const roomCode        = url.searchParams.get("roomCode");
      const raw             = roomCode
        ? await (this.env as any).RATELIMIT_KV.get(`room:${roomCode}`, "json") as any
        : null;
      const sessionId       = raw?.sessionId ?? this.state.id.toString();
      const resolvedSiteKey = raw?.siteKey   ?? siteKey;

      this.sessionState = {
        sessionId,
        roomCode:         roomCode ?? null,
        siteKey:          resolvedSiteKey,
        startedAt:        Date.now(),
        peakPeers:        0,
        messageCount:     0,
        peerIds:          [],
        peerNames:        {},
        flushed:          false,
        peerJoinTimes:    {},
        peerMinutes:      0,
        transcriptChunks: 0,
        lastCaptionAt:    0,
        silenceMs:        0,
      };

      await this.persistState();
      await this.state.storage.setAlarm(Date.now() + TRANSCRIPT_SAVE_INTERVAL_MS);
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [peerId]);
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Transcript GET ────────────────────────────────────────────────────────

  private async handleGetTranscript(request: Request): Promise<Response> {
    const authSiteKey = request.headers.get("x-site-key");
    if (!authSiteKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    try {
      const stored = await this.state.storage.list({ prefix: "transcript:" });
      const chunks: { peerId: string; displayName: string; text: string; timestamp: number }[] = [];
      stored.forEach((value) => {
        try { chunks.push(JSON.parse(value as string)); } catch { /* skip */ }
      });
      chunks.sort((a, b) => a.timestamp - b.timestamp);
      return new Response(JSON.stringify({ chunks, count: chunks.length }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to retrieve transcript" }), { status: 500 });
    }
  }

  // ── Alarm ─────────────────────────────────────────────────────────────────
  // Fires every 3 min while session is active.
  // After crash: sessionState restored in constructor, alarm still fires → safe flush.

  async alarm(): Promise<void> {
    // If state was lost somehow, try KV reconstruction before giving up
    if (!this.sessionState) {
      await this.tryReconstructFromKV();
    }

    await this.upsertTranscriptToD1();

    const activePeers = this.state.getWebSockets().length;
    if (activePeers > 0) {
      await this.state.storage.setAlarm(Date.now() + TRANSCRIPT_SAVE_INTERVAL_MS);
    } else {
      // No active peers — session ended, flush everything
      await this.flushToD1("alarm-safety");
    }
  }

  // ── KV reconstruction — last resort after total state loss ────────────────

  private async tryReconstructFromKV(): Promise<void> {
    try {
      const list = await (this.env as any).RATELIMIT_KV.list({ prefix: "usage:session:" });
      for (const key of list.keys) {
        const raw = await (this.env as any).RATELIMIT_KV.get(key.name, "json") as any;
        if (!raw) continue;

        const doId = this.state.id.toString();
        if (raw.sessionId !== doId && raw.sessionId !== this.state.id.name) continue;

        console.log(`[QlaveSessionDO] Reconstructing state from KV for session ${raw.sessionId}`);

        this.sessionState = {
          sessionId:        raw.sessionId,
          roomCode:         raw.roomCode        ?? null,
          siteKey:          raw.siteKey         ?? "unknown",
          startedAt:        raw.startedAt       ?? Date.now(),
          peakPeers:        raw.peakPeers       ?? 0,
          messageCount:     raw.messageCount    ?? 0,
          peerIds:          [],
          peerNames:        {},
          flushed:          false,
          peerJoinTimes:    {},
          peerMinutes:      raw.peerMinutes     ?? 0,
          transcriptChunks: raw.transcriptChunks ?? 0,
          lastCaptionAt:    0,
          silenceMs:        raw.silenceMs       ?? 0,
        };

        await this.persistState();
        break;
      }
    } catch (e) {
      console.error("[QlaveSessionDO] KV reconstruction failed:", e);
    }
  }

  // ── WebSocket messages ────────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let data: QlaveSignalMessage;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      data = JSON.parse(raw);
    } catch {
      this.send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const [fromPeerId] = this.state.getTags(ws);
    if (this.sessionState) this.sessionState.messageCount++;

    switch (data.type) {
      case "join":
        this.handleJoin(ws, fromPeerId, data.name);
        await this.syncKV();
        await this.persistState();
        break;
      case "leave":
        this.handleLeave(ws, fromPeerId);
        await this.syncKV();
        await this.persistState();
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        this.handleRelay(fromPeerId, data);
        if (this.sessionState && this.sessionState.messageCount % 50 === 0) {
          await this.syncKV();
          await this.persistState();
        }
        break;
      case "caption":
        await this.handleCaption(fromPeerId, data);
        break;
      default:
        this.send(ws, { type: "error", message: `Unknown message type: ${(data as any).type}` });
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string): Promise<void> {
    const [peerId] = this.state.getTags(ws);
    if (peerId) {
      this.accumulatePeerMinutes(peerId);
      this.notifyPeerLeft(peerId);
    }
    const remaining = this.state.getWebSockets().filter(s => s !== ws);
    if (remaining.length === 0 && this.sessionState && !this.sessionState.flushed) {
      await this.flushToD1("session-end");
    } else {
      await this.persistState();
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const [peerId] = this.state.getTags(ws);
    console.error(`[QlaveSessionDO] error for peer ${peerId}:`, error);
  }

  // ── Caption handling + silence tracking ───────────────────────────────────

  private async handleCaption(fromPeerId: string, data: QlaveSignalMessage): Promise<void> {
    const timestamp = data.timestamp ?? Date.now();
    const text      = data.text?.trim();

    this.broadcast(fromPeerId, {
      type: "caption", peerId: fromPeerId, text, timestamp, isFinal: data.isFinal ?? true,
    });

    if (text && this.sessionState) {
      // Track silence — gap since last caption
      const now = Date.now();
      if (this.sessionState.lastCaptionAt > 0) {
        const gap = now - this.sessionState.lastCaptionAt;
        if (gap > SILENCE_GAP_MS) this.sessionState.silenceMs += gap;
      }
      this.sessionState.lastCaptionAt    = now;
      this.sessionState.transcriptChunks += 1;

      const displayName = this.sessionState.peerNames[fromPeerId] ?? data.displayName ?? fromPeerId;
      const key         = `transcript:${String(timestamp).padStart(16, "0")}:${fromPeerId}`;
      const chunk       = JSON.stringify({ peerId: fromPeerId, displayName, text, timestamp });

      try {
        const existing = await this.state.storage.list({ prefix: "transcript:" });
        if (existing.size >= MAX_TRANSCRIPT_CHUNKS) {
          const oldest = [...existing.keys()].sort()[0];
          await this.state.storage.delete(oldest);
        }
        await this.state.storage.put(key, chunk);
      } catch (e) {
        console.error("[QlaveSessionDO] transcript persist failed:", e);
      }
    }
  }

  // ── Join / Leave ──────────────────────────────────────────────────────────

  private handleJoin(ws: WebSocket, peerId: string, name?: string): void {
    const existingPeers = this.getPeerIds(peerId);
    const peerNames     = this.sessionState?.peerNames ?? {};
    this.send(ws, { type: "joined", peerId, peers: existingPeers, peerNames });
    this.broadcast(peerId, { type: "peer-joined", peerId, name });

    if (this.sessionState) {
      if (!this.sessionState.peerIds.includes(peerId)) this.sessionState.peerIds.push(peerId);
      if (name) this.sessionState.peerNames[peerId] = name;
      this.sessionState.peerJoinTimes[peerId] = Date.now();
      const current = existingPeers.length + 1;
      if (current > this.sessionState.peakPeers) this.sessionState.peakPeers = current;
    }
  }

  private handleLeave(ws: WebSocket, peerId: string): void {
    try { ws.close(1000, "left"); } catch { /* already closed */ }
    this.accumulatePeerMinutes(peerId);
    this.notifyPeerLeft(peerId);
  }

  // ── Peer-minutes accumulation ─────────────────────────────────────────────

  private accumulatePeerMinutes(peerId: string): void {
    if (!this.sessionState) return;
    const joinTime = this.sessionState.peerJoinTimes[peerId];
    if (!joinTime) return;
    const durationMs = Date.now() - joinTime;
    this.sessionState.peerMinutes += durationMs / 60_000;
    delete this.sessionState.peerJoinTimes[peerId];
  }

  // Flush remaining peer-minutes for peers still connected at session end
  private accumulateAllRemainingPeerMinutes(endedAt: number): void {
    if (!this.sessionState) return;
    for (const [peerId, joinTime] of Object.entries(this.sessionState.peerJoinTimes)) {
      this.sessionState.peerMinutes += (endedAt - joinTime) / 60_000;
      delete this.sessionState.peerJoinTimes[peerId];
    }
  }

  // ── Relay ─────────────────────────────────────────────────────────────────

  private handleRelay(fromPeerId: string, data: QlaveSignalMessage): void {
    if (!data.to) return;
    const targets = this.state.getWebSockets(data.to);
    if (targets.length === 0) return;
    const payload = JSON.stringify({ ...data, from: fromPeerId });
    for (const socket of targets) {
      try { socket.send(payload); } catch { /* closing */ }
    }
  }

  private notifyPeerLeft(peerId: string): void {
    this.broadcast(peerId, { type: "peer-left", peerId });
  }

  // ── KV sync — live snapshot for dashboards + orphan recovery ─────────────

  private async syncKV(): Promise<void> {
    if (!this.sessionState) return;
    const {
      sessionId, roomCode, siteKey, startedAt, peakPeers,
      messageCount, peerIds, peerMinutes, transcriptChunks, silenceMs,
    } = this.sessionState;
    const activePeers = this.state.getWebSockets().length;
    const sessionData = JSON.stringify({
      sessionId, roomCode, siteKey, startedAt, peakPeers, messageCount,
      activePeers, peerCount: peerIds.length,
      peerMinutes: Math.round(peerMinutes),
      transcriptChunks, silenceMs,
      updatedAt: Date.now(),
    });
    try {
      await (this.env as any).RATELIMIT_KV.put(
        `usage:session:${sessionId}`, sessionData,
        { expirationTtl: KV_TTL_SECONDS }
      );
      await (this.env as any).RATELIMIT_KV.put(
        `usage:site:${siteKey}:session:${sessionId}`, sessionData,
        { expirationTtl: KV_TTL_SECONDS }
      );
    } catch (e) {
      console.error("[QlaveSessionDO] KV sync failed:", e);
    }
  }

  // ── D1 flush — final billing record ──────────────────────────────────────

  private async flushToD1(reason: string): Promise<void> {
    if (!this.sessionState || this.sessionState.flushed) return;
    this.sessionState.flushed = true;

    const { sessionId, roomCode, siteKey, startedAt, peakPeers, messageCount, transcriptChunks, silenceMs } = this.sessionState;
    const endedAt    = Date.now();
    const durationMs = endedAt - startedAt;

    // Accumulate any peers still connected at flush time
    this.accumulateAllRemainingPeerMinutes(endedAt);
    const peerMinutes = Math.round(this.sessionState.peerMinutes);

    // Silence % — what % of session had no transcription activity
    const silencePct = durationMs > 0
      ? Math.min(100, Math.round((silenceMs / durationMs) * 100))
      : 0;

    try {
      await setupDb(this.env as any);

      await db.qlaveSessionLog.create({
        data: {
          id: crypto.randomUUID(),
          siteKey, sessionId,
          startedAt:        new Date(startedAt),
          endedAt:          new Date(endedAt),
          peakPeers, messageCount, durationMs,
          peerMinutes,
          transcriptChunks,
          silencePct,
        },
      });

      await this.upsertTranscriptToD1();

      // Clean up KV
      await (this.env as any).RATELIMIT_KV.delete(`usage:session:${sessionId}`);
      await (this.env as any).RATELIMIT_KV.delete(`usage:site:${siteKey}:session:${sessionId}`);

      // Clean up persisted state — session done
      await this.state.storage.delete(STATE_STORAGE_KEY);

      // Queue AI summary
      try {
        await (this.env as any).TRANSCRIPTION_USAGE_QUEUE.send({ type: "summarize-session", sessionId, siteKey });
      } catch (e) {
        console.error("[QlaveSessionDO] failed to queue summary:", e);
      }

      // Queue diarization — one message per peer if room had diarize enabled.
      // orgId comes from the room snapshot so the DO never needs to know userId.
      try {
        if (roomCode) {
          const room = await (this.env as any).RATELIMIT_KV.get(`room:${roomCode}`, "json") as any;
          const orgId = room?.orgId ?? room?.userId ?? null;
          if (orgId && room?.plugins?.capabilities?.postProcess?.diarize) {
            for (const peerId of this.sessionState.peerIds) {
              await (this.env as any).DIARIZE_QUEUE.send({
                type:           "diarize-peer",
                organizationId: orgId,
                siteKey,
                sessionId,
                peerId,
              });
            }
            console.log(`[QlaveSessionDO] Queued diarization for ${this.sessionState.peerIds.length} peers in session ${sessionId}`);
          }
        }
      } catch (e) {
        console.error("[QlaveSessionDO] failed to queue diarization:", e);
      }

      // Notify recording coordinator
      try {
        const doId = (this.env as any).RECORDING_COORDINATOR_DO.idFromName(sessionId);
        const stub = (this.env as any).RECORDING_COORDINATOR_DO.get(doId);
        stub.fetch("https://do-internal/?action=session-end").catch(() => {});
      } catch { /* recording not active */ }

      // Lock whiteboard
      try {
        const wbId   = (this.env as any).QOLLAB_WHITEBOARD_DO.idFromName(sessionId);
        const wbStub = (this.env as any).QOLLAB_WHITEBOARD_DO.get(wbId);
        await wbStub.lockAndScheduleDelete();
      } catch { /* whiteboard may not have been opened — non-fatal */ }

      try { await this.state.storage.deleteAlarm(); } catch { /* ok */ }

      console.log(`[QlaveSessionDO] Flushed session ${sessionId} to D1 (${reason}) — ${peerMinutes} peer-min, ${silencePct}% silence`);
    } catch (e) {
      console.error("[QlaveSessionDO] D1 flush failed:", e);
      // Unflag so next alarm retry can attempt again
      this.sessionState.flushed = false;
      await this.persistState();
    }
  }

  // ── Transcript D1 upsert ──────────────────────────────────────────────────

  private async upsertTranscriptToD1(): Promise<void> {
    if (!this.sessionState) return;
    const { sessionId, siteKey } = this.sessionState;
    try {
      const stored = await this.state.storage.list({ prefix: "transcript:" });
      if (stored.size === 0) return;

      const chunks: object[] = [];
      stored.forEach((value) => {
        try { chunks.push(JSON.parse(value as string)); } catch { /* skip */ }
      });
      chunks.sort((a: any, b: any) => a.timestamp - b.timestamp);
      const chunksJson = JSON.stringify(chunks);

      await setupDb(this.env as any);

      const existing = await db.sessionTranscript.findFirst({ where: { sessionId } });
      if (existing) {
        const existingCount = JSON.parse(existing.chunks).length;
        if (chunks.length < existingCount) {
          console.log(`[QlaveSessionDO] Skipping upsert — ${chunks.length} chunks < existing ${existingCount}`);
          return;
        }
        await db.sessionTranscript.update({ where: { id: existing.id }, data: { chunks: chunksJson } });
      } else {
        await db.sessionTranscript.create({
          data: { id: crypto.randomUUID(), sessionId, siteKey, chunks: chunksJson },
        });
      }

      console.log(`[QlaveSessionDO] Autosaved ${chunks.length} transcript chunks to D1`);
    } catch (e) {
      console.error("[QlaveSessionDO] transcript upsert failed:", e);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getPeerIds(excludeId: string): string[] {
    const ids = new Set<string>();
    for (const socket of this.state.getWebSockets()) {
      const [pid] = this.state.getTags(socket);
      if (pid && pid !== excludeId) ids.add(pid);
    }
    return [...ids];
  }

  private broadcast(excludeId: string, payload: object): void {
    const msg = JSON.stringify(payload);
    for (const socket of this.state.getWebSockets()) {
      const [pid] = this.state.getTags(socket);
      if (pid !== excludeId) {
        try { socket.send(msg); } catch { /* closing */ }
      }
    }
  }

  private send(ws: WebSocket, payload: object): void {
    try { ws.send(JSON.stringify(payload)); } catch { /* closing */ }
  }
}

export interface QlaveSignalMessage {
  type:
    | "join" | "leave"
    | "offer" | "answer" | "ice-candidate"
    | "caption"
    | "joined" | "peer-joined" | "peer-left"
    | "error";
  to?: string;
  from?: string;
  peerId?: string;
  peers?: string[];
  peerNames?: Record<string, string>;
  name?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
  message?: string;
  text?: string;
  displayName?: string;
  timestamp?: number;
  isFinal?: boolean;
}