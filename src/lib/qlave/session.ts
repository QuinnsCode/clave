// src/lib/qlave/session.ts
// Zero framework deps — plain browser APIs only.
// Used by both QlaveTestClient (React) and the widget (IIFE).

import type { Peer, SessionEvents, Status } from "./types";

export interface SessionConfig {
  sessionId: string;
  siteKey: string;        // ← add this
  peerId?: string;
  displayName?: string;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];



export class QlaveSession {
  readonly peerId: string;
  readonly sessionId: string;
  readonly siteKey: string;

  private events: SessionEvents;
  private ws: WebSocket | null = null;
  private pcMap = new Map<string, RTCPeerConnection>();
  private localStream: MediaStream | null = null;
  private active = false;

  constructor(config: SessionConfig, events: SessionEvents) {
    this.sessionId = config.sessionId;
    this.peerId = config.peerId ?? crypto.randomUUID();
    this.siteKey = config.siteKey;
    this.events = events;
  }

  // ── Public API ────────────────────────────────────────────────

  async join(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.emit("acquiring");
  
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      this.localStream = stream;
      this.events.onLocalStream(stream);
    } catch (e) {
      this.emit("error", `Camera denied: ${(e as Error).message}`);
      this.active = false;
      return;
    }
  
    this.emit("connecting");
  
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${location.host}/__qlave/${encodeURIComponent(this.sessionId)}?peerId=${encodeURIComponent(this.peerId)}`;
  
    // WebSocket doesn't support custom headers directly —
    // pass siteKey as a query param, validate it server-side from there.
    const wsUrl = `${url}&siteKey=${encodeURIComponent(this.siteKey)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;
  
    ws.onopen = () => this.signal({ type: "join" });
    ws.onmessage = (e) => this.handleMessage(e.data as string);
    ws.onerror = () => this.emit("error", "WebSocket failed");
    ws.onclose = (e) => {
      if (this.active && e.code !== 1000) this.emit("disconnected");
    };
  }

  leave(): void {
    this.active = false;
    this.signal({ type: "leave" });
    this.pcMap.forEach(pc => pc.close());
    this.pcMap.clear();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close(1000);
      this.ws = null;
    }
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this.emit("disconnected");
  }

  // ── Private ───────────────────────────────────────────────────

  private emit(status: Status, error?: string): void {
    this.events.onStatusChange(status, error);
  }

  private signal(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private createPC(remotePeerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.localStream?.getTracks().forEach(t => pc.addTrack(t, this.localStream!));

    pc.ontrack = (e) => {
      this.events.onPeerUpdated({ id: remotePeerId, stream: e.streams[0] ?? null });
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signal({ type: "ice-candidate", to: remotePeerId, candidate: e.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        this.events.onPeerLeft(remotePeerId);
        this.pcMap.delete(remotePeerId);
      }
    };

    this.pcMap.set(remotePeerId, pc);
    this.events.onPeerJoined({ id: remotePeerId, stream: null });
    return pc;
  }

  private async handleMessage(raw: string): Promise<void> {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw) as Record<string, unknown>; } catch { return; }

    switch (msg["type"]) {
      case "joined": {
        const peers = msg["peers"] as string[];
        for (const pid of peers) {
          const pc = this.createPC(pid);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.signal({ type: "offer", to: pid, sdp: offer });
        }
        this.emit(peers.length > 0 ? "connected" : "ready");
        break;
      }
      case "peer-joined":
        this.events.onPeerJoined({ id: msg["peerId"] as string, stream: null });
        break;
      case "peer-left":
        this.events.onPeerLeft(msg["peerId"] as string);
        this.pcMap.get(msg["peerId"] as string)?.close();
        this.pcMap.delete(msg["peerId"] as string);
        break;
      case "offer": {
        const pc = this.createPC(msg["from"] as string);
        await pc.setRemoteDescription(new RTCSessionDescription(msg["sdp"] as RTCSessionDescriptionInit));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signal({ type: "answer", to: msg["from"], sdp: answer });
        this.emit("connected");
        break;
      }
      case "answer": {
        const pc = this.pcMap.get(msg["from"] as string);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg["sdp"] as RTCSessionDescriptionInit));
        break;
      }
      case "ice-candidate": {
        const pc = this.pcMap.get(msg["from"] as string);
        if (pc && msg["candidate"]) {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg["candidate"] as RTCIceCandidateInit)); } catch { /**/ }
        }
        break;
      }
    }
  }
}