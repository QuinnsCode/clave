"use client";
// src/app/components/qollab/QollabDocs.tsx
// Document list panel — shows all docs, opens editor on click.
// Thin component, all state from useQollabDocs.

import { useState } from "react";
import { FilePlus, FileText, Trash2, Edit3, X } from "lucide-react";
import type { UseQollabDocsReturn } from "@/app/hooks/qollab/useQollabDocs";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  docs:    UseQollabDocsReturn;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
.qdocs-panel {
  display: flex; flex-direction: column; height: 100%;
  background: #0d0d1a; font-family: 'DM Sans', sans-serif;
  border-right: 1px solid rgba(255,255,255,0.06);
  width: 240px; flex-shrink: 0;
}

.qdocs-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}
.qdocs-header-title {
  font-size: 12px; font-weight: 600; color: #918caa;
  font-family: 'DM Mono', monospace; text-transform: uppercase;
  letter-spacing: 0.08em;
}
.qdocs-header-actions { display: flex; gap: 4px; }
.qdocs-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 6px;
  background: transparent; border: none; color: #4a4660;
  cursor: pointer; transition: all 0.15s;
}
.qdocs-icon-btn:hover { background: rgba(255,255,255,0.06); color: #ece8f8; }
.qdocs-icon-btn.primary:hover { background: rgba(124,58,237,0.15); color: #a78bfa; }
.qdocs-icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

.qdocs-list { flex: 1; overflow-y: auto; padding: 8px; }

.qdocs-empty {
  padding: 32px 16px; text-align: center;
  font-size: 13px; color: #4a4660; line-height: 1.6;
}
.qdocs-empty-hint {
  font-size: 11px; color: #4a4660; margin-top: 6px;
  font-family: 'DM Mono', monospace;
}

.qdocs-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 10px; border-radius: 8px;
  cursor: pointer; transition: background 0.12s;
  margin-bottom: 2px; group: true;
  border: 1px solid transparent;
}
.qdocs-item:hover { background: rgba(255,255,255,0.04); }
.qdocs-item.active {
  background: rgba(124,58,237,0.12);
  border-color: rgba(124,58,237,0.2);
}
.qdocs-item-icon { color: #4a4660; flex-shrink: 0; transition: color 0.12s; }
.qdocs-item.active .qdocs-item-icon { color: #a78bfa; }
.qdocs-item-info { flex: 1; min-width: 0; }
.qdocs-item-name {
  font-size: 13px; color: #ece8f8; font-weight: 500;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.qdocs-item.active .qdocs-item-name { color: #a78bfa; }
.qdocs-item-meta {
  font-size: 10px; color: #4a4660;
  font-family: 'DM Mono', monospace; margin-top: 1px;
}
.qdocs-item-actions {
  display: flex; gap: 2px; opacity: 0; transition: opacity 0.12s;
}
.qdocs-item:hover .qdocs-item-actions { opacity: 1; }
.qdocs-item-btn {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 5px;
  background: transparent; border: none; color: #4a4660;
  cursor: pointer; transition: all 0.12s;
}
.qdocs-item-btn:hover { background: rgba(255,255,255,0.08); color: #ece8f8; }
.qdocs-item-btn.danger:hover { background: rgba(248,113,113,0.1); color: #f87171; }

/* Rename input */
.qdocs-rename-input {
  flex: 1; background: rgba(255,255,255,0.08);
  border: 1px solid rgba(124,58,237,0.35); border-radius: 5px;
  color: #ece8f8; font-size: 13px; font-family: inherit;
  padding: 2px 6px; outline: none; min-width: 0;
}

/* Cap indicator */
.qdocs-cap {
  padding: 4px 12px; font-size: 11px; color: #4a4660;
  font-family: 'DM Mono', monospace; text-align: center;
  border-top: 1px solid rgba(255,255,255,0.04); flex-shrink: 0;
  padding: 8px 12px;
}
.qdocs-cap span { color: #7c3aed; }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function QollabDocs({ docs, onClose }: Props) {
  const [renamingId,    setRenamingId]    = useState<string | null>(null);
  const [renameValue,   setRenameValue]   = useState("");
  const [creatingTitle, setCreatingTitle] = useState(false);
  const [newTitle,      setNewTitle]      = useState("");

  const atCap = docs.docs.length >= 10;

  async function handleCreate() {
    if (creatingTitle) {
      if (newTitle.trim()) {
        const id = await docs.createNewDoc(newTitle.trim());
        if (id) docs.openDoc(id);
      }
      setCreatingTitle(false);
      setNewTitle("");
    } else {
      setCreatingTitle(true);
      setNewTitle("");
    }
  }

  function handleRenameStart(id: string, current: string) {
    setRenamingId(id);
    setRenameValue(current);
  }

  function handleRenameCommit() {
    if (renamingId && renameValue.trim()) {
      docs.renameDocument(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this document?")) return;
    docs.deleteDocument(id);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="qdocs-panel">

        {/* Header */}
        <div className="qdocs-header">
          <span className="qdocs-header-title">Docs</span>
          <div className="qdocs-header-actions">
            {docs.canCreate && (
              <button
                className="qdocs-icon-btn primary"
                onClick={handleCreate}
                disabled={atCap && !creatingTitle}
                title={atCap ? "Max 10 docs reached" : "New document"}
              >
                <FilePlus size={14} />
              </button>
            )}
            <button className="qdocs-icon-btn" onClick={onClose} title="Close docs">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="qdocs-list">

          {/* New doc title input */}
          {creatingTitle && (
            <div style={{ padding: "6px 4px 8px" }}>
              <input
                className="qdocs-rename-input"
                style={{ width: "100%", boxSizing: "border-box" }}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onBlur={handleCreate}
                onKeyDown={e => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") { setCreatingTitle(false); setNewTitle(""); }
                }}
                placeholder="Document title…"
                autoFocus
              />
            </div>
          )}

          {docs.docs.length === 0 && !creatingTitle && (
            <div className="qdocs-empty">
              No documents yet
              {docs.canCreate && (
                <div className="qdocs-empty-hint">
                  Click + to create one
                </div>
              )}
            </div>
          )}

          {docs.docs.map(doc => (
            <div
              key={doc.id}
              className={`qdocs-item ${docs.activeDocId === doc.id ? "active" : ""}`}
              onClick={() => docs.openDoc(doc.id)}
            >
              <FileText size={14} className="qdocs-item-icon" />

              <div className="qdocs-item-info">
                {renamingId === doc.id ? (
                  <input
                    className="qdocs-rename-input"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={handleRenameCommit}
                    onKeyDown={e => {
                      if (e.key === "Enter") handleRenameCommit();
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <>
                    <div className="qdocs-item-name">{doc.title}</div>
                    <div className="qdocs-item-meta">{formatTs(doc.updatedAt)}</div>
                  </>
                )}
              </div>

              <div className="qdocs-item-actions">
                {docs.canEdit && (
                  <button
                    className="qdocs-item-btn"
                    onClick={e => { e.stopPropagation(); handleRenameStart(doc.id, doc.title); }}
                    title="Rename"
                  >
                    <Edit3 size={11} />
                  </button>
                )}
                {docs.canDelete && (
                  <button
                    className="qdocs-item-btn danger"
                    onClick={e => handleDelete(e, doc.id)}
                    title="Delete"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Cap indicator */}
        <div className="qdocs-cap">
          <span>{docs.docs.length}</span> / 10 docs
        </div>

      </div>
    </>
  );
}