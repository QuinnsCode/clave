// src/durableObjects/qlaveSessionDO.ts
// Signaling-only DO — never touches media.
// Tracks usage in KV (live) and flushes to D1 on session end via alarm.
// Persists transcript chunks to DO storage — survives refresh.
//
// Hibernation-safe: everything that must outlive an eviction lives in
// storage ("session") or on the socket itself (serializeAttachment).
// The worker authenticates the upgrade (room code or signed ticket) and passes
// the verified context in the x-qlave-auth header; this DO trusts only that.
//
// Identity model:
//   roomCode  — stored on first connect, used at flush to read the room snapshot
//   orgId     — read from room snapshot at flush time, passed to diarize queue
//   siteKey   — read from room snapshot, used for billing KV keys

import { DurableObject } from "cloudflare:workers";
import { setupDb, db } from "@/db";

const TRANSCRIPT_SAVE_INTERVAL_MS = 3 * 60 * 1000;
const KV_TTL_SECONDS = 60 * 60 * 24 * 2; // 48hr — covers crash + recovery window
const SILENCE_GAP_MS = 10_000;           // 10s gap = silence
const STATE_STORAGE_KEY = "sessionState"; // same key the previous version used: in-flight sessions survive a deploy
const MAX_TRANSCRIPT_CHUNKS = 5000;
const MAX_MESSAGE_BYTES = 64 * 1024;
const DEFAULT_MAX_PEERS = 12;
const PEER_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

/** What the worker verified about this connection. */
export interface QlaveAuthContext {
  sessionId: string;
  roomCode?: string | null;
  siteKey: string | null;
  maxPeers?: number;
  userId?: string | null;
  app?: string | null;
}

interface SessionState {
  sessionId: string;
  roomCode: string | null;
  siteKey: string;
  startedAt: number;
  peakPeers: number;
  messageCount: number;
  peerIds: string[];
  maxPeers: number;
  flushed: boolean;
  transcriptCount: number;
  // usage tracking
  peerJoinTimes: Record<string, number>; // peerId → joinedAt ms
  peerMinutes: number;
  transcriptChunks: number;              // total captions received
  lastCaptionAt: number;
  silenceMs: number;
}

interface SocketAttachment {
  peerId: string;
  name: string;
  joined: boolean;
  userId: string | null;
}

export class QlaveSessionDO extends DurableObject<Env> {
  private state: DurableObjectState;
  private session: SessionState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
    // Keepalive pings never wake the DO.
    this.state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}'));
  }

  // ── State ──────────────────────────────────────────────────────────────────

  private async load(): Promise<SessionState | null> {
    if (!this.session) {
      const stored = (await this.state.storage.get<Partial<SessionState>>(STATE_STORAGE_KEY)) ?? null;
      // Fill fields an older stored shape may lack.
      this.session = stored && {
        transcriptCount: 0, maxPeers: DEFAULT_MAX_PEERS, peerJoinTimes: {}, peerMinutes: 0,
        transcriptChunks: 0, lastCaptionAt: 0, silenceMs: 0, roomCode: null, ...stored,
      } as SessionState;
    }
    return this.session;
  }

  private async save(): Promise<void> {
    if (this.session) await this.state.storage.put(STATE_STORAGE_KEY, this.session);
  }

  private attachment(ws: WebSocket): SocketAttachment | null {
    try { return (ws.deserializeAttachment() as SocketAttachment) ?? null; } catch { return null; }
  }

  private joinedSockets(): { ws: WebSocket; a: SocketAttachment }[] {
    const out: { ws: WebSocket; a: SocketAttachment }[] = [];
    for (const ws of this.state.getWebSockets()) {
      const a = this.attachment(ws);
      if (a?.joined) out.push({ ws, a });
    }
    return out;
  }

  // ── HTTP / upgrade ─────────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    try {
      return await this.handleFetch(request);
    } catch (e) {
      console.error("[QlaveSessionDO] fetch failed:", e);
      return new Response("Session error", { status: 500 });
    }
  }

  private async handleFetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.endsWith("/transcript")) {
      return this.handleGetTranscript(request);
    }

    let auth: QlaveAuthContext;
    try { auth = JSON.parse(request.headers.get("x-qlave-auth") ?? ""); }
    catch { return new Response("Unauthorized", { status: 401 }); }

    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const peerId = url.searchParams.get("peerId") ?? "";
    if (!PEER_ID_RE.test(peerId)) return new Response("Bad peerId", { status: 400 });

    let session = await this.load();
    if (!session || session.flushed) {
      // First connection, or a room coming back after everyone left: new usage window.
      session = {
        sessionId: auth.sessionId,
        roomCode: auth.roomCode ?? null,
        siteKey: auth.siteKey ?? "platform",
        startedAt: Date.now(),
        peakPeers: 0,
        messageCount: 0,
        peerIds: [],
        maxPeers: auth.maxPeers ?? DEFAULT_MAX_PEERS,
        flushed: false,
        transcriptCount: session?.transcriptCount ?? 0,
        peerJoinTimes: {},
        peerMinutes: 0,
        transcriptChunks: 0,
        lastCaptionAt: 0,
        silenceMs: 0,
      };
      this.session = session;
      await this.save();
      await this.state.storage.setAlarm(Date.now() + TRANSCRIPT_SAVE_INTERVAL_MS);
    }

    const { 0: client, 1: server } = new WebSocketPair();

    // Same peerId reconnecting (tab blip): the new socket replaces the old one.
    const stale = this.state.getWebSockets(peerId);
    const others = this.joinedSockets().filter(s => s.a.peerId !== peerId);
    if (others.length >= session.maxPeers) {
      this.state.acceptWebSocket(server, [peerId]);
      server.close(4003, "Room is full");
      return new Response(null, { status: 101, webSocket: client });
    }

    this.state.acceptWebSocket(server, [peerId]);
    server.serializeAttachment({ peerId, name: "Guest", joined: false, userId: auth.userId ?? null } satisfies SocketAttachment);
    for (const old of stale) {
      try { old.serializeAttachment({ ...this.attachment(old), joined: false }); old.close(4000, "replaced"); } catch { /* gone */ }
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleGetTranscript(request: Request): Promise<Response> {
    // Only reachable through the worker, which checks ownership before forwarding.
    if (request.headers.get("x-qlave-internal") !== "1") {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const chunks = await this.readTranscript();
    return Response.json({ chunks, count: chunks.length });
  }

  async alarm(): Promise<void> {
    await this.load();
    await this.upsertTranscriptToD1();
    if (this.joinedSockets().length > 0) {
      await this.state.storage.setAlarm(Date.now() + TRANSCRIPT_SAVE_INTERVAL_MS);
    } else {
      await this.flushToD1("alarm-safety");
    }
  }

  // ── WebSocket events ───────────────────────────────────────────────────────

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const size = typeof message === "string" ? message.length : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) { this.send(ws, { type: "error", message: "Message too large" }); return; }

    let data: QlaveSignalMessage;
    try {
      data = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
    } catch {
      this.send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    const a = this.attachment(ws);
    if (!a) return;
    const session = await this.load();
    if (session) session.messageCount++;

    if (data.type === "join") {
      await this.handleJoin(ws, a, data.name);
      return;
    }
    if (!a.joined) { this.send(ws, { type: "error", message: "Send join first" }); return; }

    switch (data.type) {
      case "leave":
        await this.handleClose(ws, a);
        try { ws.close(1000, "left"); } catch { /* closed */ }
        return;
      case "offer":
      case "answer":
      case "ice-candidate":
        this.relay(a.peerId, data);
        if (session && session.messageCount % 50 === 0) { await this.save(); await this.syncKV(); }
        return;
      case "mute-state":
        this.broadcast(a.peerId, { type: "mute-state", from: a.peerId, audioMuted: !!data.audioMuted, videoMuted: !!data.videoMuted });
        return;
      case "caption":
        await this.handleCaption(a, data);
        return;
      default:
        this.send(ws, { type: "error", message: `Unknown message type: ${String((data as any).type).slice(0, 32)}` });
    }
  }

  async webSocketClose(ws: WebSocket, code: number, _reason: string): Promise<void> {
    const a = this.attachment(ws);
    if (a) await this.handleClose(ws, a);
    try { ws.close(code === 1005 ? 1000 : code, "closing"); } catch { /* already closed */ }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const a = this.attachment(ws);
    console.error(`[QlaveSessionDO] error for peer ${a?.peerId}:`, error);
    if (a) await this.handleClose(ws, a);
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async handleJoin(ws: WebSocket, a: SocketAttachment, name?: string): Promise<void> {
    const cleanName = (typeof name === "string" ? name : "").trim().slice(0, 64) || "Guest";
    const others = this.joinedSockets().filter(s => s.ws !== ws && s.a.peerId !== a.peerId);

    const peerNames: Record<string, string> = {};
    for (const s of others) peerNames[s.a.peerId] = s.a.name;
    this.send(ws, { type: "joined", peerId: a.peerId, peers: others.map(s => s.a.peerId), peerNames });

    const wasJoined = a.joined;
    ws.serializeAttachment({ ...a, name: cleanName, joined: true } satisfies SocketAttachment);
    if (!wasJoined) this.broadcast(a.peerId, { type: "peer-joined", peerId: a.peerId, name: cleanName });

    const session = await this.load();
    if (session) {
      if (!session.peerIds.includes(a.peerId)) session.peerIds.push(a.peerId);
      if (!session.peerJoinTimes[a.peerId]) session.peerJoinTimes[a.peerId] = Date.now();
      session.peakPeers = Math.max(session.peakPeers, others.length + 1);
      await this.save();
    }
    await this.syncKV();
  }

  /** Idempotent: leave message, close and error can all land for one socket. */
  private async handleClose(ws: WebSocket, a: SocketAttachment): Promise<void> {
    if (!a.joined) return;
    try { ws.serializeAttachment({ ...a, joined: false }); } catch { /* closed */ }
    // A replacement socket for the same peer is still in the room: nobody left.
    const stillHere = this.joinedSockets().some(s => s.ws !== ws && s.a.peerId === a.peerId);
    const session = await this.load();
    if (!stillHere) {
      this.broadcast(a.peerId, { type: "peer-left", peerId: a.peerId });
      if (session) this.accumulatePeerMinutes(session, a.peerId, Date.now());
    }

    await this.syncKV();
    if (this.joinedSockets().filter(s => s.ws !== ws).length === 0 && session && !session.flushed) {
      await this.flushToD1("session-end");
    } else {
      await this.save();
    }
  }

  private accumulatePeerMinutes(session: SessionState, peerId: string, now: number): void {
    const joinTime = session.peerJoinTimes[peerId];
    if (!joinTime) return;
    session.peerMinutes += (now - joinTime) / 60_000;
    delete session.peerJoinTimes[peerId];
  }

  private relay(fromPeerId: string, data: QlaveSignalMessage): void {
    if (!data.to || data.to === fromPeerId) return;
    // Only the fields signaling needs: nothing a client puts on the wire is passed through blind.
    const payload = JSON.stringify({
      type: data.type, from: fromPeerId, to: data.to,
      ...(data.sdp ? { sdp: data.sdp } : {}),
      ...(data.candidate !== undefined ? { candidate: data.candidate } : {}),
    });
    for (const socket of this.state.getWebSockets(data.to)) {
      if (!this.attachment(socket)?.joined) continue;
      try { socket.send(payload); } catch { /* closing */ }
    }
  }

  private async handleCaption(a: SocketAttachment, data: QlaveSignalMessage): Promise<void> {
    const timestamp = typeof data.timestamp === "number" ? data.timestamp : Date.now();
    const text = typeof data.text === "string" ? data.text.trim().slice(0, 4000) : "";
    const isFinal = data.isFinal ?? true;

    this.broadcast(a.peerId, { type: "caption", peerId: a.peerId, text, timestamp, isFinal });
    if (!text || !isFinal) return;

    const session = await this.load();
    const key = `transcript:${String(timestamp).padStart(16, "0")}:${a.peerId}`;
    try {
      await this.state.storage.put(key, JSON.stringify({ peerId: a.peerId, displayName: a.name, text, timestamp }));
      if (session) {
        const now = Date.now();
        if (session.lastCaptionAt > 0 && now - session.lastCaptionAt > SILENCE_GAP_MS) {
          session.silenceMs += now - session.lastCaptionAt;
        }
        session.lastCaptionAt = now;
        session.transcriptChunks++;
        session.transcriptCount++;
        if (session.transcriptCount > MAX_TRANSCRIPT_CHUNKS) {
          const oldest = await this.state.storage.list({ prefix: "transcript:", limit: session.transcriptCount - MAX_TRANSCRIPT_CHUNKS });
          await this.state.storage.delete([...oldest.keys()]);
          session.transcriptCount = MAX_TRANSCRIPT_CHUNKS;
        }
        await this.save();
      }
    } catch (e) {
      console.error("[QlaveSessionDO] transcript persist failed:", e);
    }
  }

  // ── Usage + persistence ────────────────────────────────────────────────────

  private async syncKV(): Promise<void> {
    const session = await this.load();
    if (!session) return;
    const { sessionId, roomCode, siteKey, startedAt, peakPeers, messageCount, peerIds, peerMinutes, transcriptChunks, silenceMs } = session;
    const sessionData = JSON.stringify({
      sessionId, roomCode, siteKey, startedAt, peakPeers, messageCount,
      activePeers: this.joinedSockets().length, peerCount: peerIds.length,
      peerMinutes: Math.round(peerMinutes), transcriptChunks, silenceMs,
      updatedAt: Date.now(),
    });
    try {
      await this.env.RATELIMIT_KV.put(`usage:session:${sessionId}`, sessionData, { expirationTtl: KV_TTL_SECONDS });
      await this.env.RATELIMIT_KV.put(`usage:site:${siteKey}:session:${sessionId}`, sessionData, { expirationTtl: KV_TTL_SECONDS });
    } catch (e) {
      console.error("[QlaveSessionDO] KV sync failed:", e);
    }
  }

  private async flushToD1(reason: string): Promise<void> {
    const session = await this.load();
    if (!session || session.flushed) return;
    session.flushed = true;
    await this.save();

    const { sessionId, roomCode, siteKey, startedAt, peakPeers, messageCount, transcriptChunks, silenceMs } = session;
    const endedAt = Date.now();
    const durationMs = endedAt - startedAt;
    // Peers still connected at flush time (alarm-safety path)
    for (const pid of Object.keys(session.peerJoinTimes)) this.accumulatePeerMinutes(session, pid, endedAt);
    const peerMinutes = Math.round(session.peerMinutes);
    const silencePct = durationMs > 0 ? Math.min(100, Math.round((silenceMs / durationMs) * 100)) : 0;

    try {
      await setupDb(this.env as any);
      await db.qlaveSessionLog.create({
        data: {
          id: crypto.randomUUID(),
          siteKey, sessionId,
          startedAt: new Date(startedAt),
          endedAt: new Date(endedAt),
          peakPeers, messageCount, durationMs,
          peerMinutes, transcriptChunks, silencePct,
        },
      });

      await this.upsertTranscriptToD1();

      await this.env.RATELIMIT_KV.delete(`usage:session:${sessionId}`);
      await this.env.RATELIMIT_KV.delete(`usage:site:${siteKey}:session:${sessionId}`);

      // The worker's queue handler routes "summarize-session" from the usage queue.
      try {
        await (this.env as any).TRANSCRIPTION_USAGE_QUEUE?.send({ type: "summarize-session", sessionId, siteKey });
      } catch (e) {
        console.error("[QlaveSessionDO] failed to queue summary:", e);
      }

      // Diarization — one message per peer if the room had it enabled.
      // orgId comes from the room snapshot so the DO never needs to know userId.
      try {
        if (roomCode) {
          const room = await this.env.RATELIMIT_KV.get(`room:${roomCode}`, "json") as any;
          const orgId = room?.orgId ?? room?.userId ?? null;
          if (orgId && room?.plugins?.capabilities?.postProcess?.diarize) {
            for (const peerId of session.peerIds) {
              await (this.env as any).DIARIZE_QUEUE.send({ type: "diarize-peer", organizationId: orgId, siteKey, sessionId, peerId });
            }
          }
        }
      } catch (e) {
        console.error("[QlaveSessionDO] failed to queue diarization:", e);
      }

      try {
        const stub = (this.env as any).RECORDING_COORDINATOR_DO.get((this.env as any).RECORDING_COORDINATOR_DO.idFromName(sessionId));
        stub.fetch("https://do-internal/?action=session-end").catch(() => {});
      } catch { /* recording not active */ }

      try {
        const wb = (this.env as any).QOLLAB_WHITEBOARD_DO.get((this.env as any).QOLLAB_WHITEBOARD_DO.idFromName(sessionId));
        await wb.lockAndScheduleDelete();
      } catch { /* whiteboard may not have been opened — non-fatal */ }

      try { await this.state.storage.deleteAlarm(); } catch { /* ok */ }
      console.log(`[QlaveSessionDO] Flushed session ${sessionId} to D1 (${reason}) — ${peerMinutes} peer-min, ${silencePct}% silence`);
    } catch (e) {
      console.error("[QlaveSessionDO] D1 flush failed:", e);
      session.flushed = false;
      await this.save();
    }
  }

  private async readTranscript(): Promise<{ peerId: string; displayName: string; text: string; timestamp: number }[]> {
    const stored = await this.state.storage.list<string>({ prefix: "transcript:" });
    const chunks: { peerId: string; displayName: string; text: string; timestamp: number }[] = [];
    stored.forEach((value) => { try { chunks.push(JSON.parse(value)); } catch { /* skip */ } });
    return chunks; // keys are timestamp-padded, so list order is chronological
  }

  private async upsertTranscriptToD1(): Promise<void> {
    const session = this.session;
    if (!session) return;
    try {
      const chunks = await this.readTranscript();
      if (chunks.length === 0) return;
      const chunksJson = JSON.stringify(chunks);
      await setupDb(this.env as any);
      const existing = await db.sessionTranscript.findFirst({ where: { sessionId: session.sessionId } });
      if (existing) {
        // Never overwrite a longer saved transcript with a shorter one (e.g. after storage loss).
        if (chunks.length < JSON.parse(existing.chunks).length) return;
        await db.sessionTranscript.update({ where: { id: existing.id }, data: { chunks: chunksJson } });
      } else {
        await db.sessionTranscript.create({ data: { id: crypto.randomUUID(), sessionId: session.sessionId, siteKey: session.siteKey, chunks: chunksJson } });
      }
    } catch (e) {
      console.error("[QlaveSessionDO] transcript upsert failed:", e);
    }
  }

  // ── Send helpers ───────────────────────────────────────────────────────────

  private broadcast(excludePeerId: string, payload: object): void {
    const msg = JSON.stringify(payload);
    for (const { ws, a } of this.joinedSockets()) {
      if (a.peerId === excludePeerId) continue;
      try { ws.send(msg); } catch { /* closing */ }
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
    | "mute-state"
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
  audioMuted?: boolean;
  videoMuted?: boolean;
}
