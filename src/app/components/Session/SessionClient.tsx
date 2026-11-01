"use client";
// src/app/components/Session/SessionClient.tsx
// Plugin-aware session client.
// Knows nothing about transcription, chat, or any feature.
// Features inject via SessionPlugin interface.
//
// Video source:
//   Users can switch between Camera and Screen via the source picker in the
//   controls bar. Switching replaces the video track sent to all peers via
//   replaceTrack, and calls onSourceSwitch(newStream) so recording hooks can
//   switch their recorder to the new stream without interrupting audio.
//
// Controls layout:
//   Plugin controls (RecordingIndicator etc.) render in a slim strip above
//   the controls bar so the bar stays uncluttered.
//   Hang up confirms if you're the last peer in the room.

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { Mic, MicOff, Video, VideoOff, Monitor, Camera, PhoneOff, Copy, Check, Drum } from "lucide-react";
import type { SessionPlugin, SignalMessage } from "@/types";
import { ICE_SERVERS } from "@/lib/webrtc/iceServers";

interface Peer {
  id:         string;
  name:       string;
  stream:     MediaStream | null;
  pc:         RTCPeerConnection;
  audioMuted: boolean;
  videoMuted: boolean;
}

type VideoSource = "camera" | "screen";

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body { background: #080810; color: #ece8f8; font-family: 'DM Sans', system-ui, sans-serif; -webkit-font-smoothing: antialiased; overflow: hidden; }

  .session { display: flex; flex-direction: column; height: 100vh; background: #080810; }
  .session-body { display: flex; flex: 1; min-height: 0; }

  .session-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.06);
    flex-shrink: 0; z-index: 10;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 12px; border-radius: 100px;
    background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
    font-size: 13px; font-weight: 600; color: #fff;
    box-shadow: 0 2px 12px rgba(124,58,237,0.28); cursor: pointer; text-decoration: none;
  }
  .session-id { font-size: 12px; color: #4a4660; font-family: 'DM Mono', monospace; }
  .header-right { display: flex; align-items: center; gap: 10px; }
  .peer-count { display: flex; align-items: center; gap: 5px; font-size: 12px; color: #918caa; font-family: 'DM Mono', monospace; }
  .btn-share {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 8px;
    background: rgba(124,58,237,0.12); border: 1px solid rgba(124,58,237,0.25);
    color: #a78bfa; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s;
  }
  .btn-share:hover { background: rgba(124,58,237,0.2); }

  .tiles-container { position: relative; flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .tiles {
    flex: 1; display: grid; gap: 8px; padding: 16px;
    overflow: hidden; align-content: center; justify-content: center; min-height: 0;
  }
  .tile {
    position: relative; border-radius: 14px; overflow: hidden;
    background: #0d0d1a; border: 1px solid rgba(255,255,255,0.06);
    display: flex; align-items: center; justify-content: center; aspect-ratio: 16/9;
  }
  .tile.self { border-color: rgba(124,58,237,0.3); }
  .tile video { width: 100%; height: 100%; object-fit: cover; }
  .tile-avatar {
    width: 64px; height: 64px; border-radius: 50%;
    background: linear-gradient(135deg, #4c1d95, #7c3aed);
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; font-weight: 600; color: #fff;
  }
  .tile-name {
    position: absolute; bottom: 10px; left: 12px;
    font-size: 12px; color: #ece8f8; font-weight: 500;
    background: rgba(0,0,0,0.5); padding: 3px 8px; border-radius: 100px; backdrop-filter: blur(4px);
  }
  .tile-muted {
    position: absolute; top: 10px; right: 10px;
    background: rgba(0,0,0,0.5); border-radius: 100px; padding: 4px;
    backdrop-filter: blur(4px); display: flex; align-items: center;
  }
  .tiles-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
  .tiles-overlay > * { pointer-events: all; }

  /* ── Plugin status strip — above controls bar ── */
  .plugin-strip {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; padding: 6px 20px; flex-shrink: 0;
    border-top: 1px solid rgba(255,255,255,0.04);
    min-height: 32px;
  }

  .controls {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 16px 20px; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.06);
  }
  .ctrl-btn {
    display: flex; align-items: center; justify-content: center;
    width: 48px; height: 48px; border-radius: 50%;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
    color: #ece8f8; cursor: pointer; transition: all 0.15s;
  }
  .ctrl-btn:hover { background: rgba(255,255,255,0.12); }
  .ctrl-btn.active { background: rgba(124,58,237,0.2); border-color: rgba(124,58,237,0.4); color: #a78bfa; }
  .ctrl-btn.danger { background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.3); color: #f87171; }
  .ctrl-btn.danger:hover { background: rgba(248,113,113,0.2); }
  .ctrl-btn.muted { background: rgba(248,113,113,0.08); border-color: rgba(248,113,113,0.2); color: #f87171; }

  /* Source picker */
  .source-picker {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 100px; padding: 4px;
  }
  .source-btn {
    display: flex; align-items: center; justify-content: center;
    width: 36px; height: 36px; border-radius: 50%;
    background: transparent; border: none;
    color: #4a4660; cursor: pointer; transition: all 0.15s;
  }
  .source-btn:hover { color: #918caa; }
  .source-btn.active { background: rgba(124,58,237,0.2); color: #a78bfa; }

  .lobby {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 24px; padding: 40px;
  }
  .lobby-title { font-size: 28px; font-weight: 600; color: #ece8f8; text-align: center; }
  .lobby-sub { font-size: 14px; color: #918caa; text-align: center; }
  .lobby-preview {
    width: 320px; height: 180px; border-radius: 14px; overflow: hidden;
    background: #0d0d1a; border: 1px solid rgba(255,255,255,0.08);
    position: relative; display: flex; align-items: center; justify-content: center;
  }
  .lobby-preview video { width: 100%; height: 100%; object-fit: cover; }
  .lobby-controls { display: flex; gap: 10px; }
  .btn-join {
    padding: 12px 32px; border-radius: 10px;
    background: #7c3aed; color: #fff; font-size: 15px; font-weight: 600;
    cursor: pointer; border: none; transition: all 0.15s;
    box-shadow: 0 2px 20px rgba(124,58,237,0.4);
  }
  .btn-join:hover { background: #6d28d9; transform: translateY(-1px); }
  .btn-join:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; background: #22c55e; box-shadow: 0 0 6px #22c55e; display: inline-block; margin-right: 5px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.5} }
  .tiles[data-count="1"] { grid-template-columns: 1fr; max-width: 900px; width: 100%; margin: 0 auto; }
  .tiles[data-count="2"] { grid-template-columns: 1fr 1fr; max-width: 1100px; width: 100%; margin: 0 auto; }
  .tiles[data-count="3"] { grid-template-columns: 1fr 1fr; max-width: 1100px; width: 100%; margin: 0 auto; }
  .tiles[data-count="3"] .tile:last-child { grid-column: 1 / -1; max-width: 50%; margin: 0 auto; }
  .tiles[data-count="4"] { grid-template-columns: 1fr 1fr; max-width: 1100px; width: 100%; margin: 0 auto; }
  .tiles[data-count="5"], .tiles[data-count="6"] { grid-template-columns: 1fr 1fr 1fr; max-width: 1400px; width: 100%; margin: 0 auto; }
  @media (max-width: 640px) {
    .session-body { flex-direction: column; }
    .tiles[data-count="2"],.tiles[data-count="3"],.tiles[data-count="4"],.tiles[data-count="5"],.tiles[data-count="6"] { grid-template-columns: 1fr; }
    .tiles[data-count="3"] .tile:last-child { grid-column: auto; max-width: 100%; }
    .lobby-preview { width: 100%; }
  }
`;

function getWsUrl(sessionId: string, peerId: string, siteKey: string, roomCode: string): string {
  const host  = window.location.host;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${host}/__qlave/${sessionId}?siteKey=${siteKey}&peerId=${peerId}&roomCode=${roomCode}`;
}

function initials(name: string): string {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function runPlugins<K extends keyof SessionPlugin>(
  plugins: SessionPlugin[],
  hook: K,
  ...args: SessionPlugin[K] extends ((...a: infer A) => any) | undefined ? A : never[]
): void {
  for (const plugin of plugins) {
    const fn = plugin[hook] as ((...a: any[]) => any) | undefined;
    fn?.(...args);
  }
}

function runMessagePlugins(plugins: SessionPlugin[], msg: SignalMessage): boolean {
  for (const plugin of plugins) {
    if (plugin.onMessage?.(msg)) return true;
  }
  return false;
}

// -----------------------

/** Add tracks from stream to a PC. Skips tracks already represented by a sender. */
function addTracksToPC(pc: RTCPeerConnection, stream: MediaStream | null): void {
  if (!pc || !stream) return;
  const existingKinds = new Set(
    pc.getSenders().map(s => s.track?.kind).filter(Boolean)
  );
  stream.getTracks().forEach(track => {
    if (!existingKinds.has(track.kind)) {
      pc.addTrack(track, stream);
    }
  });
}

/** Add stream tracks to every existing peer connection.
 *  Called when getUserMedia resolves after PCs already exist (late stream on mobile Safari). */
function addStreamToAllPCs(peers: Map<string, Peer> | null, stream: MediaStream | null): void {
  if (!peers || !stream) return;
  peers.forEach(peer => {
    if (peer?.pc) addTracksToPC(peer.pc, stream);
  });
}

// ── VideoTile ─────────────────────────────────────────────────────────────────

const VideoTile = memo(function VideoTile({
  stream, name, isSelf, audioMuted,
}: {
  stream:     MediaStream | null;
  name:       string;
  isSelf:     boolean;
  audioMuted: boolean;
}) {
  const ref                     = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject   = stream ?? null;
    el.muted       = isSelf;
    el.playsInline = true;
    if (!stream) return;
    el.play().catch(err => {
      if (err.name === "NotAllowedError") setNeedsTap(true);
    });
  }, [stream, isSelf]);

  return (
    <div className={`tile ${isSelf ? "self" : ""}`}>
      <video ref={ref} autoPlay playsInline muted={isSelf} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      {!stream && <div className="tile-avatar">{initials(name)}</div>}
      {needsTap && (
        <div
          onClick={() => ref.current?.play().then(() => setNeedsTap(false)).catch(() => {})}
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center",
            justifyContent: "center", flexDirection: "column", gap: 8,
            background: "rgba(0,0,0,0.4)", cursor: "pointer", backdropFilter: "blur(2px)",
            fontSize: 13, color: "rgba(255,255,255,0.8)",
          }}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" stroke="white" strokeWidth="1.5" strokeOpacity="0.6"/>
            <path d="M13 11l10 5-10 5V11z" fill="white" fillOpacity="0.8"/>
          </svg>
          Tap to enable audio
        </div>
      )}
      <div className="tile-name">{name}</div>
      {audioMuted && <div className="tile-muted"><MicOff size={13} color="#f87171" /></div>}
    </div>
  );
});

// ── SessionClient ─────────────────────────────────────────────────────────────

export default function SessionClient({
  sessionId,
  roomCode,
  user,
  peerId: peerIdProp,
  plugins = [],
  siteKey,
  renderLobbyExtra,
  onSourceSwitch,
}: {
  sessionId:        string;
  roomCode:         string;
  user:             { name: string } | null;
  plugins?:         SessionPlugin[];
  siteKey:          string;
  renderLobbyExtra?: () => React.ReactNode;
  peerId?:          string;
  // Called when the user switches video source so the recording hook can
  // swap its recorder to the new stream. Audio keeps recording regardless.
  onSourceSwitch?: (newStream: MediaStream) => void;
}) {
  const peerId          = useRef(peerIdProp ?? crypto.randomUUID());
  const wsRef           = useRef<WebSocket | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef        = useRef<Map<string, Peer>>(new Map());
  const lobbyVideoRef   = useRef<HTMLVideoElement>(null);
  const pluginsRef      = useRef(plugins);

  const [phase,       setPhase]       = useState<"lobby" | "session">("lobby");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers,       setPeers]       = useState<Peer[]>([]);
  const [audioMuted,  setAudioMuted]  = useState(false);
  const [videoMuted,  setVideoMuted]  = useState(false);
  const [videoSource, setVideoSource] = useState<VideoSource>("camera");
  const [copied,      setCopied]      = useState(false);
  const [guestName,   setGuestName]   = useState("");

  const peerName = user?.name ?? (guestName.trim() || "Guest");

  useEffect(() => { pluginsRef.current = plugins; }, [plugins]);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        setLocalStream(stream);
        addStreamToAllPCs(peersRef.current, stream);
        if (lobbyVideoRef.current) lobbyVideoRef.current.srcObject = stream;
      })
      .catch(console.error);
    return () => { localStreamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const createPeerConnection = useCallback((remotePeerId: string, remoteName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    if (localStreamRef.current) addTracksToPC(pc, localStreamRef.current);

    const remoteStream = new MediaStream();
    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      const peer = peersRef.current.get(remotePeerId);
      if (peer) {
        peer.stream = remoteStream;
        setPeers(Array.from(peersRef.current.values()));
        runPlugins(pluginsRef.current, "onPeerStreamUpdated", { peerId: remotePeerId, displayName: peer.name, stream: remoteStream });
      }
    };

    pc.onicecandidate = e => {
      if (e.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "ice-candidate", to: remotePeerId, from: peerId.current, candidate: e.candidate }));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        peersRef.current.delete(remotePeerId);
        setPeers(Array.from(peersRef.current.values()));
        runPlugins(pluginsRef.current, "onPeerLeft", remotePeerId);
      }
    };

    const peer: Peer = { id: remotePeerId, name: remoteName, stream: null, pc, audioMuted: false, videoMuted: false };
    peersRef.current.set(remotePeerId, peer);
    setPeers(Array.from(peersRef.current.values()));
    runPlugins(pluginsRef.current, "onPeerJoined", { peerId: remotePeerId, displayName: remoteName, stream: null });
    return pc;
  }, []);

  const connect = useCallback((stream: MediaStream) => {
    const ws = new WebSocket(getWsUrl(sessionId, peerId.current, siteKey, roomCode));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", name: peerName }));
      runPlugins(pluginsRef.current, "onJoin", ws, peerId.current, stream);
    };

    ws.onmessage = async (e) => {
      const msg: SignalMessage = JSON.parse(e.data);
      if (runMessagePlugins(pluginsRef.current, msg)) return;

      if (msg.type === "joined" && msg.peers) {
        const names = msg.peerNames ?? {};
        for (const pid of msg.peers) {
          if (pid === peerId.current) continue;
          const pc    = createPeerConnection(pid, names[pid] ?? pid.slice(0, 8));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: "offer", to: pid, from: peerId.current, sdp: offer }));
        }
      }
      if (msg.type === "peer-joined" && msg.peerId) {
        if (!peersRef.current.has(msg.peerId))
          createPeerConnection(msg.peerId, msg.name ?? msg.peerId.slice(0, 8));
      }
      if (msg.type === "offer" && msg.from && msg.sdp) {
        if (!peersRef.current.has(msg.from)) createPeerConnection(msg.from, msg.from.slice(0, 8));
        const pc = peersRef.current.get(msg.from)!.pc;
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", to: msg.from, from: peerId.current, sdp: answer }));
      }
      if (msg.type === "answer" && msg.from && msg.sdp) {
        const pc = peersRef.current.get(msg.from)?.pc;
        if (pc) await pc.setRemoteDescription(msg.sdp);
      }
      if (msg.type === "ice-candidate" && msg.from && msg.candidate) {
        const pc = peersRef.current.get(msg.from)?.pc;
        if (pc) await pc.addIceCandidate(msg.candidate);
      }
      if (msg.type === "peer-left" && msg.peerId) {
        peersRef.current.get(msg.peerId)?.pc.close();
        peersRef.current.delete(msg.peerId);
        setPeers(Array.from(peersRef.current.values()));
        runPlugins(pluginsRef.current, "onPeerLeft", msg.peerId);
      }
    };

    ws.onclose = () => {
      peersRef.current.forEach(p => p.pc.close());
      peersRef.current.clear();
      setPeers([]);
    };
  }, [sessionId, siteKey, roomCode, peerName, createPeerConnection]);

  const join = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    setPhase("session");
    connect(stream);
  }, [connect]);

  // ── Video source switching ────────────────────────────────────────────────

  const switchToScreen = useCallback(async () => {
    try {
      const screen      = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screenStreamRef.current = screen;
      const screenTrack = screen.getVideoTracks()[0];

      // Replace track for all peers — wrapped in case a PC is mid-close
      peersRef.current.forEach(p => {
        const sender = p.pc.getSenders().find(s => s.track?.kind === "video");
        try { if (sender) sender.replaceTrack(screenTrack); } catch { /* peer disconnecting */ }
      });

      setLocalStream(screen);
      setVideoSource("screen");
      onSourceSwitch?.(screen);

      // Revert to camera when user stops screen share via browser UI
      screenTrack.onended = () => switchToCamera();
    } catch {
      // User cancelled the picker — stay on camera
    }
  }, [onSourceSwitch]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToCamera = useCallback(() => {
    const cameraStream = localStreamRef.current;
    if (!cameraStream) return;

    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;

    const cameraTrack = cameraStream.getVideoTracks()[0];
    // Replace track for all peers — wrapped in case a PC is mid-close
    peersRef.current.forEach(p => {
      const sender = p.pc.getSenders().find(s => s.track?.kind === "video");
      try { if (sender && cameraTrack) sender.replaceTrack(cameraTrack); } catch { /* peer disconnecting */ }
    });

    setLocalStream(cameraStream);
    setVideoSource("camera");
    onSourceSwitch?.(cameraStream);
  }, [onSourceSwitch]);

  const handleSourceToggle = useCallback((source: VideoSource) => {
    if (source === "screen") switchToScreen();
    else switchToCamera();
  }, [switchToScreen, switchToCamera]);

  const toggleAudio = () => {
    const muted = !audioMuted;
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !muted; });
    setAudioMuted(muted);
  };

  const toggleVideo = () => {
    const muted = !videoMuted;
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !muted; });
    setVideoMuted(muted);
  };

  const leave = () => {
    // Confirm if last peer in room — fat finger protection
    if (peers.length === 0 && !window.confirm("You're the last one here — end the session?")) return;
    wsRef.current?.send(JSON.stringify({ type: "leave" }));
    wsRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    runPlugins(pluginsRef.current, "onLeave");
    window.location.href = "/dashboard";
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      runPlugins(pluginsRef.current, "onLeave");
      wsRef.current?.close();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(p => p.pc.close());
    };
  }, []);

  const pluginControls = plugins.map(p => p.renderControls?.() ?? null).filter(Boolean);
  const pluginOverlays = plugins.map(p => p.renderOverlay?.() ?? null).filter(Boolean);

  if (phase === "lobby") {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="session">
          <div className="session-header">
            <a href="/" className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</a>
            <span className="session-id">{roomCode}</span>
            <button className="btn-share" onClick={copyLink}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Copy invite link"}
            </button>
          </div>
          <div className="lobby">
            <div>
              <h1 className="lobby-title">Ready to join?</h1>
              <p className="lobby-sub" style={{ marginTop: 8 }}>Share the link above to invite others — no account needed to join.</p>
            </div>
            <div className="lobby-preview">
              <video ref={lobbyVideoRef} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </div>
            <div className="lobby-controls">
              <button className={`ctrl-btn ${audioMuted ? "muted" : ""}`} onClick={toggleAudio}>
                {audioMuted ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
              <button className={`ctrl-btn ${videoMuted ? "muted" : ""}`} onClick={toggleVideo}>
                {videoMuted ? <VideoOff size={18} /> : <Video size={18} />}
              </button>
            </div>
            {!user && (
              <input
                placeholder="Your name"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && guestName.trim() && join()}
                style={{
                  padding: "10px 16px", borderRadius: 8, fontSize: 14,
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#ece8f8", outline: "none", width: 240, textAlign: "center",
                  fontFamily: "'DM Sans', system-ui, sans-serif",
                }}
              />
            )}
            <button className="btn-join" onClick={join} disabled={!localStream || (!user && !guestName.trim())}>
              Join room
            </button>
            {/* Multi-channel setup hidden — DO NOT DELETE, kept for future restore */}
            {/* {renderLobbyExtra?.()} */}
          </div>
        </div>
      </>
    );
  }

  const allTiles = [
    { id: peerId.current, name: `${peerName} (you)`, stream: localStream, isSelf: true, audioMuted, videoMuted },
    ...peers.map(p => ({ id: p.id, name: p.name, stream: p.stream, isSelf: false, audioMuted: p.audioMuted, videoMuted: p.videoMuted })),
  ];
  const tileCount = Math.min(allTiles.length, 6);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="session">
        <div className="session-header">
          <a href="/" className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</a>
          <div className="peer-count"><span className="status-dot" />{allTiles.length} in room</div>
          <div className="header-right">
            <button className="btn-share" onClick={copyLink}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Copied!" : "Invite"}
            </button>
          </div>
        </div>

        <div className="session-body">
          <div className="tiles-container">
            <div className="tiles" data-count={tileCount}>
              {allTiles.map(tile => (
                <VideoTile
                  key={tile.id}
                  stream={tile.stream}
                  name={tile.name}
                  isSelf={tile.isSelf}
                  audioMuted={tile.audioMuted}
                />
              ))}
            </div>
            {pluginOverlays.length > 0 && <div className="tiles-overlay">{pluginOverlays}</div>}
          </div>
        </div>

        {/* Plugin status strip — recording indicator etc. above controls bar */}
        {pluginControls.length > 0 && (
          <div className="plugin-strip">
            {pluginControls}
          </div>
        )}

        <div className="controls">
          <button className={`ctrl-btn ${audioMuted ? "muted" : ""}`} onClick={toggleAudio} title={audioMuted ? "Unmute" : "Mute"}>
            {audioMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button className={`ctrl-btn ${videoMuted ? "muted" : ""}`} onClick={toggleVideo} title={videoMuted ? "Show video" : "Hide video"}>
            {videoMuted ? <VideoOff size={20} /> : <Video size={20} />}
          </button>

          {/* Source picker — camera or screen */}
          <div className="source-picker" title="Video source">
            <button
              className={`source-btn ${videoSource === "camera" ? "active" : ""}`}
              onClick={() => handleSourceToggle("camera")}
              title="Camera"
            >
              <Camera size={16} />
            </button>
            <button
              className={`source-btn ${videoSource === "screen" ? "active" : ""}`}
              onClick={() => handleSourceToggle("screen")}
              title="Share screen"
            >
              <Monitor size={16} />
            </button>
          </div>

          <button className="ctrl-btn danger" onClick={leave} title="Leave"><PhoneOff size={20} /></button>
        </div>
      </div>
    </>
  );
}