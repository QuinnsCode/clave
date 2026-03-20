// src/durableObjects/qlaveSessionDO.ts
// Signaling-only DO — never touches media.
// Tracks usage in KV (live) and flushes to D1 on session end via alarm.
// Pro tier: persists transcript chunks to DO storage — survives refresh forever.

import { setupDb, db } from "@/db";

const TRANSCRIPT_SAVE_INTERVAL_MS = 3 * 60 * 1000;
const KV_TTL_SECONDS = 60 * 60 * 24;
const MAX_TRANSCRIPT_CHUNKS = 5000;

interface SessionState {
  sessionId: string;
  siteKey: string;
  startedAt: number;
  peakPeers: number;
  messageCount: number;
  peerIds: string[];
  peerNames: Record<string, string>;
  flushed: boolean;
}

export class QlaveSessionDO {
  private state: DurableObjectState;
  private env: Env;
  private sessionState: SessionState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

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

    if (!this.sessionState) {
      const roomCode        = url.searchParams.get("roomCode");
      const raw             = roomCode ? await (this.env as any).RATELIMIT_KV.get(`room:${roomCode}`, "json") : null;
      const sessionId       = raw?.sessionId ?? this.state.id.toString();
      const resolvedSiteKey = raw?.siteKey ?? siteKey;

      this.sessionState = {
        sessionId,
        siteKey: resolvedSiteKey,
        startedAt: Date.now(),
        peakPeers: 0,
        messageCount: 0,
        peerIds: [],
        peerNames: {},
        flushed: false,
      };
      await this.state.storage.setAlarm(Date.now() + TRANSCRIPT_SAVE_INTERVAL_MS);
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [peerId]);
    return new Response(null, { status: 101, webSocket: client });
  }

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

  async alarm(): Promise<void> {
    await this.upsertTranscriptToD1();
    const activePeers = this.state.getWebSockets().length;
    if (activePeers > 0) {
      await this.state.storage.setAlarm(Date.now() + TRANSCRIPT_SAVE_INTERVAL_MS);
    } else {
      await this.flushToD1("alarm-safety");
    }
  }

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
        break;
      case "leave":
        this.handleLeave(ws, fromPeerId);
        await this.syncKV();
        break;
      case "offer":
      case "answer":
      case "ice-candidate":
        this.handleRelay(fromPeerId, data);
        if (this.sessionState && this.sessionState.messageCount % 50 === 0) await this.syncKV();
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
    if (peerId) this.notifyPeerLeft(peerId);
    const remaining = this.state.getWebSockets().filter(s => s !== ws);
    if (remaining.length === 0 && this.sessionState && !this.sessionState.flushed) {
      await this.flushToD1("session-end");
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    const [peerId] = this.state.getTags(ws);
    console.error(`[QlaveSessionDO] error for peer ${peerId}:`, error);
  }

  private async handleCaption(fromPeerId: string, data: QlaveSignalMessage): Promise<void> {
    const timestamp = data.timestamp ?? Date.now();
    const text = data.text?.trim();

    this.broadcast(fromPeerId, {
      type: "caption", peerId: fromPeerId, text, timestamp, isFinal: data.isFinal ?? true,
    });

    if (text) {
      const displayName = this.sessionState?.peerNames[fromPeerId] ?? data.displayName ?? fromPeerId;
      const key   = `transcript:${String(timestamp).padStart(16, "0")}:${fromPeerId}`;
      const chunk = JSON.stringify({ peerId: fromPeerId, displayName, text, timestamp });
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

  private handleJoin(ws: WebSocket, peerId: string, name?: string): void {
    const existingPeers = this.getPeerIds(peerId);
    const peerNames     = this.sessionState?.peerNames ?? {};
    this.send(ws, { type: "joined", peerId, peers: existingPeers, peerNames });
    this.broadcast(peerId, { type: "peer-joined", peerId, name });

    if (this.sessionState) {
      if (!this.sessionState.peerIds.includes(peerId)) this.sessionState.peerIds.push(peerId);
      if (name) this.sessionState.peerNames[peerId] = name;
      const current = existingPeers.length + 1;
      if (current > this.sessionState.peakPeers) this.sessionState.peakPeers = current;
    }
  }

  private handleLeave(ws: WebSocket, peerId: string): void {
    try { ws.close(1000, "left"); } catch { /* already closed */ }
    this.notifyPeerLeft(peerId);
  }

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

  private async syncKV(): Promise<void> {
    if (!this.sessionState) return;
    const { sessionId, siteKey, startedAt, peakPeers, messageCount, peerIds } = this.sessionState;
    const activePeers = this.state.getWebSockets().length;
    const sessionData = JSON.stringify({
      sessionId, siteKey, startedAt, peakPeers, messageCount,
      activePeers, peerCount: peerIds.length, updatedAt: Date.now(),
    });
    try {
      await (this.env as any).RATELIMIT_KV.put(`usage:session:${sessionId}`, sessionData, { expirationTtl: KV_TTL_SECONDS });
      await (this.env as any).RATELIMIT_KV.put(`usage:site:${siteKey}:session:${sessionId}`, sessionData, { expirationTtl: KV_TTL_SECONDS });
    } catch (e) {
      console.error("[QlaveSessionDO] KV sync failed:", e);
    }
  }

  private async flushToD1(reason: string): Promise<void> {
    if (!this.sessionState || this.sessionState.flushed) return;
    this.sessionState.flushed = true;

    const { sessionId, siteKey, startedAt, peakPeers, messageCount } = this.sessionState;
    const endedAt    = Date.now();
    const durationMs = endedAt - startedAt;

    try {
      await setupDb(this.env as any);

      await db.qlaveSessionLog.create({
        data: {
          id: crypto.randomUUID(),
          siteKey, sessionId,
          startedAt:  new Date(startedAt),
          endedAt:    new Date(endedAt),
          peakPeers, messageCount, durationMs,
        },
      });

      await this.upsertTranscriptToD1();

      await (this.env as any).RATELIMIT_KV.delete(`usage:session:${sessionId}`);
      await (this.env as any).RATELIMIT_KV.delete(`usage:site:${siteKey}:session:${sessionId}`);

      try {
        await (this.env as any).TRANSCRIPTION_QUEUE.send({ type: "summarize-session", sessionId, siteKey });
      } catch (e) {
        console.error("[QlaveSessionDO] failed to queue summary:", e);
      }

      try {
        const doId = (this.env as any).RECORDING_COORDINATOR_DO.idFromName(sessionId);
        const stub = (this.env as any).RECORDING_COORDINATOR_DO.get(doId);
        stub.fetch("https://do-internal/?action=session-end").catch(() => {});
      } catch { /* recording not active */ }

      try { await this.state.storage.deleteAlarm(); } catch { /* ok */ }

      console.log(`[QlaveSessionDO] Flushed session ${sessionId} to D1 (${reason})`);
    } catch (e) {
      console.error("[QlaveSessionDO] D1 flush failed:", e);
      this.sessionState.flushed = false;
    }
  }

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
        await db.sessionTranscript.update({ where: { id: existing.id }, data: { chunks: chunksJson } });
      } else {
        await db.sessionTranscript.create({ data: { id: crypto.randomUUID(), sessionId, siteKey, chunks: chunksJson } });
      }

      console.log(`[QlaveSessionDO] Autosaved ${chunks.length} transcript chunks to D1`);
    } catch (e) {
      console.error("[QlaveSessionDO] transcript upsert failed:", e);
    }
  }

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