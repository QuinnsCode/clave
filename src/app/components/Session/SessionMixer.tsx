"use client";
// app/components/Session/SessionMixer.tsx
// Mobile-first overlay UI:
// - Mixer modal: slides up from bottom, thin channel strips, mute/volume/kick per channel
// - Transcript: YouTube-live-style bubbles floating over video, tap to expand full-screen

import { useState, useEffect, useRef } from "react";
import { X, Maximize2, Minimize2, Eye, EyeOff } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface TranscriptLine { peerId: string; text: string; timestamp: number; }
interface Channel { peerId: string; displayName: string; stream: MediaStream | null; color: string; }

interface SessionMixerProps {
  channels: Channel[];
  liveText: string;
  transcript: TranscriptLine[];
  captions: Record<string, { text: string; timestamp: number }>;
  isRoomMaker: boolean;
  showMixer: boolean;
  showTranscript: boolean;
  onCloseMixer: () => void;
  onExport: (format: "txt" | "srt") => void;
  capReached?: boolean;
}

// ── Color palette ─────────────────────────────────────────────────────────────

const CHANNEL_COLORS = [
  "#00ffe1","#ff6b35","#ffd700","#a78bfa",
  "#34d399","#f472b6","#60a5fa","#fb923c",
  "#e879f9","#4ade80","#f87171","#38bdf8",
];
export function getChannelColor(i: number) { return CHANNEL_COLORS[i % CHANNEL_COLORS.length]; }

// ── Waveform ──────────────────────────────────────────────────────────────────

function WaveformBars({ stream, color, barCount = 20 }: { stream: MediaStream | null; color: string; barCount?: number }) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const animRef     = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!stream) return;
    const actx = new AudioContext();
    const analyser = actx.createAnalyser();
    analyser.fftSize = 64;
    analyser.smoothingTimeConstant = 0.75;
    actx.createMediaStreamSource(stream).connect(analyser);
    analyserRef.current = analyser;
    const data   = new Uint8Array(analyser.frequencyBinCount);
    const canvas = canvasRef.current;
    if (!canvas) return;

    function draw() {
      animRef.current = requestAnimationFrame(draw);
      if (!analyserRef.current || !canvas) return;
      analyserRef.current.getByteFrequencyData(data);
      const c = canvas.getContext("2d"); if (!c) return;
      const w = canvas.width, h = canvas.height;
      c.clearRect(0, 0, w, h);
      const barW = Math.floor(w / barCount) - 1;
      const step = Math.floor(data.length / barCount);
      for (let i = 0; i < barCount; i++) {
        const val  = data[i * step] / 255;
        const barH = Math.max(2, val * h);
        const x = i * (barW + 1), y = (h - barH) / 2;
        const grad = c.createLinearGradient(0, y, 0, y + barH);
        grad.addColorStop(0, color + "ff");
        grad.addColorStop(1, color + "44");
        c.fillStyle = grad;
        c.beginPath(); c.roundRect(x, y, barW, barH, 2); c.fill();
      }
    }
    draw();
    return () => { cancelAnimationFrame(animRef.current); actx.close(); };
  }, [stream, color, barCount]);

  if (!stream) return (
    <div style={{ display:"flex", alignItems:"center", gap:2, height:32, width:"100%" }}>
      {Array.from({ length: barCount }).map((_, i) => (
        <div key={i} style={{
          flex:1, background:color, opacity:0.2, borderRadius:2, height:4,
          animation:`idle-pulse 1.8s ease-in-out ${i * 40}ms infinite`,
        }} />
      ))}
    </div>
  );

  return <canvas ref={canvasRef} style={{ width:"100%", height:32, display:"block" }} width={barCount * 8} height={32} />;
}

// ── Channel strip ─────────────────────────────────────────────────────────────

function ChannelStrip({ channel, muted, volume, onMute, onVolume, onKick, isRoomMaker, caption }: {
  channel: Channel; muted: boolean; volume: number;
  onMute: () => void; onVolume: (v: number) => void; onKick?: () => void;
  isRoomMaker: boolean; caption?: string;
}) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"1fr auto",
      gap:"4px 10px", padding:"8px 14px",
      borderBottom:"1px solid rgba(255,255,255,0.05)",
    }}>
      {/* name + waveform */}
      <div style={{ minWidth:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:channel.color, boxShadow:`0 0 5px ${channel.color}`, flexShrink:0 }} />
          <span style={{ fontSize:12, fontWeight:600, color:"#ece8f8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {channel.displayName}
          </span>
        </div>
        <WaveformBars stream={channel.stream} color={channel.color} />
        {caption && (
          <div style={{ fontSize:11, color:channel.color, fontStyle:"italic", opacity:0.85, marginTop:2, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {caption}
          </div>
        )}
      </div>

      {/* controls */}
      <div style={{ display:"flex", flexDirection:"column", gap:5, alignItems:"flex-end", justifyContent:"center" }}>
        <button onClick={onMute} style={{
          background: muted ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
          border:`1px solid ${muted ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
          borderRadius:5, padding:"2px 8px", fontSize:10,
          color: muted ? "#ef4444" : "#777", cursor:"pointer", fontFamily:"inherit",
        }}>{muted ? "unmute" : "mute"}</button>
        <input type="range" min={0} max={100} value={volume}
          onChange={e => onVolume(Number(e.target.value))}
          style={{ width:64, accentColor:channel.color, cursor:"pointer" }}
        />
        {isRoomMaker && onKick && (
          <button onClick={onKick} style={{
            background:"rgba(239,68,68,0.08)", border:"1px solid rgba(239,68,68,0.2)",
            borderRadius:5, padding:"2px 8px", fontSize:10, color:"#f87171", cursor:"pointer", fontFamily:"inherit",
          }}>kick</button>
        )}
      </div>
    </div>
  );
}

// ── Mixer modal ───────────────────────────────────────────────────────────────

function MixerModal({ channels, captions, isRoomMaker, capReached, onClose }: {
  channels: Channel[]; captions: Record<string, { text: string; timestamp: number }>;
  isRoomMaker: boolean; capReached: boolean; onClose: () => void;
}) {
  const [muteState,   setMuteState]   = useState<Record<string, boolean>>({});
  const [volumeState, setVolumeState] = useState<Record<string, number>>({});

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:50,
      display:"flex", flexDirection:"column", justifyContent:"flex-end",
      background:"rgba(0,0,0,0.45)", backdropFilter:"blur(4px)",
    }} onClick={onClose}>
      <div style={{
        background:"rgba(10,10,20,0.97)", borderTop:"1px solid rgba(255,255,255,0.08)",
        borderRadius:"18px 18px 0 0", maxHeight:"72vh", overflowY:"auto", paddingBottom:28,
      }} onClick={e => e.stopPropagation()}>

        {/* drag handle */}
        <div style={{ display:"flex", justifyContent:"center", padding:"12px 0 6px" }}>
          <div style={{ width:36, height:4, borderRadius:2, background:"rgba(255,255,255,0.15)" }} />
        </div>

        {/* header */}
        <div style={{ display:"flex", alignItems:"center", padding:"0 16px 10px", borderBottom:"1px solid rgba(255,255,255,0.06)" }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", opacity:0.4, flex:1, fontFamily:"DM Mono,monospace" }}>
            Channels
          </span>
          {capReached && (
            <span style={{ fontSize:10, background:"rgba(239,68,68,0.12)", color:"#ef4444", padding:"2px 7px", borderRadius:4, border:"1px solid rgba(239,68,68,0.2)", marginRight:10 }}>
              Limit reached
            </span>
          )}
          <button onClick={onClose} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", padding:4, lineHeight:1 }}>
            <X size={16} />
          </button>
        </div>

        {/* strips */}
        {channels.map(ch => (
          <ChannelStrip
            key={ch.peerId}
            channel={ch}
            muted={muteState[ch.peerId] ?? false}
            volume={volumeState[ch.peerId] ?? 80}
            onMute={() => setMuteState(p => ({ ...p, [ch.peerId]: !p[ch.peerId] }))}
            onVolume={v => setVolumeState(p => ({ ...p, [ch.peerId]: v }))}
            onKick={isRoomMaker && ch.displayName !== "You" ? () => console.log("kick", ch.peerId) : undefined}
            isRoomMaker={isRoomMaker}
            caption={captions[ch.peerId]?.text}
          />
        ))}
      </div>
    </div>
  );
}

// ── Transcript overlay ────────────────────────────────────────────────────────

function TranscriptOverlay({ transcript, channels, onExport }: {
  transcript: TranscriptLine[]; channels: Channel[];
  onExport: (format: "txt" | "srt") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [opaque,   setOpaque]   = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nameMap   = Object.fromEntries(channels.map(c => [c.peerId, c]));
  const recent    = transcript.slice(-10);

  useEffect(() => {
    if (expanded) bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [transcript.length, expanded]);

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" });

  // ── Full-screen expanded ──────────────────────────────────────────────────
  if (expanded) {
    return (
      <div style={{
        position:"fixed", inset:0, zIndex:40,
        background: opaque ? "rgba(8,8,16,0.95)" : "rgba(8,8,16,0.55)",
        backdropFilter: opaque ? "none" : "blur(16px)",
        display:"flex", flexDirection:"column",
        transition:"background 0.25s",
        paddingTop:"env(safe-area-inset-top)",
      }}>
        {/* header */}
        <div style={{ display:"flex", alignItems:"center", gap:8, padding:"16px 16px 14px", borderBottom:"1px solid rgba(255,255,255,0.07)", flexShrink:0, flexWrap:"wrap" }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", opacity:0.4, flex:1, fontFamily:"DM Mono,monospace" }}>
            Transcript
          </span>
          <button onClick={() => setOpaque(v => !v)} title={opaque ? "Semi-transparent" : "Opaque"}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", padding:4 }}>
            {opaque ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>
          <button onClick={() => setExpanded(false)} style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", padding:4 }}>
            <Minimize2 size={16} />
          </button>
        </div>

        {/* lines */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 16px", display:"flex", flexDirection:"column", gap:16 }}>
          {transcript.length === 0 && (
            <div style={{ fontSize:13, opacity:0.3, textAlign:"center", marginTop:40, fontStyle:"italic" }}>
              Transcript will appear here as people speak.
            </div>
          )}
          {transcript.map((line, i) => {
            const ch    = nameMap[line.peerId];
            const color = ch?.color ?? "#a78bfa";
            return (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"auto 1fr", gridTemplateRows:"auto auto", gap:"1px 12px" }}>
                <span style={{ fontSize:11, fontWeight:800, letterSpacing:"0.07em", textTransform:"uppercase", color, gridRow:1, gridColumn:1, whiteSpace:"nowrap" }}>
                  {line.peerId}
                </span>
                <span style={{ fontSize:10, opacity:0.3, gridRow:2, gridColumn:1, whiteSpace:"nowrap", fontFamily:"DM Mono,monospace" }}>
                  {fmtTime(line.timestamp)}
                </span>
                <p style={{ gridRow:"1/3", gridColumn:2, fontSize:14, lineHeight:1.65, margin:0, opacity:0.9 }}>
                  {line.text}
                </p>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {/* sticky export footer */}
        <div style={{
          display:"flex", gap:8, padding:"12px 16px",
          borderTop:"1px solid rgba(255,255,255,0.07)", flexShrink:0,
          background:"rgba(8,8,16,0.6)",
          paddingBottom:"max(12px, env(safe-area-inset-bottom))",
        }}>
          <button onClick={() => onExport("txt")} style={{
            flex:1, padding:"10px", borderRadius:8,
            border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.04)",
            color:"#ece8f8", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit",
          }}>Export .txt</button>
          <button onClick={() => onExport("srt")} style={{
            flex:1, padding:"10px", borderRadius:8,
            border:"1px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.04)",
            color:"#ece8f8", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit",
          }}>Export .srt</button>
        </div>
      </div>
    );
  }

  // ── Bubble preview ────────────────────────────────────────────────────────
  return (
    <div style={{
      position:"fixed", bottom:88, left:0, right:0, zIndex:30,
      display:"flex", flexDirection:"column", gap:4, padding:"0 14px",
      pointerEvents:"none",
    }}>
      {recent.map((line, i) => {
        const ch    = nameMap[line.peerId];
        const color = ch?.color ?? "#a78bfa";
        const age   = recent.length - 1 - i;
        return (
          <div key={i} onClick={() => setExpanded(true)} style={{
            display:"inline-flex", alignItems:"baseline", gap:7, alignSelf:"flex-start", maxWidth:"88%",
            background:"rgba(8,8,16,0.60)", backdropFilter:"blur(8px)",
            border:"1px solid rgba(255,255,255,0.07)", borderRadius:20,
            padding:"5px 13px", cursor:"pointer", pointerEvents:"auto",
            opacity: Math.max(0.25, 1 - age * 0.11),
            transform: `scale(${Math.max(0.88, 1 - age * 0.012)})`,
            transformOrigin:"left center",
            transition:"opacity 0.3s, transform 0.3s",
          }}>
            <span style={{ fontSize:11, fontWeight:700, color, flexShrink:0 }}>{line.peerId}</span>
            <span style={{ fontSize:13, color:"#ece8f8", opacity:0.88, lineHeight:1.4 }}>{line.text}</span>
          </div>
        );
      })}

      {transcript.length > 0 && (
        <div style={{ alignSelf:"flex-end", pointerEvents:"auto", marginTop:2 }}>
          <button onClick={() => setExpanded(true)} style={{
            background:"rgba(124,58,237,0.18)", border:"1px solid rgba(124,58,237,0.28)",
            borderRadius:20, padding:"4px 13px", fontSize:11, color:"#a78bfa",
            cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:5,
          }}>
            <Maximize2 size={11} /> Full transcript
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function SessionMixer({
  channels, liveText, transcript, captions,
  isRoomMaker, showMixer, showTranscript,
  onCloseMixer, onExport, capReached = false,
}: SessionMixerProps) {
  return (
    <>
      {showMixer && (
        <MixerModal
          channels={channels}
          captions={captions}
          isRoomMaker={isRoomMaker}
          capReached={capReached}
          onClose={onCloseMixer}
        />
      )}
      {showTranscript && (
        <TranscriptOverlay
          transcript={transcript}
          channels={channels}
          onExport={onExport}
        />
      )}
      <style>{`
        @keyframes idle-pulse { 0%,100%{height:4px;opacity:.2} 50%{height:14px;opacity:.4} }
        *{box-sizing:border-box}
        input[type=range]{height:4px}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:rgba(128,128,128,0.2);border-radius:2px}
      `}</style>
    </>
  );
}