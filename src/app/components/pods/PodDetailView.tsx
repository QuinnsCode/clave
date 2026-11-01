"use client";
// src/app/components/pods/PodDetailView.tsx
//
// Pod detail content. Renders inside PodDetailModal and /pods/:slug page.
// Accepts initialSessions pre-loaded server-side — no client fetch on mount.
//
// CHANGED — sessions section now renders PodSessionsSection (list + search)
// instead of the old "coming soon" stub.

import { useState, useTransition } from "react";
import { Pencil, Trash2, Check, Layers } from "lucide-react";
import type { PodListItem } from "@/lib/pods/podsService";
import type { PodSessionItem } from "@/lib/pods/podSessionsService";
import { renamePod } from "@/app/serverActions/pods/renamePod";
import AnchorsList from "@/app/components/pods/AnchorsList";
import DeletePodModal from "@/app/components/pods/DeletePodModal";
import PodSessionsSection from "@/app/components/pods/PodSessionsSection";

interface Props {
  pod:             PodListItem;
  organizationId:  string;
  initialSessions: PodSessionItem[];
  onPodMutated?:   (next: { name?: string }) => void;
  onPodDeleted?:   () => void;
}

const CSS = `
.pdv-root { display: flex; flex-direction: column; gap: 18px; }

.pdv-head { display: flex; align-items: center; gap: 8px; }
.pdv-name {
  font-size: 18px; font-weight: 600; color: var(--text);
  cursor: text; flex: 1; word-break: break-word;
}
.pdv-name:hover { color: var(--purple-l); }
.pdv-name-input {
  flex: 1; font-size: 18px; font-weight: 600;
  background: var(--bg-3); border: 1px solid var(--purple);
  color: var(--text); padding: 5px 10px; border-radius: 6px;
  outline: none; font-family: inherit;
}
.pdv-iconbtn {
  background: transparent; border: none; padding: 4px;
  color: var(--text-3); cursor: pointer; border-radius: 5px;
  display: inline-flex; align-items: center;
}
.pdv-iconbtn:hover { background: var(--bg-3); color: var(--text); }
.pdv-error { font-size: 11px; color: var(--red, #f87171); }

.pdv-section { display: flex; flex-direction: column; gap: 8px; }
.pdv-section-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-3); font-family: var(--mono);
  display: flex; align-items: center; gap: 6px;
}

.pdv-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 8px; border-top: 1px solid var(--border);
}
.pdv-meta { font-size: 10px; color: var(--text-3); font-family: var(--mono); }
.pdv-delete-btn {
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.2);
  color: var(--red, #f87171);
  padding: 6px 12px; border-radius: 7px;
  font-size: 12px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px; font-weight: 500;
}
.pdv-delete-btn:hover { background: rgba(248,113,113,0.15); }
`;

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PodDetailView({
  pod,
  organizationId,
  initialSessions,
  onPodMutated,
  onPodDeleted,
}: Props) {
  const [name,       setName]       = useState(pod.name);
  const [isEditing,  setIsEditing]  = useState(false);
  const [draft,      setDraft]      = useState(pod.name);
  const [error,      setError]      = useState<string | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [isPending,  startTransition] = useTransition();

  function startEdit() { setDraft(name); setIsEditing(true); setError(null); }
  function cancelEdit() { setDraft(name); setIsEditing(false); setError(null); }

  async function submitEdit() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === name) { cancelEdit(); return; }
    setIsEditing(false);
    const previous = name;
    setName(trimmed);
    startTransition(async () => {
      const result = await renamePod(pod.id, trimmed);
      if (!result.ok) {
        setName(previous);
        setError(result.error ?? "rename failed");
      } else if (result.data) {
        setName(result.data.name);
        onPodMutated?.({ name: result.data.name });
      }
    });
  }

  return (
    <div className="pdv-root">
      <style>{CSS}</style>

      {/* Header: inline rename */}
      <div className="pdv-head">
        {isEditing ? (
          <input
            className="pdv-name-input"
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={submitEdit}
            onKeyDown={e => {
              if (e.key === "Enter")  { e.preventDefault(); submitEdit(); }
              if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
            }}
            maxLength={64}
          />
        ) : (
          <>
            <div className="pdv-name" onClick={startEdit} title="Click to rename">{name}</div>
            <button className="pdv-iconbtn" onClick={startEdit} title="Rename"><Pencil size={13}/></button>
          </>
        )}
        {isEditing && (
          <button className="pdv-iconbtn" onClick={submitEdit} title="Save"><Check size={14}/></button>
        )}
      </div>

      {error && <div className="pdv-error">{error}</div>}

      {/* Anchors */}
      <div className="pdv-section">
        <div className="pdv-section-title">
          <Layers size={10}/> Anchors — words this Pod always hears correctly
        </div>
        <AnchorsList podId={pod.id} initialAnchors={pod.anchors} />
      </div>

      {/* Sessions — list + search */}
      <div className="pdv-section">
        <div className="pdv-section-title">Sessions</div>
        <PodSessionsSection
          podId={pod.id}
          organizationId={organizationId}
          initialSessions={initialSessions}
        />
      </div>

      {/* Footer */}
      <div className="pdv-footer">
        <div className="pdv-meta">Created {formatDate(pod.createdAt)}</div>
        <button
          className="pdv-delete-btn"
          onClick={() => setShowDelete(true)}
          disabled={isPending}
        >
          <Trash2 size={12}/> Delete pod
        </button>
      </div>

      {showDelete && (
        <DeletePodModal
          podId={pod.id}
          podName={name}
          sessionCount={pod.sessionCount}
          onClose={() => setShowDelete(false)}
          onDeleted={() => { setShowDelete(false); onPodDeleted?.(); }}
        />
      )}
    </div>
  );
}