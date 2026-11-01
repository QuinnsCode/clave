"use client";
// src/app/components/pods/DeletePodModal.tsx
//
// Two-step type-to-confirm delete. Step 1: user types the pod's name to
// enable the delete button. Step 2: clicks delete → cascade fires →
// onDeleted() callback fires.
//
// CHANGED (R1.5 anchors revision) — uses onDeleted callback instead of
// reloading directly. Parent (PodDetailView / PodDetailModal / PodCard chain)
// decides what to do — typically window.location.reload().

import { useState, useTransition } from "react";
import { X, AlertTriangle } from "lucide-react";
import { deletePod } from "@/app/serverActions/pods/deletePod";

interface Props {
  podId:        string;
  podName:      string;
  sessionCount: number;
  onClose:      () => void;
  onDeleted?:   () => void;
}

const CSS = `
.dpm-overlay {
  position: fixed; inset: 0; z-index: 310;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.dpm-card {
  background: var(--bg-2);
  border: 1px solid rgba(248,113,113,0.3);
  border-radius: 12px;
  width: 100%;
  max-width: 440px;
  padding: 22px;
  display: flex; flex-direction: column; gap: 14px;
}
.dpm-head {
  display: flex; align-items: center; justify-content: space-between;
}
.dpm-title {
  font-size: 15px; font-weight: 600; color: var(--text);
  display: inline-flex; align-items: center; gap: 8px;
}
.dpm-title svg { color: var(--red, #f87171); }
.dpm-close {
  background: transparent; border: none; color: var(--text-3);
  cursor: pointer; padding: 4px; border-radius: 5px;
  display: inline-flex; align-items: center;
}
.dpm-close:hover { background: var(--bg-3); color: var(--text); }

.dpm-warn {
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.2);
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.5;
}
.dpm-warn strong { color: var(--text); font-weight: 600; }

.dpm-prompt { font-size: 12px; color: var(--text-3); }
.dpm-prompt code {
  background: var(--bg-3);
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--text);
  font-family: var(--mono);
}

.dpm-input {
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  outline: none;
  width: 100%;
  font-family: var(--mono);
}
.dpm-input:focus { border-color: var(--red, #f87171); }

.dpm-actions { display: flex; gap: 8px; justify-content: flex-end; }
.dpm-cancel {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-2); padding: 7px 14px; border-radius: 7px;
  font-size: 13px; cursor: pointer;
}
.dpm-cancel:hover { background: var(--bg-3); color: var(--text); }
.dpm-delete {
  background: var(--red, #f87171);
  color: #1a0a0a;
  border: none;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 600;
}
.dpm-delete:hover { background: #ef4444; }
.dpm-delete:disabled { opacity: 0.4; cursor: not-allowed; }

.dpm-error { font-size: 12px; color: var(--red, #f87171); }
`;

export default function DeletePodModal({
  podId, podName, sessionCount, onClose, onDeleted,
}: Props) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const matches = typed.trim() === podName.trim();

  function submit() {
    if (!matches) return;
    setError(null);
    startTransition(async () => {
      const result = await deletePod(podId);
      if (!result.ok) {
        setError(result.error ?? "Delete failed");
        return;
      }
      if (onDeleted) {
        onDeleted();
      } else {
        // Fallback if no callback provided — reload.
        window.location.reload();
      }
    });
  }

  return (
    <div className="dpm-overlay" onClick={onClose}>
      <style>{CSS}</style>
      <div className="dpm-card" onClick={e => e.stopPropagation()}>

        <div className="dpm-head">
          <div className="dpm-title">
            <AlertTriangle size={15}/> Delete pod
          </div>
          <button className="dpm-close" onClick={onClose}><X size={15}/></button>
        </div>

        <div className="dpm-warn">
          This will permanently delete <strong>{podName}</strong> and all{" "}
          <strong>{sessionCount} {sessionCount === 1 ? "session" : "sessions"}</strong>{" "}
          inside it — including transcripts, diarizations, and edit history. This cannot be undone.
        </div>

        <div className="dpm-prompt">
          Type <code>{podName}</code> to confirm.
        </div>

        <input
          className="dpm-input"
          autoFocus
          value={typed}
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && matches) { e.preventDefault(); submit(); }
            if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
          placeholder={podName}
          disabled={isPending}
        />

        {error && <div className="dpm-error">{error}</div>}

        <div className="dpm-actions">
          <button className="dpm-cancel" onClick={onClose} disabled={isPending}>
            Cancel
          </button>
          <button
            className="dpm-delete"
            onClick={submit}
            disabled={!matches || isPending}
          >
            {isPending ? "Deleting…" : "Delete pod"}
          </button>
        </div>

      </div>
    </div>
  );
}