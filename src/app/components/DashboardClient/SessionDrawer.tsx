"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { getSessionRecording } from "@/app/serverActions/recording/getSessionRecording";
import { streamChunksToVideo } from "@/lib/plugins/recording/stitchChunks";
import type { SessionEntry } from "./SessionList";

interface Props {
  session:  SessionEntry;
  orgId:    string;
  userId:   string;
  onClose:  () => void;
  onDelete: (sessionId: string) => void;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date): string {
  return new Date(d).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const CSS = `
.sd-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
  display: flex; justify-content: flex-end;
}
.sd-panel {
  width: min(520px, 100vw); height: 100%;
  background: var(--bg-2); border-left: 1px solid var(--border);
  display: flex; flex-direction: column;
  animation: sdSlideIn 0.2s ease;
}
@keyframes sdSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

.sd-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.sd-header-left { display: flex; flex-direction: column; gap: 2px; }
.sd-session-id {
  font-size: 13px; font-weight: 600; color: var(--text);
  font-family: var(--mono); letter-spacing: 0.02em;
}
.sd-meta { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.sd-header-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex-shrink: 0; }
.sd-date { font-size: 12px; color: var(--text-2); }
.sd-time { font-size: 11px; color: var(--text-3); }
.sd-close {
  background: transparent; border: none; color: var(--text-3);
  padding: 4px; border-radius: 5px; cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center; margin-top: 2px;
}
.sd-close:hover { background: var(--bg-3); color: var(--text); }

.sd-body { flex: 1; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 16px; }

.sd-section-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-3); font-family: var(--mono); margin-bottom: 8px;
}

/* ── Video ── */
.sd-video-wrap {
  background: #000; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--border); position: relative;
}
.sd-video-wrap video { width: 100%; display: block; max-height: 60vh; object-fit: contain; }
.sd-video-placeholder {
  aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center;
  flex-direction: column; gap: 10px; cursor: pointer; background: var(--bg-3);
  transition: background 0.15s;
}
.sd-video-placeholder:hover { background: var(--bg); }
.sd-play-btn {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--purple); display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 20px var(--purple-g); transition: transform 0.15s;
}
.sd-video-placeholder:hover .sd-play-btn { transform: scale(1.08); }
.sd-play-hint { font-size: 12px; color: var(--text-3); }
.sd-video-loading { font-size: 12px; color: var(--text-3); text-align: center; padding: 20px 0; }
.sd-progress { height: 2px; background: var(--bg-3); border-radius: 100px; overflow: hidden; margin-top: 6px; }
.sd-progress-fill {
  height: 100%; background: linear-gradient(90deg, var(--purple-d), var(--purple-l));
  border-radius: 100px; transition: width 0.3s ease;
}
.sd-video-actions { display: flex; gap: 6px; padding: 8px 12px; border-top: 1px solid var(--border); }
.sd-no-recording { font-size: 12px; color: var(--text-3); padding: 16px 0; text-align: center; }

/* ── Transcript toggle ── */
.sd-transcript-toggle {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px; background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 8px; cursor: pointer; transition: border-color 0.15s; user-select: none;
}
.sd-transcript-toggle:hover { border-color: var(--border-p); }
.sd-transcript-toggle-label { font-size: 13px; color: var(--text-2); display: flex; align-items: center; gap: 8px; }
.sd-transcript-toggle-chevron { color: var(--text-3); transition: transform 0.2s; }
.sd-transcript-toggle-chevron.open { transform: rotate(180deg); }
.sd-transcript-box {
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 8px; padding: 12px 14px; max-height: 280px; overflow-y: auto;
  margin-top: 6px;
}
.sd-chunk { margin-bottom: 10px; }
.sd-chunk:last-child { margin-bottom: 0; }
.sd-speaker { font-size: 10px; color: var(--purple-l); font-family: var(--mono); margin-bottom: 2px; letter-spacing: 0.04em; }
.sd-text { font-size: 13px; color: var(--text-2); line-height: 1.55; }
.sd-empty { font-size: 12px; color: var(--text-3); text-align: center; padding: 16px 0; }

/* ── Footer ── */
.sd-footer {
  padding: 12px 20px; border-top: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
}
.sd-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px; border-radius: 7px; font-size: 12px; font-weight: 500; cursor: pointer; border: none; transition: all 0.15s; }
.sd-btn-outline { background: transparent; color: var(--text); border: 1px solid var(--border-p); }
.sd-btn-outline:hover { background: var(--purple-g2); }
.sd-btn-danger { background: rgba(248,113,113,0.08); color: var(--red); border: 1px solid rgba(248,113,113,0.2); }
.sd-btn-danger:hover { background: rgba(248,113,113,0.15); }
.sd-btn-primary { background: var(--purple); color: #fff; box-shadow: 0 2px 12px var(--purple-g); }
.sd-btn-primary:hover { background: #6d28d9; }

@media (max-width: 640px) {
  .sd-panel { width: 100vw; }
  .sd-video-wrap video { max-height: 40vh; }
}
`;

export default function SessionDrawer({ session, orgId, userId, onClose, onDelete }: Props) {
  const [recording, setRecording]     = useState<Awaited<ReturnType<typeof getSessionRecording>>>(null);
  const [loadingRec, setLoadingRec]   = useState(false);
  const [loadStarted, setLoadStarted] = useState(false);
  const [streaming, setStreaming]     = useState(false);
  const [progress, setProgress]       = useState(0);
  const [hasVideo, setHasVideo]       = useState(false);
  const [transcript, setTranscript]   = useState<any[]>([]);
  const [loadingTx, setLoadingTx]     = useState(false);
  const [txOpen, setTxOpen]           = useState(false);
  const videoRef                      = useRef<HTMLVideoElement>(null);

  // Load recording manifest on mount (just the metadata, not the chunks)
  useEffect(() => {
    setLoadingRec(true);
    getSessionRecording(session.sessionId, userId, orgId)
      .then(setRecording)
      .catch(() => setRecording(null))
      .finally(() => setLoadingRec(false));
  }, [session.sessionId, userId, orgId]);

  // Only start streaming when user clicks play
  const startStream = useCallback(() => {
    if (!recording || !videoRef.current || loadStarted) return;
    setLoadStarted(true);

    if (recording.assembled && recording.assembledUrl) {
      videoRef.current.src = recording.assembledUrl;
      setHasVideo(true);
      videoRef.current.play().catch(() => {});
      return;
    }

    if (recording.chunkUrls.length > 0) {
      setStreaming(true);
      setHasVideo(true);
      streamChunksToVideo(videoRef.current, recording.chunkUrls, (loaded, total) => {
        setProgress(Math.round((loaded / total) * 100));
      })
        .then(() => videoRef.current?.play().catch(() => {}))
        .catch(console.error)
        .finally(() => setStreaming(false));
    }
  }, [recording, loadStarted]);

  // Load transcript only when opened
  useEffect(() => {
    if (!txOpen || !session.hasTranscript || transcript.length > 0) return;
    setLoadingTx(true);
    fetch(`/api/session/transcript?sessionId=${session.sessionId}`)
      .then(r => r.json())
      .then((data: any) => setTranscript(data.chunks ?? []))
      .catch(() => setTranscript([]))
      .finally(() => setLoadingTx(false));
  }, [txOpen, session.sessionId, session.hasTranscript]);

  function handleDownload() {
    if (!videoRef.current?.src) return;
    const a    = document.createElement("a");
    a.href     = videoRef.current.src;
    a.download = `session-${session.sessionId.slice(0, 8)}.webm`;
    a.click();
  }

  function handleDelete() {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    onDelete(session.sessionId);
    onClose();
  }

  const hasRecording     = !!recording && (recording.assembled || recording.chunkUrls.length > 0);
  const sessionShortId   = session.sessionId.slice(0, 12);

  return (
    <>
      <style>{CSS}</style>
      <div className="sd-overlay" onClick={onClose}>
        <div className="sd-panel" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="sd-header">
            <div className="sd-header-left">
              <div className="sd-session-id">{sessionShortId}…</div>
              <div className="sd-meta">
                {formatDuration(session.durationMs)} · {session.peakPeers}p · {session.messageCount} msg
              </div>
            </div>
            <div className="sd-header-right">
              <div className="sd-date">{formatDate(session.startedAt)}</div>
              <div className="sd-time">{formatTime(session.startedAt)}</div>
              <button className="sd-close" onClick={onClose}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <div className="sd-body">

            {/* Recording */}
            <div>
              <div className="sd-section-title">Recording</div>
              {loadingRec && <div className="sd-video-loading">Checking for recording…</div>}
              {!loadingRec && !hasRecording && <div className="sd-no-recording">No recording for this session</div>}
              {!loadingRec && hasRecording && (
                <div className="sd-video-wrap">
                    {/* Always rendered, hidden until playing */}
                    <video
                        ref={videoRef}
                        controls
                        playsInline
                        onCanPlay={() => console.log("can play")}
                        onError={(e) => console.error("video error", e.currentTarget.error)}
                        style={{ display: hasVideo ? "block" : "none" }}
                    />

                    {!loadStarted && (
                    <div className="sd-video-placeholder" onClick={startStream}>
                        <div className="sd-play-btn">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M5 3l10 6-10 6V3z" fill="#fff"/>
                        </svg>
                        </div>
                        <div className="sd-play-hint">
                        {recording?.chunkUrls.length
                            ? `${recording.chunkUrls.length} chunks · click to load`
                            : "Click to play"}
                        </div>
                    </div>
                    )}

                    {loadStarted && streaming && (
                    <div style={{ padding: "6px 12px 8px" }}>
                        <div className="sd-progress">
                        <div className="sd-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <div style={{ fontSize: 10, color: "var(--text-3)", textAlign: "center", marginTop: 4, fontFamily: "var(--mono)" }}>
                        loading {progress}%
                        </div>
                    </div>
                    )}

                    {loadStarted && hasVideo && (
                    <div className="sd-video-actions">
                        <button className="sd-btn sd-btn-outline" onClick={handleDownload}>↓ Download</button>
                    </div>
                    )}
                </div>
              )}
            </div>

            {/* Transcript — collapsed by default */}
            {session.hasTranscript && (
              <div>
                <div
                  className="sd-transcript-toggle"
                  onClick={() => setTxOpen(o => !o)}
                >
                  <span className="sd-transcript-toggle-label">
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M2 2h9a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm1 2.5h7M3 6.5h7M3 8.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
                    </svg>
                    Transcript
                  </span>
                  <svg
                    className={`sd-transcript-toggle-chevron${txOpen ? " open" : ""}`}
                    width="13" height="13" viewBox="0 0 13 13" fill="none"
                  >
                    <path d="M2.5 4.5l4 4 4-4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                {txOpen && (
                  <div className="sd-transcript-box">
                    {loadingTx && <div className="sd-empty">Loading…</div>}
                    {!loadingTx && transcript.length === 0 && <div className="sd-empty">No transcript</div>}
                    {transcript.map((chunk, i) => (
                      <div key={i} className="sd-chunk">
                        <div className="sd-speaker">{chunk.displayName ?? chunk.peerId?.slice(0, 8)}</div>
                        <div className="sd-text">{chunk.text}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Footer */}
          <div className="sd-footer">
            <button className="sd-btn sd-btn-danger" onClick={handleDelete}>Delete</button>
            {hasVideo && loadStarted && (
              <button className="sd-btn sd-btn-primary" onClick={handleDownload}>↓ Download recording</button>
            )}
          </div>

        </div>
      </div>
    </>
  );
}