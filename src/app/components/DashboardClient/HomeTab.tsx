"use client";
// src/app/components/DashboardClient/HomeTab.tsx

import { useState, useCallback } from "react";
import { deleteSession } from "@/app/serverActions/sessions/deleteSession";
import SessionList, { type SessionEntry } from "./SessionList";
import SessionDrawer from "./SessionDrawer";
import CreateRoomModal from "@/app/components/Session/CreateRoomModal";
import type { RoomConfig } from "@/lib/qlave/roomCode";
import type { ResolvedTranscriptionPlugin, ResolvedRecordingPlugin } from "@/lib/plugins/resolver";
import { createRoomClient } from "@/lib/qlave/createRoomClient";

interface Props {
  user:           { id?: string; name: string | null; email: string | null };
  site:           { id: string; siteKey: string } | null;
  orgId:          string | null;
  recentSessions: SessionEntry[];
  monthly: {
    sessionCount: number;
    totalMessages: number;
    totalDurationMs: number;
    peakPeers: number;
  };
  activeRoomUrl:  string | null;
  onRoomCreated:  (url: string) => void;
  transcription:  ResolvedTranscriptionPlugin | null;
  recording:      ResolvedRecordingPlugin | null;
  maxPeers:       number;
}

const CSS = `
.home-tab { display: flex; flex-direction: column; gap: 32px; }
.room-section {
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px 24px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.room-label { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-3); margin-bottom: 4px; }
.room-url { font-size: 14px; font-weight: 500; color: var(--text-1); font-family: 'DM Mono', monospace; word-break: break-all; }
.room-url-placeholder { font-size: 13px; color: var(--text-3); font-style: italic; }
.room-actions { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }
.room-btn {
  font-size: 13px; font-weight: 500; padding: 8px 14px; border-radius: 7px;
  cursor: pointer; transition: background 0.15s, opacity 0.15s;
  border: none; display: flex; align-items: center; gap: 6px; text-decoration: none;
}
.room-btn-primary { background: var(--purple); color: #fff; }
.room-btn-primary:hover { background: var(--purple-d); }
.room-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.room-btn-go { background: rgba(251,146,60,0.15); color: #fb923c; border: 1px solid rgba(251,146,60,0.3); }
.room-btn-go:hover { background: rgba(251,146,60,0.25); }
.room-btn-secondary { background: var(--bg-2); color: var(--text-1); border: 1px solid var(--border); }
.room-btn-secondary:hover { border-color: var(--border-2); }
.room-btn-secondary:disabled { opacity: 0.4; cursor: not-allowed; }
.room-copied { font-size: 11px; color: var(--green); margin-top: 4px; }
@keyframes spin { to { transform: rotate(360deg); } }
.spin { animation: spin 0.7s linear infinite; display: inline-block; }
`;

export default function HomeTab({
  user, site, orgId, recentSessions, monthly,
  activeRoomUrl, onRoomCreated,
  transcription, recording, maxPeers,
}: Props) {
  const [showModal, setShowModal]         = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [copied, setCopied]               = useState(false);
  const [sessions, setSessions]           = useState<SessionEntry[]>(recentSessions);
  const [selectedSession, setSelected]    = useState<SessionEntry | null>(null);

  const createRoom = useCallback(async (config: RoomConfig) => {
    setShowModal(false);
    setGenerating(true);
    try {
      const url = await createRoomClient(config);
      if (url) onRoomCreated(url);
    } finally {
      setGenerating(false);
    }
  }, [onRoomCreated]);

  const copyUrl = useCallback(() => {
    if (!activeRoomUrl) return;
    navigator.clipboard.writeText(activeRoomUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeRoomUrl]);

  const handleDelete = useCallback(async (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    if (user.id) deleteSession(user.id, sessionId).catch(console.error);
  }, [user.id]);

  const handleViewTranscript = useCallback((sessionId: string) => {
    window.open(`/s/${sessionId}/recap`, "_blank");
  }, []);

  const handleViewSummary = useCallback((sessionId: string) => {
    window.open(`/s/${sessionId}/recap#summary`, "_blank");
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div className="home-tab">

        <div className="room-section">
          <div>
            <div className="room-label">Your room</div>
            {activeRoomUrl ? (
              <>
                <div className="room-url">{activeRoomUrl}</div>
                {copied && <div className="room-copied">Copied!</div>}
              </>
            ) : (
              <div className="room-url-placeholder">No active room — create one to share</div>
            )}
          </div>
          <div className="room-actions">
            {activeRoomUrl && (
              <>
                <a className="room-btn room-btn-go" href={activeRoomUrl} target="_blank" rel="noreferrer">
                  Go to room ↗
                </a>
                <button className="room-btn room-btn-secondary" onClick={copyUrl}>Copy</button>
              </>
            )}
            <button
              className="room-btn room-btn-primary"
              onClick={() => setShowModal(true)}
              disabled={generating}
            >
              {generating ? <><span className="spin">⟳</span> Creating…</> : activeRoomUrl ? "New room" : "Create room"}
            </button>
          </div>
        </div>

        <div style={{ padding: "0 4px" }}>
          <SessionList
            sessions={sessions}
            onDelete={handleDelete}
            onViewTranscript={handleViewTranscript}
            onViewSummary={handleViewSummary}
            onSelect={setSelected}
          />
        </div>

      </div>

      {showModal && (
        <CreateRoomModal
          transcription={transcription}
          recording={recording}
          maxPeers={maxPeers}
          onConfirm={createRoom}
          onClose={() => setShowModal(false)}
        />
      )}

      {selectedSession && (
        <SessionDrawer
          session={selectedSession}
          orgId={orgId ?? ""}
          userId={user?.id ?? ""}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}