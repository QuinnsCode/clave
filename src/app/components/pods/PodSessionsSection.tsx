"use client";
// src/app/components/pods/PodSessionsSection.tsx
//
// Sessions section inside a pod detail view.
// Two display modes:
//   "list"   — session rows with click → transcript modal
//   "search" — debounced search with 3-line context windows per result
//
// useEffect is used only for:
//   1. Debouncing the search query (300ms)
//   2. Firing the search + abort controller when debounced query changes
// All other data fetching is event-driven (server actions called directly).

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { Search, List, LayoutGrid, Plus, X, ChevronRight } from "lucide-react";
import {
  getPodSessions,
  searchPodTranscripts,
  getSessionsToAdd,
  addSessionToPod,
  type PodSessionItem,
  type PodSearchResult,
  type SessionForAdd,
} from "@/app/serverActions/pods/podSessions";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  podId:           string;
  organizationId:  string;
  initialSessions: PodSessionItem[];  // pre-loaded server-side
}

type ViewMode = "list" | "search";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}
// Always includes year so "Jun 22" becomes "Jun 22, 2026" — easier to
// distinguish sessions across months when scanning the add modal.

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m < 1) return `${s}s`;
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
.pss-root { display: flex; flex-direction: column; gap: 12px; }

.pss-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.pss-search-wrap {
  flex: 1; min-width: 180px;
  position: relative; display: flex; align-items: center;
}
.pss-search-icon {
  position: absolute; left: 10px; color: var(--text-3);
  display: flex; align-items: center; pointer-events: none;
}
.pss-search-input {
  width: 100%; padding: 7px 32px 7px 32px;
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 8px; color: var(--text); font-size: 13px;
  outline: none; font-family: inherit;
}
.pss-search-input:focus { border-color: var(--border-p); }
.pss-search-clear {
  position: absolute; right: 8px;
  background: transparent; border: none; color: var(--text-3);
  cursor: pointer; display: flex; align-items: center; padding: 2px;
  border-radius: 4px;
}
.pss-search-clear:hover { color: var(--text); }

.pss-view-toggle {
  display: flex; gap: 2px;
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 8px; padding: 3px;
}
.pss-view-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 6px;
  background: transparent; border: none;
  color: var(--text-3); cursor: pointer; transition: all 0.15s;
}
.pss-view-btn.active { background: var(--bg-2); color: var(--purple-l); }
.pss-view-btn:hover:not(.active) { color: var(--text); }

.pss-add-btn {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 7px 12px; border-radius: 8px;
  background: rgba(124,58,237,0.1); border: 1px solid var(--border-p);
  color: var(--purple-l); font-size: 12px; cursor: pointer;
  transition: all 0.15s; white-space: nowrap;
}
.pss-add-btn:hover { background: rgba(124,58,237,0.18); }

/* list view */
.pss-list { display: flex; flex-direction: column; gap: 6px; }
.pss-session-row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 8px;
  background: var(--bg-3); border: 1px solid var(--border);
  cursor: pointer; transition: all 0.15s;
}
.pss-session-row:hover { border-color: var(--border-p); background: var(--bg-2); }
.pss-session-left { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pss-session-date { font-size: 12px; font-weight: 500; color: var(--text); }
.pss-session-meta { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.pss-session-preview {
  font-size: 11px; color: var(--text-2); line-height: 1.4;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.pss-source-badge {
  font-size: 9px; font-family: var(--mono); letter-spacing: 0.06em;
  text-transform: uppercase; padding: 2px 6px; border-radius: 100px;
  flex-shrink: 0;
}
.pss-source-badge.diarization { background: rgba(124,58,237,0.15); color: var(--purple-l); }
.pss-source-badge.live { background: rgba(34,197,94,0.12); color: var(--green); }
.pss-source-badge.none { background: var(--bg-2); color: var(--text-3); }

/* search blocks */
.pss-blocks { display: flex; flex-direction: column; gap: 12px; }
.pss-block {
  border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
  background: var(--bg-3);
}
.pss-block-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border);
  background: var(--bg-2);
}
.pss-block-date { font-size: 11px; color: var(--text-2); font-weight: 500; }
.pss-block-count { font-size: 10px; color: var(--text-3); font-family: var(--mono); }
.pss-contexts { display: flex; flex-direction: column; max-height: 280px; overflow-y: auto; }
.pss-context { padding: 8px 12px; border-bottom: 1px solid var(--border); }
.pss-context:last-child { border-bottom: none; }
.pss-context-line { font-size: 12px; line-height: 1.5; }
.pss-context-line.before { color: var(--text-3); }
.pss-context-line.after  { color: var(--text-3); }
.pss-context-line.match  {
  color: var(--text); background: rgba(124,58,237,0.12);
  border-radius: 3px; padding: 0 2px;
}

/* states */
.pss-empty { font-size: 12px; color: var(--text-3); text-align: center; padding: 24px; }
.pss-loading { font-size: 12px; color: var(--text-3); padding: 12px 0; }

/* add session modal */
.pss-modal-overlay {
  position: fixed; inset: 0; z-index: 400;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center; padding: 24px;
}
.pss-modal {
  width: 100%; max-width: 560px; max-height: 80vh;
  background: var(--bg-2); border: 1px solid var(--border-p);
  border-radius: 14px; display: flex; flex-direction: column; overflow: hidden;
}
.pss-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.pss-modal-title { font-size: 14px; font-weight: 600; color: var(--text); }
.pss-modal-close {
  background: transparent; border: none; color: var(--text-3);
  cursor: pointer; display: flex; align-items: center; padding: 4px; border-radius: 5px;
}
.pss-modal-close:hover { background: var(--bg-3); color: var(--text); }
.pss-modal-body {
  flex: 1; overflow-y: auto; padding: 12px;
  display: flex; flex-direction: column; gap: 6px;
}
.pss-modal-footer { padding: 10px 18px; border-top: 1px solid var(--border); flex-shrink: 0; }
.pss-modal-hint { font-size: 11px; color: var(--text-3); }

.pss-add-row {
  display: flex; flex-direction: column;
  border-radius: 8px; background: var(--bg-3);
  border: 1px solid var(--border); overflow: hidden;
  transition: border-color 0.15s;
}
.pss-add-row:hover { border-color: var(--border-p); }
.pss-add-row-top {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; cursor: pointer;
}
.pss-add-row-left { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.pss-add-row-date { font-size: 12px; font-weight: 500; color: var(--text); }
.pss-add-row-preview {
  font-size: 11px; color: var(--text-2);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.pss-add-row-meta { font-size: 10px; color: var(--text-3); font-family: var(--mono); }
.pss-add-row-chevron {
  color: var(--text-3); flex-shrink: 0; transition: transform 0.15s;
}
.pss-add-row-chevron.open { transform: rotate(180deg); }
.pss-add-row-expanded {
  padding: 0 12px 10px; border-top: 1px solid var(--border);
  font-size: 12px; color: var(--text-2); line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  max-height: 200px; overflow-y: auto;
}
.pss-add-row-footer {
  display: flex; justify-content: flex-end; padding: 8px 12px;
  border-top: 1px solid var(--border); background: var(--bg-2);
}
.pss-add-row-action {
  background: var(--purple); color: #fff; border: none;
  padding: 5px 10px; border-radius: 6px; font-size: 11px;
  cursor: pointer; flex-shrink: 0; transition: all 0.15s;
}
.pss-add-row-action:hover { background: #6d28d9; }
.pss-add-row-action:disabled { opacity: 0.5; cursor: not-allowed; }

/* transcript modal */
.pss-tx-modal {
  width: 100%; max-width: 560px; max-height: 80vh;
  background: var(--bg-2); border: 1px solid var(--border-p);
  border-radius: 14px; display: flex; flex-direction: column; overflow: hidden;
}
.pss-tx-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.pss-tx-title { font-size: 14px; font-weight: 600; color: var(--text); }
.pss-tx-body { flex: 1; overflow-y: auto; padding: 14px 18px; display: flex; flex-direction: column; gap: 8px; }
.pss-tx-source { font-size: 10px; color: var(--text-3); font-family: var(--mono); margin-bottom: 4px; }
.pss-tx-line { font-size: 13px; color: var(--text-2); line-height: 1.6; }
`;

// ── Sub-components ────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: PodSessionItem["transcriptSource"] }) {
  return (
    <span className={`pss-source-badge ${source}`}>
      {source === "diarization" ? "diar" : source === "live" ? "live" : "—"}
    </span>
  );
}

function SessionListRow({
  session,
  onClick,
}: {
  session: PodSessionItem;
  onClick: (s: PodSessionItem) => void;
}) {
  return (
    <div className="pss-session-row" onClick={() => onClick(session)}>
      <div className="pss-session-left">
        <div className="pss-session-date">{formatDate(session.startedAt)}</div>
        <div className="pss-session-meta">
          {formatDuration(session.durationMs)} · {session.peakPeers}p
          {session.speakerCount ? ` · ${session.speakerCount} speakers` : ""}
        </div>
        {session.transcriptPreview && (
          <div className="pss-session-preview">{session.transcriptPreview}</div>
        )}
      </div>
      <SourceBadge source={session.transcriptSource} />
      <ChevronRight size={13} style={{ color: "var(--text-3)", flexShrink: 0 }} />
    </div>
  );
}

function SearchBlock({ result }: { result: PodSearchResult }) {
  return (
    <div className="pss-block">
      <div className="pss-block-header">
        <div className="pss-block-date">{formatDate(result.startedAt)}</div>
        <div className="pss-block-count">
          {result.contexts.length} {result.contexts.length === 1 ? "match" : "matches"} · {result.transcriptSource}
        </div>
      </div>
      <div className="pss-contexts">
        {result.contexts.map((ctx, i) => (
          <div key={i} className="pss-context">
            {ctx.before.map((line, j) => (
              <div key={`b${j}`} className="pss-context-line before">{line}</div>
            ))}
            <div className="pss-context-line match">{ctx.match}</div>
            {ctx.after.map((line, j) => (
              <div key={`a${j}`} className="pss-context-line after">{line}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TranscriptModal({
  session,
  onClose,
}: {
  session: PodSessionItem;
  onClose: () => void;
}) {
  return (
    <div className="pss-modal-overlay" onClick={onClose}>
      <div className="pss-tx-modal" onClick={e => e.stopPropagation()}>
        <div className="pss-tx-header">
          <div className="pss-tx-title">{formatDate(session.startedAt)}</div>
          <button className="pss-modal-close" onClick={onClose}><X size={15}/></button>
        </div>
        <div className="pss-tx-body">
          <div className="pss-tx-source">
            {session.transcriptSource} · {formatDuration(session.durationMs)} · {session.peakPeers} peers
            {session.speakerCount ? ` · ${session.speakerCount} speakers` : ""}
          </div>
          {session.transcriptPreview
            ? <div className="pss-tx-line">{session.transcriptPreview}…</div>
            : <div className="pss-tx-line" style={{ color: "var(--text-3)" }}>No transcript available.</div>
          }
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 8 }}>
            Open the session recap for the full transcript.
          </div>
        </div>
      </div>
    </div>
  );
}

function AddSessionRow({
  session,
  adding,
  onAdd,
}: {
  session: SessionForAdd;
  adding:  string | null;
  onAdd:   (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="pss-add-row">
      {/* Top row — always visible, click to expand */}
      <div className="pss-add-row-top" onClick={() => setExpanded(e => !e)}>
        <div className="pss-add-row-left">
          <div className="pss-add-row-date">
            {formatDate(session.startedAt)}
            <span style={{ color: "var(--text-3)", fontWeight: 400, marginLeft: 8 }}>
              {formatDuration(session.durationMs)}
            </span>
          </div>
          {!expanded && session.transcriptPreview && (
            <div className="pss-add-row-preview">{session.transcriptPreview}</div>
          )}
          <div className="pss-add-row-meta">
            {session.peakPeers}p
            {session.currentPodName ? ` · in "${session.currentPodName}"` : " · unassigned"}
            {session.transcriptSource !== "none" ? ` · ${session.transcriptSource}` : ""}
          </div>
        </div>
        <span className={`pss-add-row-chevron ${expanded ? "open" : ""}`}>
          <ChevronRight size={13} style={{ transform: expanded ? "rotate(90deg)" : undefined, transition: "transform 0.15s" }}/>
        </span>
      </div>

      {/* Expanded transcript preview */}
      {expanded && (
        <div className="pss-add-row-expanded">
          {session.transcriptPreview
            ? `${session.transcriptPreview}…`
            : "No transcript available for this session."
          }
        </div>
      )}

      {/* Add button — shown when expanded */}
      {expanded && (
        <div className="pss-add-row-footer">
          <button
            className="pss-add-row-action"
            onClick={(e) => { e.stopPropagation(); onAdd(session.id); }}
            disabled={adding === session.id}
          >
            {adding === session.id ? "Adding…" : "Add to pod"}
          </button>
        </div>
      )}
    </div>
  );
}

function AddSessionModal({
  podId,
  organizationId,
  onClose,
  onAdded,
}: {
  podId:          string;
  organizationId: string;
  onClose:        () => void;
  onAdded:        () => void;
}) {
  const [sessions,  setSessions]  = useState<SessionForAdd[] | null>(null);
  const [adding,    setAdding]    = useState<string | null>(null);
  const [error,     setError]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const loaded = useRef(false);
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    startTransition(async () => {
      const result = await getSessionsToAdd(organizationId, podId);
      setSessions(result);
    });
  }, [organizationId, podId]);

  const handleAdd = useCallback(async (sessionLogId: string) => {
    setAdding(sessionLogId);
    setError(null);
    const result = await addSessionToPod(organizationId, sessionLogId, podId);
    setAdding(null);
    if (!result.ok) {
      setError(result.error ?? "Failed to add session");
    } else {
      onAdded();
    }
  }, [organizationId, podId, onAdded]);

  return (
    <div className="pss-modal-overlay" onClick={onClose}>
      <div className="pss-modal" onClick={e => e.stopPropagation()}>
        <div className="pss-modal-header">
          <div className="pss-modal-title">Add session to pod</div>
          <button className="pss-modal-close" onClick={onClose}><X size={15}/></button>
        </div>
        <div className="pss-modal-body">
          {isPending && !sessions && <div className="pss-loading">Loading sessions…</div>}
          {sessions?.length === 0 && <div className="pss-empty">No other sessions to add.</div>}
          {sessions?.map(s => (
            <AddSessionRow
              key={s.id}
              session={s}
              adding={adding}
              onAdd={handleAdd}
            />
          ))}
          {error && <div style={{ fontSize: 12, color: "var(--red)" }}>{error}</div>}
        </div>
        <div className="pss-modal-footer">
          <div className="pss-modal-hint">
            Click a session to preview its transcript. Sessions from other pods will be moved here.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PodSessionsSection({
  podId,
  organizationId,
  initialSessions,
}: Props) {
  const [viewMode,        setViewMode]        = useState<ViewMode>("list");
  const [sessions,        setSessions]        = useState<PodSessionItem[]>(initialSessions);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [debouncedQuery,  setDebouncedQuery]  = useState("");
  const [searchResults,   setSearchResults]   = useState<PodSearchResult[]>([]);
  const [isSearching,     setIsSearching]     = useState(false);
  const [selectedSession, setSelectedSession] = useState<PodSessionItem | null>(null);
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [, startTransition] = useTransition();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fire search with abort controller when debounced query changes
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    setIsSearching(true);

    searchPodTranscripts(podId, organizationId, debouncedQuery.trim())
      .then(results => {
        if (controller.signal.aborted) return;
        setSearchResults(results);
        setIsSearching(false);
      })
      .catch(e => {
        if (controller.signal.aborted) return;
        console.error("[PodSessionsSection] search failed:", e);
        setIsSearching(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, podId, organizationId]);

  const handleSessionAdded = useCallback(() => {
    setShowAddModal(false);
    // Refresh session list after add — event-driven
    startTransition(async () => {
      const updated = await getPodSessions(podId, organizationId);
      setSessions(updated);
    });
  }, [podId, organizationId]);

  const showingSearch = searchQuery.trim().length > 0;

  return (
    <div className="pss-root">
      <style>{CSS}</style>

      <div className="pss-toolbar">
        <div className="pss-search-wrap">
          <span className="pss-search-icon"><Search size={13}/></span>
          <input
            className="pss-search-input"
            placeholder="Search transcripts…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="pss-search-clear" onClick={() => setSearchQuery("")}>
              <X size={12}/>
            </button>
          )}
        </div>

        {!showingSearch && (
          <div className="pss-view-toggle">
            <button
              className={`pss-view-btn ${viewMode === "list" ? "active" : ""}`}
              onClick={() => setViewMode("list")}
              title="List view"
            >
              <List size={14}/>
            </button>
            <button
              className={`pss-view-btn ${viewMode === "search" ? "active" : ""}`}
              onClick={() => setViewMode("search")}
              title="Blocks view"
            >
              <LayoutGrid size={14}/>
            </button>
          </div>
        )}

        <button className="pss-add-btn" onClick={() => setShowAddModal(true)}>
          <Plus size={13}/> Add session
        </button>
      </div>

      {/* Search results */}
      {showingSearch && (
        <>
          {isSearching && <div className="pss-loading">Searching…</div>}
          {!isSearching && searchResults.length === 0 && (
            <div className="pss-empty">No matches found.</div>
          )}
          {!isSearching && searchResults.length > 0 && (
            <div className="pss-blocks">
              {searchResults.map(r => (
                <SearchBlock key={r.sessionId} result={r} />
              ))}
            </div>
          )}
        </>
      )}

      {/* List view */}
      {!showingSearch && (
        <>
          {sessions.length === 0 && (
            <div className="pss-empty">No sessions in this pod yet.</div>
          )}
          <div className="pss-list">
            {sessions.map(s => (
              <SessionListRow key={s.id} session={s} onClick={setSelectedSession} />
            ))}
          </div>
        </>
      )}

      {selectedSession && (
        <TranscriptModal session={selectedSession} onClose={() => setSelectedSession(null)} />
      )}

      {showAddModal && (
        <AddSessionModal
          podId={podId}
          organizationId={organizationId}
          onClose={() => setShowAddModal(false)}
          onAdded={handleSessionAdded}
        />
      )}
    </div>
  );
}