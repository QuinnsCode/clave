"use client";
// src/app/components/Session/SessionClient.tsx
// Plugin-aware session client.
// Knows nothing about transcription, chat, or any feature.
// Features inject via SessionPlugin interface.

import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, Monitor, PhoneOff, Copy, Check, Drum } from "lucide-react";
import type { SessionPlugin, SignalMessage, PeerInfo } from "@/types";

interface Peer {
  id: string;
  name: string;
  stream: MediaStream | null;
  pc: RTCPeerConnection;
  audioMuted: boolean;
  videoMuted: boolean;
}

const ICE_SERVERS = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

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

  .controls {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    padding: 20px; flex-shrink: 0; border-top: 1px solid rgba(255,255,255,0.06);
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
    .session-panel { width: 100%; border-left: none; border-top: 1px solid rgba(255,255,255,0.06); max-height: 40vh; }
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

export default function SessionClient({
  sessionId,
  roomCode,
  user,
  plugins = [],
  siteKey,
  renderLobbyExtra,
}: {
  sessionId: string;
  roomCode: string;
  user: { name: string } | null;
  plugins?: SessionPlugin[];
  siteKey: string;
  renderLobbyExtra?: () => React.ReactNode;
}) {
  const peerId          = useRef(crypto.randomUUID());
  const peerName        = user?.name ?? "Guest";
  const wsRef           = useRef<WebSocket | null>(null);
  const localStreamRef  = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef        = useRef<Map<string, Peer>>(new Map());
  const localVideoRef   = useRef<HTMLVideoElement>(null);
  const lobbyVideoRef   = useRef<HTMLVideoElement>(null);

  const [phase, setPhase]             = useState<"lobby" | "session">("lobby");
  const [peers, setPeers]             = useState<Peer[]>([]);
  const [audioMuted, setAudioMuted]   = useState(false);
  const [videoMuted, setVideoMuted]   = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [copied, setCopied]           = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        localStreamRef.current = stream;
        if (lobbyVideoRef.current) lobbyVideoRef.current.srcObject = stream;
      })
      .catch(console.error);
    return () => { localStreamRef.current?.getTracks().forEach(t => t.stop()); };
  }, []);

  const createPeerConnection = useCallback((remotePeerId: string, remoteName: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    localStreamRef.current?.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current!));

    const remoteStream = new MediaStream();
    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t));
      const peer = peersRef.current.get(remotePeerId);
      if (peer) {
        peer.stream = remoteStream;
        setPeers(Array.from(peersRef.current.values()));
        runPlugins(plugins, "onPeerStreamUpdated", { peerId: remotePeerId, displayName: peer.name, stream: remoteStream });
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
        runPlugins(plugins, "onPeerLeft", remotePeerId);
      }
    };

    const peer: Peer = { id: remotePeerId, name: remoteName, stream: null, pc, audioMuted: false, videoMuted: false };
    peersRef.current.set(remotePeerId, peer);
    setPeers(Array.from(peersRef.current.values()));
    runPlugins(plugins, "onPeerJoined", { peerId: remotePeerId, displayName: remoteName, stream: null });
    return pc;
  }, [plugins]);

  const connect = useCallback((stream: MediaStream) => {
    const ws = new WebSocket(getWsUrl(sessionId, peerId.current, siteKey, roomCode));
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", name: peerName }));
      runPlugins(plugins, "onJoin", ws, peerId.current, stream);
    };

    ws.onmessage = async (e) => {
      const msg: SignalMessage = JSON.parse(e.data);
      if (runMessagePlugins(plugins, msg)) return;

      if (msg.type === "joined" && msg.peers) {
        const names = msg.peerNames ?? {};
        for (const pid of msg.peers) {
          if (pid === peerId.current) continue;
          const pc = createPeerConnection(pid, names[pid] ?? pid.slice(0, 8));
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
        runPlugins(plugins, "onPeerLeft", msg.peerId);
      }
    };

    ws.onclose = () => {
      peersRef.current.forEach(p => p.pc.close());
      peersRef.current.clear();
      setPeers([]);
      // Don't call onLeave here — WS close can be temporary (DO hibernation)
      // onLeave is called explicitly in leave()
    };
  }, [sessionId, siteKey, createPeerConnection, plugins]);

  const join = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    setPhase("session");
    connect(stream);
  }, [connect]);

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

  const toggleScreen = async () => {
    if (screenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      const camTrack = localStreamRef.current?.getVideoTracks()[0];
      if (camTrack) peersRef.current.forEach(p => {
        const sender = p.pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) sender.replaceTrack(camTrack);
      });
      setScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        peersRef.current.forEach(p => {
          const sender = p.pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        });
        screenTrack.onended = () => toggleScreen();
        setScreenSharing(true);
      } catch { /* cancelled */ }
    }
  };

  const leave = () => {
    wsRef.current?.send(JSON.stringify({ type: "leave" }));
    wsRef.current?.close();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    runPlugins(plugins, "onLeave");  // ← explicit call here
    window.location.href = "/dashboard";
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      runPlugins(plugins, "onLeave");  // ← add this
      wsRef.current?.close();
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(p => p.pc.close());
    };
  }, []);

  const pluginControls = plugins.map((p, i) => p.renderControls?.() ?? null).filter(Boolean);
  const pluginOverlays = plugins.map((p, i) => p.renderOverlay?.() ?? null).filter(Boolean);

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
            <button className="btn-join" onClick={join}>Join room</button>
            {renderLobbyExtra?.()}
          </div>
        </div>
      </>
    );
  }

  const allTiles = [
    { id: peerId.current, name: `${peerName} (you)`, stream: localStreamRef.current, isSelf: true, audioMuted, videoMuted },
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
                <div key={tile.id} className={`tile ${tile.isSelf ? "self" : ""}`}>
                  {tile.stream
                    ? <video autoPlay muted={tile.isSelf} playsInline
                        ref={el => { if (el) { if (tile.isSelf) localVideoRef.current = el; el.srcObject = tile.stream; } }} />
                    : <div className="tile-avatar">{initials(tile.name)}</div>
                  }
                  <div className="tile-name">{tile.name}</div>
                  {tile.audioMuted && <div className="tile-muted"><MicOff size={13} color="#f87171" /></div>}
                </div>
              ))}
            </div>
            {pluginOverlays.length > 0 && <div className="tiles-overlay">{pluginOverlays}</div>}
          </div>

        </div>

        <div className="controls">
          <button className={`ctrl-btn ${audioMuted ? "muted" : ""}`} onClick={toggleAudio} title={audioMuted ? "Unmute" : "Mute"}>
            {audioMuted ? <MicOff size={20} /> : <Mic size={20} />}
          </button>
          <button className={`ctrl-btn ${videoMuted ? "muted" : ""}`} onClick={toggleVideo} title={videoMuted ? "Show video" : "Hide video"}>
            {videoMuted ? <VideoOff size={20} /> : <Video size={20} />}
          </button>
          <button className={`ctrl-btn ${screenSharing ? "active" : ""}`} onClick={toggleScreen} title={screenSharing ? "Stop sharing" : "Share screen"}>
            <Monitor size={20} />
          </button>
          {pluginControls}
          <button className="ctrl-btn danger" onClick={leave} title="Leave"><PhoneOff size={20} /></button>
        </div>
      </div>
    </>
  );
}