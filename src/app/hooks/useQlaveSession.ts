// src/app/hooks/useQlaveSession.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SessionStatus =
  | "idle"
  | "connecting"     // WebSocket opening
  | "acquiring"      // getUserMedia
  | "ready"          // in session, 0 peers
  | "connected"      // in session, ≥1 peer
  | "error"
  | "disconnected";

export interface RemotePeer {
  peerId: string;
  stream: MediaStream | null;
  displayName?: string;
}

export interface UseQlaveSessionOptions {
  /** Full WebSocket URL e.g. wss://your-worker.dev/__qlave/session-abc */
  signalingUrl: string;
  /** Stable ID for this peer — defaults to a random UUID */
  peerId?: string;
  displayName?: string;
  /** Skip camera/mic — connect signaling only */
  audioOnly?: boolean;
  video?: boolean;
  audio?: boolean;
}

export interface UseQlaveSessionResult {
  status: SessionStatus;
  localStream: MediaStream | null;
  peers: RemotePeer[];
  peerId: string;
  join: () => void;
  leave: () => void;
  error: string | null;
}

// ── ICE servers ───────────────────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useqlaveSession(opts: UseQlaveSessionOptions): UseQlaveSessionResult {
  const {
    signalingUrl,
    peerId: peerIdProp,
    audioOnly = false,
    video = true,
    audio = true,
  } = opts;

  const [peerId] = useState(() => peerIdProp ?? crypto.randomUUID());
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs — stable across renders, never trigger re-renders
  const wsRef = useRef<WebSocket | null>(null);
  const pcMapRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);

  // ── Helpers ─────────────────────────────────────────────────────────────

  const upsertPeer = useCallback((peerId: string, update: Partial<RemotePeer>) => {
    setPeers(prev => {
      const idx = prev.findIndex(p => p.peerId === peerId);
      if (idx === -1) return [...prev, { peerId, stream: null, ...update }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...update };
      return next;
    });
  }, []);

  const removePeer = useCallback((peerId: string) => {
    setPeers(prev => prev.filter(p => p.peerId !== peerId));
    const pc = pcMapRef.current.get(peerId);
    if (pc) { pc.close(); pcMapRef.current.delete(peerId); }
  }, []);

  const signal = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // ── PeerConnection factory ───────────────────────────────────────────────

  const createPC = useCallback((remotePeerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // Incoming remote tracks
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      upsertPeer(remotePeerId, { stream });
    };

    // ICE candidates → signal
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signal({ type: "ice-candidate", to: remotePeerId, candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        removePeer(remotePeerId);
      }
    };

    pcMapRef.current.set(remotePeerId, pc);
    upsertPeer(remotePeerId, { stream: null });

    return pc;
  }, [signal, upsertPeer, removePeer]);

  // ── Signal message handlers ──────────────────────────────────────────────

  const handleSignal = useCallback(async (raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case "joined": {
        // We're registered. Initiate an offer to each already-present peer.
        for (const pid of (msg.peers as string[])) {
          const pc = createPC(pid);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal({ type: "offer", to: pid, sdp: offer });
        }
        setStatus(s => s === "acquiring" || s === "connecting" ? "ready" : s);
        break;
      }

      case "peer-joined": {
        // A new peer arrived — they'll send us an offer; just register them
        upsertPeer(msg.peerId, { stream: null });
        break;
      }

      case "peer-left": {
        removePeer(msg.peerId);
        break;
      }

      case "offer": {
        const pc = createPC(msg.from);
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        signal({ type: "answer", to: msg.from, sdp: answer });
        break;
      }

      case "answer": {
        const pc = pcMapRef.current.get(msg.from);
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;
      }

      case "ice-candidate": {
        const pc = pcMapRef.current.get(msg.from);
        if (pc && msg.candidate) {
          try { await pc.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch { /* ignore */ }
        }
        break;
      }
    }

    // Update connected status based on peer count
    setPeers(prev => {
      setStatus(prev.length > 0 ? "connected" : "ready");
      return prev;
    });
  }, [createPC, signal, upsertPeer, removePeer]);

  // ── join / leave ─────────────────────────────────────────────────────────

  const leave = useCallback(() => {
    activeRef.current = false;

    signal({ type: "leave" });

    for (const pc of pcMapRef.current.values()) pc.close();
    pcMapRef.current.clear();

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close(1000, "left");
      wsRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }

    setPeers([]);
    setStatus("disconnected");
  }, [signal]);

  const join = useCallback(async () => {
    if (activeRef.current) return;
    activeRef.current = true;

    setError(null);
    setStatus("acquiring");

    // 1. Get local media
    try {
      const constraints: MediaStreamConstraints = audioOnly
        ? { audio }
        : { video, audio };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
    } catch (err) {
      setError(`Camera/mic access denied: ${(err as Error).message}`);
      setStatus("error");
      activeRef.current = false;
      return;
    }

    // 2. Open signaling WebSocket
    setStatus("connecting");
    const url = `${signalingUrl}?peerId=${encodeURIComponent(peerId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      signal({ type: "join" });
    };

    ws.onmessage = (event) => {
      handleSignal(event.data);
    };

    ws.onerror = () => {
      setError("WebSocket connection failed");
      setStatus("error");
    };

    ws.onclose = (event) => {
      if (activeRef.current && event.code !== 1000) {
        setError(`Disconnected (${event.code})`);
        setStatus("disconnected");
      }
    };
  }, [signalingUrl, peerId, audio, video, audioOnly, signal, handleSignal]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (activeRef.current) leave();
    };
  }, [leave]);

  return { status, localStream, peers, peerId, join, leave, error };
}