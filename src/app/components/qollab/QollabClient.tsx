"use client";
// src/app/components/qollab/QollabClient.tsx
// Client boundary — composes all hooks and components.
// Receives initial state from RSC QollabPage.

import { useState, useEffect } from "react";
import { PenLine, FileText, X } from "lucide-react";
import { useQollabWs }   from "@/app/hooks/qollab/useQollabWs";
import { useToolbar }    from "@/app/hooks/qollab/useToolbar";
import { useWhiteboard } from "@/app/hooks/qollab/useWhiteboard";
import { useQollabDocs } from "@/app/hooks/qollab/useQollabDocs";
import { initPeerCaps }  from "@/app/serverActions/qollab/caps";
import QollabWhiteboard  from "./QollabWhiteboard";
import QollabDocs        from "./QollabDocs";
import QollabDocEditor   from "./QollabDocEditor";
import type { WbObject, DocMeta } from "@/durableObjects/qollabWhiteboardDO";
import type { Capability } from "@/lib/qollab/capabilities";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  sessionId:      string;
  peerId:         string;
  userId:         string | null;
  orgId:          string;
  isOwner:        boolean;
  isFounder:      boolean;
  initialObjects: WbObject[];
  initialDocs:    DocMeta[];
  initialCaps:    Capability[];
  initialLocked: boolean;
}

type Panel = "whiteboard" | "docs" | null;

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
.qollab-root {
  position: fixed; inset: 0; z-index: 100;
  display: flex; flex-direction: column;
  background: #080810; font-family: 'DM Sans', sans-serif;
}

/* ── Top bar ── */
.qollab-topbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(8,8,16,0.95); backdrop-filter: blur(12px);
  flex-shrink: 0; z-index: 20;
}
.qollab-topbar-title {
  font-size: 13px; font-weight: 600; color: #918caa;
  font-family: 'DM Mono', monospace; letter-spacing: 0.06em;
  margin-right: 4px;
}
.qollab-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 12px; border-radius: 8px; border: none;
  background: transparent; color: #918caa; font-size: 13px;
  cursor: pointer; transition: all 0.15s; font-family: inherit;
}
.qollab-tab:hover { background: rgba(255,255,255,0.06); color: #ece8f8; }
.qollab-tab.active {
  background: rgba(124,58,237,0.15);
  border: 1px solid rgba(124,58,237,0.25);
  color: #a78bfa;
}
.qollab-close {
  margin-left: auto; display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: transparent; color: #4a4660; cursor: pointer; transition: all 0.15s;
}
.qollab-close:hover { background: rgba(248,113,113,0.1); color: #f87171; }

/* ── Connection status ── */
.qollab-status {
  display: flex; align-items: center; gap: 5px;
  font-size: 11px; color: #4a4660; font-family: 'DM Mono', monospace;
  margin-left: 8px;
}
.qollab-status-dot {
  width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  transition: background 0.3s;
}
.qollab-status-dot.connected    { background: #22c55e; box-shadow: 0 0 6px #22c55e; }
.qollab-status-dot.disconnected { background: #4a4660; }

/* ── Body ── */
.qollab-body {
  flex: 1; display: flex; min-height: 0; position: relative;
}

/* ── Whiteboard fills remaining space ── */
.qollab-wb-wrap {
  flex: 1; position: relative; min-width: 0; min-height: 0;
}

/* ── Docs panel slides in from left ── */
.qollab-docs-wrap {
  display: flex; height: 100%; border-right: 1px solid rgba(255,255,255,0.06);
  animation: qdocsIn 0.18s ease;
}
@keyframes qdocsIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }

/* ── Doc editor overlays whiteboard ── */
.qollab-editor-wrap {
  position: absolute; inset: 0; z-index: 10;
  animation: qeditorIn 0.18s ease;
}
@keyframes qeditorIn { from { opacity: 0; } to { opacity: 1; } }

/* ── Loading ── */
.qollab-loading {
  flex: 1; display: flex; align-items: center; justify-content: center;
  font-size: 13px; color: #4a4660; font-family: 'DM Mono', monospace;
  gap: 8px;
}
.qollab-spinner {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid rgba(124,58,237,0.2);
  border-top-color: #7c3aed;
  animation: qspin 0.7s linear infinite;
}
.qollab-locked-badge {
  font-size: 11px; font-family: 'DM Mono', monospace;
  background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2);
  color: #fbbf24; border-radius: 6px; padding: 3px 8px;
  letter-spacing: 0.06em;
}
@keyframes qspin { to { transform: rotate(360deg); } }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function QollabClient({
  sessionId,
  peerId,
  userId,
  orgId,
  isOwner,
  isFounder,
  initialObjects,
  initialDocs,
  initialCaps,
  initialLocked,
}: Props) {
  const [panel,     setPanel]     = useState<Panel>("whiteboard");
  const [caps,      setCaps]      = useState<Capability[]>(initialCaps);
  const [capsReady, setCapsReady] = useState(initialCaps.length > 0);
  const [isLocked, setIsLocked] = useState(initialLocked);

  // ── WS ──────────────────────────────────────────────────────────────────────

  const ws = useQollabWs({ sessionId, peerId, enabled: true });

  // ── Init caps on mount if not pre-resolved ────────────────────────────────

  useEffect(() => {
    if (capsReady) return;
    initPeerCaps(sessionId, peerId, userId, orgId, isFounder, isOwner)
      .then(resolved => { setCaps(resolved); setCapsReady(true); })
      .catch(() => setCapsReady(true));
  }, []);

  // Listen for cap updates from DO
  useEffect(() => {
    return ws.onMessage(msg => {
      if (msg.type === "caps:updated") setCaps(msg.caps);
      if (msg.type === "session:locked") {
        setIsLocked(true);
        setCaps([]); // strip all caps — read only
      }
      if (msg.type === "init" && msg.locked) {
        setIsLocked(true);
        setCaps([]);
      }
    });
  }, [ws]);

  // ── Hooks ─────────────────────────────────────────────────────────────────

  const toolbar = useToolbar();

  const wb = useWhiteboard({
    sessionId, peerId, caps, ws, toolbar,
    initialObjects,
  });

  const docs = useQollabDocs({
    sessionId, peerId, caps, ws,
    initialDocs,
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleClose() {
    // If opened as a new window from a session, go back to the session
    // window.opener exists if this window was opened by another window
    if (window.opener && !window.opener.closed) {
      window.close();
    } else {
      // Opened directly or opener is gone — go to dashboard
      window.location.href = "/dashboard";
    }
  }

  function toggleDocs() {
    setPanel(p => p === "docs" ? "whiteboard" : "docs");
    // Close editor if switching away from docs
    if (panel === "docs") docs.closeDoc();
  }

  if (!capsReady) {
    return (
      <>
        <style>{CSS}</style>
        <div className="qollab-root">
          <div className="qollab-loading">
            <div className="qollab-spinner" />
            Joining session…
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="qollab-root">

        {/* Top bar */}
        <div className="qollab-topbar">
          <span className="qollab-topbar-title">Qollab</span>
          {isLocked && (
            <span style={{
                fontSize: 11, fontFamily: "var(--mono)",
                background: "rgba(251,191,36,0.1)",
                border: "1px solid rgba(251,191,36,0.2)",
                color: "#fbbf24", borderRadius: 6,
                padding: "3px 8px", letterSpacing: "0.06em",
            }}>
                session ended — read only
            </span>
          )}
          <button
            className={`qollab-tab ${panel === "whiteboard" ? "active" : ""}`}
            onClick={() => setPanel("whiteboard")}
          >
            <PenLine size={13} />
            Whiteboard
          </button>

          <button
            className={`qollab-tab ${panel === "docs" ? "active" : ""}`}
            onClick={toggleDocs}
          >
            <FileText size={13} />
            Docs
            {docs.docs.length > 0 && (
              <span style={{
                fontSize: 10, background: "rgba(124,58,237,0.25)",
                color: "#a78bfa", borderRadius: 100,
                padding: "1px 6px", fontFamily: "var(--mono)",
              }}>
                {docs.docs.length}
              </span>
            )}
          </button>

          <div className="qollab-status">
            <div className={`qollab-status-dot ${ws.connected ? "connected" : "disconnected"}`} />
            {ws.connected ? "live" : "reconnecting…"}
          </div>

          <button className="qollab-close" onClick={handleClose} title="Close">
            <X size={15} />
          </button> 
        </div>

        {/* Body */}
        <div className="qollab-body">

          {/* Docs sidebar */}
          {panel === "docs" && (
            <div className="qollab-docs-wrap">
              <QollabDocs
                docs={docs}
                onClose={() => setPanel("whiteboard")}
              />
            </div>
          )}

          {/* Whiteboard — always mounted, hidden behind editor */}
          <div className="qollab-wb-wrap">
            <QollabWhiteboard wb={wb} toolbar={toolbar} caps={caps} />

            {/* Doc editor overlays when a doc is open */}
            {docs.activeDoc && (
              <div className="qollab-editor-wrap">
                <QollabDocEditor
                  doc={docs.activeDoc}
                  peerId={peerId}
                  canEdit={docs.canEdit}
                  onChange={content => docs.saveDoc(docs.activeDoc!.id, content)}
                  onRename={title  => docs.renameDocument(docs.activeDoc!.id, title)}
                  onClose={docs.closeDoc}
                />
              </div>
            )}
          </div>

        </div>

      </div>
    </>
  );
}