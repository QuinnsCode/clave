"use client";
// src/app/components/qlave-test/QlaveTestClient.tsx

import { useState, useEffect, useRef } from "react";
import { QlaveSession } from "@/lib/qlave/session";
import type { Peer, Status } from "@/lib/qlave/types";
import { Drum } from "lucide-react";

// ── Styles (unchanged) ────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: #080810; color: #ece8f8; font-family: 'DM Sans', sans-serif; -webkit-font-smoothing: antialiased; }
  input, button { font-family: inherit; }
  input:focus { outline: none; }

  :root {
    --purple:   #7c3aed;
    --purple-l: #a78bfa;xw
    --purple-g: rgba(124,58,237,0.28);
    --bg:       #080810;
    --bg-2:     #0d0d1a;
    --bg-3:     #111120;
    --surface:  #161428;
    --border:   rgba(255,255,255,0.06);
    --border-p: rgba(124,58,237,0.25);
    --text:     #ece8f8;
    --text-2:   #918caa;
    --text-3:   #4a4660;
    --green:    #22c55e;
    --red:      #f87171;
    --mono:     'DM Mono', monospace;
    --serif:    'Instrument Serif', Georgia, serif;
  }

  .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 36px; border-bottom: 1px solid var(--border); background: rgba(8,8,16,0.9); backdrop-filter: blur(20px); position: sticky; top: 0; z-index: 100; }
  .pill { display: inline-flex; align-items: center; padding: 4px 13px; border-radius: 100px; background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6); font-size: 13px; font-weight: 600; color: #fff; box-shadow: 0 2px 14px var(--purple-g); font-family: var(--serif); }
  .nav-right { display: flex; align-items: center; gap: 12px; }
  .badge-dev { padding: 3px 10px; border-radius: 100px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); font-family: var(--mono); font-size: 10px; color: #fbbf24; letter-spacing: 0.08em; }
  .nav-hint { font-family: var(--mono); font-size: 11px; color: var(--text-3); }
  .page { min-height: 100vh; display: flex; flex-direction: column; background: var(--bg); }
  .main { flex: 1; max-width: 960px; width: 100%; margin: 0 auto; padding: 52px 24px 80px; display: flex; flex-direction: column; gap: 32px; }
  .eyebrow { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--purple-l); margin-bottom: 12px; }
  .title { font-family: var(--serif); font-size: clamp(30px,5vw,50px); line-height: 1.15; margin-bottom: 12px; }
  .title em { font-style: italic; color: var(--purple-l); }
  .sub { font-size: 15px; line-height: 1.7; color: var(--text-2); max-width: 560px; }
  .config-card { background: var(--bg-2); border: 1px solid var(--border); border-radius: 14px; padding: 28px 30px; }
  .config-label { font-family: var(--mono); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-3); margin-bottom: 20px; }
  .fields { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field-label { font-size: 11px; font-weight: 500; color: var(--text-2); text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--mono); }
  .field-input { padding: 10px 13px; background: var(--bg-3); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-size: 13px; font-family: var(--mono); transition: border-color 0.15s, box-shadow 0.15s; }
  .field-input:focus { border-color: var(--border-p); box-shadow: 0 0 0 3px rgba(124,58,237,0.1); }
  .field-input::placeholder { color: var(--text-3); }
  .config-hint { font-size: 12px; color: var(--text-3); }
  .video-wrap { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); box-shadow: 0 24px 64px rgba(0,0,0,0.5); background: var(--bg-3); }
  .video-grid { display: grid; gap: 2px; background: var(--surface); min-height: 380px; }
  .tile { position: relative; background: var(--surface); aspect-ratio: 16/9; overflow: hidden; }
  .tile video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tile-label { position: absolute; bottom: 10px; left: 12px; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.85); text-shadow: 0 1px 6px rgba(0,0,0,0.9); }
  .tile-you { padding: 2px 8px; border-radius: 100px; background: var(--purple); color: #fff; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; }
  .tile-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-3); font-size: 28px; }
  .idle-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 72px 24px; gap: 10px; min-height: 380px; }
  .idle-icon { font-size: 40px; margin-bottom: 4px; }
  .idle-title { font-family: var(--serif); font-size: 22px; color: var(--text); }
  .idle-sub { font-size: 14px; color: var(--text-2); text-align: center; max-width: 320px; }
  .controls { display: flex; align-items: center; justify-content: space-between; padding: 13px 18px; background: var(--bg-2); border-top: 1px solid var(--border); }
  .status { display: flex; align-items: center; gap: 8px; }
  .status-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; transition: background 0.3s; }
  .status-dot.live { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; }
  .status-dot.error { background: var(--red); }
  .status-dot.idle { background: var(--text-3); }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:.5} }
  .status-text { font-size: 13px; color: var(--text-2); }
  .btn { display: inline-flex; align-items: center; justify-content: center; padding: 9px 20px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
  .btn-primary { background: var(--purple); color: #fff; box-shadow: 0 2px 16px var(--purple-g); }
  .btn-primary:hover { background: #6d28d9; transform: translateY(-1px); }
  .btn-leave { background: rgba(248,113,113,0.1); color: var(--red); border: 1px solid rgba(248,113,113,0.2); }
  .btn-leave:hover { background: rgba(248,113,113,0.18); }
  .info-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .info-card { background: var(--bg); padding: 26px 22px; transition: background 0.2s; }
  .info-card:hover { background: var(--bg-2); }
  .info-icon { font-size: 20px; margin-bottom: 10px; }
  .info-title { font-size: 14px; font-weight: 600; color: var(--text); margin-bottom: 6px; }
  .info-body { font-size: 13px; line-height: 1.65; color: var(--text-2); }
  @media (max-width: 640px) {
    .fields { grid-template-columns: 1fr; }
    .info-grid { grid-template-columns: 1fr; }
    .nav { padding: 14px 20px; }
    .main { padding: 36px 16px 60px; }
  }
`;

const STATUS_TEXT: Record<Status, string> = {
  idle: "Not connected", acquiring: "Requesting camera…", connecting: "Connecting…",
  ready: "Waiting for peers…", connected: "Connected",
  error: "Connection error", disconnected: "Disconnected",
};

// ── VideoTile (unchanged) ─────────────────────────────────────────────────────

function VideoTile({ stream, label, isLocal }: { stream: MediaStream | null; label: string; isLocal?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current && stream) ref.current.srcObject = stream; }, [stream]);
  return (
    <div className="tile">
      {stream
        ? <video ref={ref} autoPlay playsInline muted={isLocal} style={{ transform: isLocal ? "scaleX(-1)" : "none" }} />
        : <div className="tile-placeholder">◎</div>}
      <div className="tile-label">
        {isLocal && <span className="tile-you">you</span>}
        {label}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function QlaveTestClient() {
  const [sessionId, setSessionId] = useState("test-1");
  const [displayName, setDisplayName] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<QlaveSession | null>(null);
  const name = displayName.trim() || "you";

  const join = () => {
    const session = new QlaveSession(
      { sessionId, displayName, siteKey: "platform" },
      {
        onStatusChange: (s, err) => { setStatus(s); setError(err ?? null); },
        onLocalStream: (stream) => setLocalStream(stream),
        onPeerJoined: (peer) => setPeers(prev => [...prev, peer]),
        onPeerUpdated: (peer) => setPeers(prev => prev.map(p => p.id === peer.id ? peer : p)),
        onPeerLeft: (peerId) => setPeers(prev => prev.filter(p => p.id !== peerId)),
      }
    );
    sessionRef.current = session;
    void session.join();
  };

  const leave = () => {
    sessionRef.current?.leave();
    sessionRef.current = null;
    setLocalStream(null);
    setPeers([]);
  };

  useEffect(() => () => { sessionRef.current?.leave(); }, []);

  const isActive = !["idle", "disconnected", "error"].includes(status);
  const totalTiles = (isActive ? 1 : 0) + peers.length;
  const cols = totalTiles <= 1 ? 1 : totalTiles <= 4 ? 2 : 3;
  const dotClass = status === "connected" || status === "ready" ? "live" : status === "error" ? "error" : "idle";

  return (
    <div className="page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <nav className="nav">
        <a href="/"><span className="pill"><Drum size={13} strokeWidth={2.5} /> qlave</span></a>
        <div className="nav-right">
          <span className="badge-dev">dev mode</span>
          <span className="nav-hint">/__qlave/:sessionId</span>
        </div>
      </nav>
      <main className="main">
        <div>
          <div className="eyebrow">WebRTC · Durable Object signaling</div>
          <h1 className="title">Session <em>{sessionId}</em></h1>
          <p className="sub">Open this page in two tabs with the same Session ID. Video connects directly — the DO is signaling only.</p>
        </div>

        {!isActive && (
          <div className="config-card">
            <div className="config-label">Session config</div>
            <div className="fields">
              <div className="field">
                <span className="field-label">Session ID</span>
                <input className="field-input" value={sessionId} onChange={e => setSessionId(e.target.value)} placeholder="test-1" spellCheck={false} />
              </div>
              <div className="field">
                <span className="field-label">Display name</span>
                <input className="field-input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Aragorn" />
              </div>
            </div>
            <span className="config-hint">Share the same Session ID with another tab to connect.</span>
          </div>
        )}

        <div className="video-wrap">
          <div className="video-grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {isActive && <VideoTile stream={localStream} label={name} isLocal />}
            {peers.map(p => <VideoTile key={p.id} stream={p.stream} label={p.id.slice(0, 8)} />)}
            {!isActive && (
              <div className="idle-state">
                <div className="idle-icon"><Drum size={13} strokeWidth={2.5} /></div>
                <div className="idle-title">Ready to connect</div>
                <div className="idle-sub">Click Join to start a P2P session in this tab</div>
              </div>
            )}
          </div>
          <div className="controls">
            <div className="status">
              <span className={`status-dot ${dotClass}`} />
              <span className="status-text">{error ?? STATUS_TEXT[status]}</span>
            </div>
            <div>
              {!isActive
                ? <button className="btn btn-primary" onClick={join}>Join session</button>
                : <button className="btn btn-leave" onClick={leave}>Leave</button>}
            </div>
          </div>
        </div>

        <div className="info-grid">
          {[
            { icon: "⚡", title: "Peer-to-peer", body: "Video and audio travel directly between browsers. The DO routes offer/answer/ICE only — it never sees a media frame." },
            { icon: "🛏", title: "Hibernating DO", body: "QlaveSessionDO sleeps between signals via CF hibernation API. You pay ~10ms CPU per message, not per connection." },
            { icon: "🔑", title: "Auth stubbed", body: "QLAVE_DEV_MODE bypasses auth for testing. Swap in your BetterAuth session check before shipping to users." },
          ].map(c => (
            <div className="info-card" key={c.title}>
              <div className="info-icon">{c.icon}</div>
              <div className="info-title">{c.title}</div>
              <div className="info-body">{c.body}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}