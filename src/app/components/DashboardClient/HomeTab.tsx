"use client";
// src/app/components/DashboardClient/HomeTab.tsx

import { useState, useCallback } from "react";
import { deleteSession } from "@/app/serverActions/sessions/deleteSession";
import SessionList, { type SessionEntry } from "./SessionList";
import SessionDrawer from "./SessionDrawer";
// CHANGED (cta unify) — CreateRoomModal is no longer rendered here. It's owned
// by DashboardClient so RoomNudge + this tab open the same modal. Same for
// createRoomClient — invocation lives in DashboardClient.
//   removed: import CreateRoomModal from "@/app/components/Session/CreateRoomModal";
//   removed: import type { RoomConfig } from "@/lib/qlave/roomCode";
//   removed: import { createRoomClient } from "@/lib/qlave/createRoomClient";
import type { ResolvedTranscriptionPlugin, ResolvedRecordingPlugin } from "@/lib/plugins/resolver";
// NEW — per-session artifact state for badges in list rows.
import type { SessionArtifactsView } from "@/app/serverActions/diarization/getSessionArtifacts";

interface Props {
  user:           { id?: string; name: string | null; email: string | null };
  site:           { id: string; siteKey: string } | null;
  orgId:          string | null;
  recentSessions: SessionEntry[];
  // NEW — keyed by sessionId; sessions absent from the map have no diarization
  // rows yet (component treats this as "all artifacts missing").
  artifactsBySession?: Record<string, SessionArtifactsView[]>;
  monthly: {
    sessionCount: number;
    totalMessages: number;
    totalDurationMs: number;
    peakPeers: number;
  };
  activeRoomUrl:  string | null;
  onRoomCreated:  (url: string) => void;
  // CHANGED (cta unify) — parent (DashboardClient) opens the shared modal.
  // We don't render the modal locally anymore; we just call this callback
  // when the user clicks our "Create room" / "New room" button.
  onCreateRoom:   () => void;
  // CHANGED (cta unify) — "generating" state is owned by DashboardClient now
  // since both CTAs share the same in-flight indicator.
  creating:       boolean;
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
  user, site, orgId, recentSessions,
  artifactsBySession,                   // NEW
  monthly,
  activeRoomUrl, onRoomCreated,
  onCreateRoom,                         // NEW (cta unify)
  creating,                             // NEW (cta unify)
  transcription, recording, maxPeers,
}: Props) {
  // CHANGED (cta unify) — local showModal/generating state removed. Both
  // are owned by DashboardClient now. Keeping local state only for:
  //   - copy-to-clipboard feedback
  //   - the session list mirror used by the optimistic delete
  //   - the drawer-open session pointer
  const [copied, setCopied]               = useState(false);
  const [sessions, setSessions]           = useState<SessionEntry[]>(recentSessions);
  const [selectedSession, setSelected]    = useState<SessionEntry | null>(null);

  // CHANGED (cta unify) — was a local createRoom that:
  //   1. closed the modal
  //   2. set generating
  //   3. called createRoomClient(config)
  //   4. surfaced the URL via onRoomCreated
  // All four of those now live in DashboardClient.handleConfirmCreateRoom.
  // We just trigger the modal open via the onCreateRoom prop.

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
              // CHANGED (cta unify) — was setShowModal(true). Now calls the
              // parent-provided handler that opens the shared CreateRoomModal
              // managed by DashboardClient. Both CTAs (this one + RoomNudge)
              // end up in the same modal flow.
              onClick={onCreateRoom}
              disabled={creating}
            >
              {creating ? <><span className="spin">⟳</span> Creating…</> : activeRoomUrl ? "New room" : "Create room"}
            </button>
          </div>
        </div>

        <div style={{ padding: "0 4px" }}>
          <SessionList
            sessions={sessions}
            artifactsBySession={artifactsBySession ?? {}}   // NEW
            onDelete={handleDelete}
            onViewTranscript={handleViewTranscript}
            onViewSummary={handleViewSummary}
            onSelect={setSelected}
          />
        </div>

      </div>

      {/* CHANGED (cta unify) — CreateRoomModal removed from this tab; it's
          rendered by DashboardClient so both CTAs (this tab's button +
          RoomNudge) share the same instance. The transcription/recording/
          maxPeers props are still threaded through to this component for
          future use (showing entitlements inline in the room section). */}

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