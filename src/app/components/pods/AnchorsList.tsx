"use client";
// src/app/components/pods/AnchorsList.tsx
//
// Client leaf. Anchors UI inside the pod detail view. Renders:
//   - Add input + button (Enter key submits)
//   - List of anchors, each with delete (x) icon
//   - Empty state when no anchors yet
//
// State management: receives initial anchors as prop, mutates local list
// optimistically, reconciles with server response. No reload — keeps modal
// state intact.

import { useState, useTransition } from "react";
import { Anchor as AnchorIcon, X, Plus } from "lucide-react";
import type { AnchorItem } from "@/lib/pods/podsService";
import { createAnchor } from "@/app/serverActions/pods/createAnchor";
import { deleteAnchor } from "@/app/serverActions/pods/deleteAnchor";

interface Props {
  podId:          string;
  initialAnchors: AnchorItem[];
}

const CSS = `
.al-root { display: flex; flex-direction: column; gap: 10px; }

.al-add-row {
  display: flex; gap: 8px; align-items: stretch;
}
.al-input {
  flex: 1;
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 7px 10px;
  border-radius: 7px;
  font-size: 13px;
  outline: none;
}
.al-input:focus { border-color: var(--purple); }
.al-input::placeholder { color: var(--text-3); }

.al-add-btn {
  background: var(--purple);
  color: #fff;
  border: none;
  padding: 0 12px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  font-weight: 500;
}
.al-add-btn:hover { background: #6d28d9; }
.al-add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.al-error {
  font-size: 11px; color: var(--red, #f87171);
  padding: 0 2px;
}

.al-list { display: flex; flex-direction: column; gap: 4px; }

.al-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px 6px 10px;
}
.al-item-left {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: var(--text);
  word-break: break-word;
  min-width: 0;
  flex: 1;
}
.al-item-left svg { color: var(--text-3); flex-shrink: 0; }
.al-item-text { min-width: 0; overflow-wrap: anywhere; }
.al-del {
  background: transparent; border: none; padding: 4px;
  color: var(--text-3); cursor: pointer; border-radius: 4px;
  display: inline-flex; align-items: center;
}
.al-del:hover { background: rgba(248,113,113,0.1); color: var(--red, #f87171); }

.al-empty {
  font-size: 12px; color: var(--text-3);
  padding: 8px 4px; text-align: left;
  font-style: italic;
}
`;

export default function AnchorsList({ podId, initialAnchors }: Props) {
  const [anchors, setAnchors] = useState<AnchorItem[]>(initialAnchors);
  const [draft, setDraft]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function addAnchor() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed.length > 64) {
      setError("too long (max 64 chars)");
      return;
    }
    if (anchors.some(a => a.canonical === trimmed)) {
      setError("already added");
      return;
    }

    setError(null);
    setDraft("");

    // Optimistic — show immediately with a placeholder id; reconcile on server response.
    const optimistic: AnchorItem = {
      id:        `tmp_${Date.now()}`,
      canonical: trimmed,
      createdAt: new Date(),
    };
    setAnchors(prev => [...prev, optimistic]);

    startTransition(async () => {
      const result = await createAnchor(podId, trimmed);
      if (!result.ok) {
        // Roll back the optimistic insert
        setAnchors(prev => prev.filter(a => a.id !== optimistic.id));
        setError(result.error ?? "could not add anchor");
        setDraft(trimmed);   // restore input so user can retry
        return;
      }
      // Replace temp row with real one from server
      if (result.data) {
        const real = result.data;
        setAnchors(prev => prev.map(a => a.id === optimistic.id ? real : a));
      }
    });
  }

  function removeAnchor(anchor: AnchorItem) {
    setError(null);
    const previous = anchors;
    setAnchors(prev => prev.filter(a => a.id !== anchor.id));

    startTransition(async () => {
      const result = await deleteAnchor(anchor.id);
      if (!result.ok) {
        setAnchors(previous);
        setError(result.error ?? "could not remove anchor");
      }
    });
  }

  return (
    <div className="al-root">
      <style>{CSS}</style>

      <div className="al-add-row">
        <input
          className="al-input"
          placeholder="Add an anchor (e.g. Kelly, K'Ynian, GraphQL)"
          value={draft}
          onChange={e => { setDraft(e.target.value); if (error) setError(null); }}
          onKeyDown={e => {
            if (e.key === "Enter") { e.preventDefault(); addAnchor(); }
          }}
          maxLength={64}
          disabled={isPending}
        />
        <button
          className="al-add-btn"
          onClick={addAnchor}
          disabled={isPending || !draft.trim()}
        >
          <Plus size={13}/> Add
        </button>
      </div>

      {error && <div className="al-error">{error}</div>}

      {anchors.length === 0 ? (
        <div className="al-empty">
          No anchors yet. Add words this Pod should always hear correctly.
        </div>
      ) : (
        <div className="al-list">
          {anchors.map(anchor => (
            <div key={anchor.id} className="al-item">
              <div className="al-item-left">
                <AnchorIcon size={11}/>
                <span className="al-item-text">{anchor.canonical}</span>
              </div>
              <button
                className="al-del"
                onClick={() => removeAnchor(anchor)}
                disabled={isPending}
                title="Remove anchor"
              >
                <X size={12}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}