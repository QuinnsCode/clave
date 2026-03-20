"use client";
// src/app/components/DashboardClient/SessionList.tsx

import { useState } from "react";

export interface SessionEntry {
  sessionId: string;
  startedAt: Date;
  endedAt: Date | null;
  peakPeers: number;
  messageCount: number;
  durationMs: number | null;
  hasTranscript: boolean;
  hasSummary: boolean;
  roomCode: string | null;
}

interface Props {
  sessions:         SessionEntry[];
  onDelete:         (sessionId: string) => void;
  onViewTranscript: (sessionId: string) => void;
  onViewSummary:    (sessionId: string) => void;
  onSelect?:        (session: SessionEntry) => void;
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

function WaveIcon({ active }: { active?: boolean }) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      {[2, 6, 10, 14, 18, 22].map((x, i) => {
        const heights = [8, 16, 22, 18, 12, 6];
        const h = heights[i];
        const y = (28 - h) / 2;
        return <rect key={x} x={x} y={y} width="3" height={h} rx="1.5" fill={active ? "var(--purple-l)" : "var(--text-3)"} opacity={active ? 1 : 0.5} />;
      })}
    </svg>
  );
}

function SessionCard({ session, onDelete, onViewTranscript, onViewSummary, onSelect }: {
  session: SessionEntry;
  onDelete: () => void;
  onViewTranscript: () => void;
  onViewSummary: () => void;
  onSelect?: () => void;
}) {
  return (
    <div className="session-card" onClick={onSelect} style={{ cursor: onSelect ? "pointer" : "default" }}>
      <div className="session-card-icon"><WaveIcon /></div>
      <div className="session-card-body">
        <div className="session-card-date">{formatDate(session.startedAt)}</div>
        <div className="session-card-time">{formatTime(session.startedAt)}</div>
        <div className="session-card-meta">
          <span>{formatDuration(session.durationMs)}</span>
          <span className="dot">·</span>
          <span>{session.peakPeers} peer{session.peakPeers !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="session-card-badges">
        {session.hasTranscript && <span className="badge badge-t">T</span>}
        {session.hasSummary    && <span className="badge badge-s">S</span>}
      </div>
      <div className="session-card-actions" onClick={e => e.stopPropagation()}>
        {session.hasTranscript && <button className="action-btn" onClick={onViewTranscript} title="View transcript"><ScrollIcon /></button>}
        {session.hasSummary    && <button className="action-btn" onClick={onViewSummary} title="View summary"><SparkIcon /></button>}
        {session.roomCode      && <button className="action-btn" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/s/${session.roomCode}`)} title="Copy link"><ShareIcon /></button>}
        <button className="action-btn action-btn-danger" onClick={onDelete} title="Delete"><TrashIcon /></button>
      </div>
    </div>
  );
}

function SessionRow({ session, onDelete, onViewTranscript, onViewSummary, onSelect }: {
  session: SessionEntry;
  onDelete: () => void;
  onViewTranscript: () => void;
  onViewSummary: () => void;
  onSelect?: () => void;
}) {
  return (
    <div className="session-row" onClick={onSelect} style={{ cursor: onSelect ? "pointer" : "default" }}>
      <div className="session-row-icon"><WaveIcon /></div>
      <div className="session-row-date">
        <span>{formatDate(session.startedAt)}</span>
        <span className="session-row-time">{formatTime(session.startedAt)}</span>
      </div>
      <div className="session-row-stat">{formatDuration(session.durationMs)}</div>
      <div className="session-row-stat">{session.peakPeers}p</div>
      <div className="session-row-stat">{session.messageCount} msg</div>
      <div className="session-row-badges">
        {session.hasTranscript && <span className="badge badge-t">transcript</span>}
        {session.hasSummary    && <span className="badge badge-s">summary</span>}
      </div>
      <div className="session-row-actions" onClick={e => e.stopPropagation()}>
        {session.hasTranscript && <button className="action-btn" onClick={onViewTranscript} title="View transcript"><ScrollIcon /></button>}
        {session.hasSummary    && <button className="action-btn" onClick={onViewSummary} title="View summary"><SparkIcon /></button>}
        {session.roomCode      && <button className="action-btn" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/s/${session.roomCode}`)} title="Copy link"><ShareIcon /></button>}
        <button className="action-btn action-btn-danger" onClick={onDelete} title="Delete"><TrashIcon /></button>
      </div>
    </div>
  );
}

function ScrollIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M3 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm1 3h7M4 7.5h7M4 10h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
function SparkIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3.2 3.2l1.4 1.4M10.4 10.4l1.4 1.4M3.2 11.8l1.4-1.4M10.4 4.6l1.4-1.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/></svg>;
}
function ShareIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M10.5 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM4.5 5.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10.5 8.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" stroke="currentColor" strokeWidth="1.2"/><path d="M6.4 6.8 8.6 5.2M6.4 8.2l2.2 1.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
function TrashIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 4h11M5 4V2.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 .5.5V4M6 7v4M9 7v4M3 4l.8 8.5a.5.5 0 0 0 .5.5h6.4a.5.5 0 0 0 .5-.5L12 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function GridIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><rect x="1.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="8.5" y="1.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="1.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/><rect x="8.5" y="8.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/></svg>;
}
function ListIcon() {
  return <svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M2 4h11M2 7.5h11M2 11h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}

const CSS = `
.session-list-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.session-list-title { font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-3); }
.view-toggle { display: flex; gap: 2px; background: var(--bg-3); border-radius: 6px; padding: 2px; }
.view-btn { background: transparent; border: none; color: var(--text-3); padding: 5px 7px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; transition: background 0.15s, color 0.15s; }
.view-btn.active { background: var(--bg-2); color: var(--text-1); }
.session-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.session-card { background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 8px; position: relative; transition: border-color 0.15s; }
.session-card:hover { border-color: var(--border-p); }
.session-card-icon { opacity: 0.7; }
.session-card-body { flex: 1; }
.session-card-date { font-size: 13px; font-weight: 500; color: var(--text); }
.session-card-time { font-size: 11px; color: var(--text-3); margin-top: 1px; }
.session-card-meta { font-size: 11px; color: var(--text-3); margin-top: 6px; display: flex; gap: 4px; align-items: center; }
.session-card-meta .dot { opacity: 0.4; }
.session-card-badges { display: flex; gap: 4px; }
.session-card-actions { display: flex; gap: 4px; border-top: 1px solid var(--border); padding-top: 10px; margin-top: 2px; }
.session-list { display: flex; flex-direction: column; gap: 8px; }
.session-row {
  display: grid; grid-template-columns: 32px 1fr 72px 40px 64px 1fr auto;
  align-items: center; gap: 12px; padding: 12px 16px;
  background: var(--bg-3); border: 1px solid var(--border); border-radius: 10px;
  transition: border-color 0.15s;
}
.session-row:hover { border-color: var(--border-p); }
.session-row-icon { opacity: 0.6; }
.session-row-date { font-size: 13px; color: var(--text); display: flex; flex-direction: column; gap: 1px; }
.session-row-time { font-size: 11px; color: var(--text-3); }
.session-row-stat { font-size: 12px; color: var(--text-2); }
.session-row-badges { display: flex; gap: 4px; }
.session-row-actions { display: flex; gap: 4px; }
.badge { font-size: 10px; font-weight: 600; letter-spacing: 0.04em; padding: 2px 5px; border-radius: 4px; }
.badge-t { background: rgba(124,58,237,0.15); color: var(--purple-l); }
.badge-s { background: rgba(34,197,94,0.1); color: var(--green); }
.action-btn { background: transparent; border: none; color: var(--text-3); padding: 5px; border-radius: 5px; cursor: pointer; display: flex; align-items: center; transition: background 0.12s, color 0.12s; flex-shrink: 0; }
.action-btn:hover { background: var(--bg-2); color: var(--text); }
.action-btn-danger:hover { background: rgba(239,68,68,0.12); color: #f87171; }
.session-empty { text-align: center; padding: 40px 20px; color: var(--text-3); font-size: 13px; }
.session-empty-icon { font-size: 28px; margin-bottom: 10px; opacity: 0.4; }
`;

export default function SessionList({ sessions, onDelete, onViewTranscript, onViewSummary, onSelect }: Props) {
  const [mode, setMode] = useState<"grid" | "list">("list");

  return (
    <>
      <style>{CSS}</style>
      <div className="session-list-header">
        <span className="session-list-title">Sessions</span>
        <div className="view-toggle">
          <button className={`view-btn${mode === "grid" ? " active" : ""}`} onClick={() => setMode("grid")}><GridIcon /></button>
          <button className={`view-btn${mode === "list" ? " active" : ""}`} onClick={() => setMode("list")}><ListIcon /></button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="session-empty">
          <div className="session-empty-icon">🎙</div>
          <div>No sessions yet. Start a room to get going.</div>
        </div>
      ) : mode === "grid" ? (
        <div className="session-grid">
          {sessions.map(s => (
            <SessionCard key={s.sessionId} session={s}
              onDelete={() => onDelete(s.sessionId)}
              onViewTranscript={() => onViewTranscript(s.sessionId)}
              onViewSummary={() => onViewSummary(s.sessionId)}
              onSelect={onSelect ? () => onSelect(s) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="session-list">
          {sessions.map(s => (
            <SessionRow key={s.sessionId} session={s}
              onDelete={() => onDelete(s.sessionId)}
              onViewTranscript={() => onViewTranscript(s.sessionId)}
              onViewSummary={() => onViewSummary(s.sessionId)}
              onSelect={onSelect ? () => onSelect(s) : undefined}
            />
          ))}
        </div>
      )}
    </>
  );
}