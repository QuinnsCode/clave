"use client";
// src/app/components/qollab/QollabWhiteboard.tsx
// Thin canvas component — just renders from useWhiteboard + useToolbar.
// All logic lives in hooks.

import { useEffect, useCallback } from "react";
import QollabToolbar from "./QollabToolbar";
import type { UseWhiteboardReturn, WORLD_SIZE } from "@/app/hooks/qollab/useWhiteboard";
import { WORLD_SIZE as WS, VIEW_SIZE } from "@/app/hooks/qollab/useWhiteboard";
import type { UseToolbarReturn } from "@/app/hooks/qollab/useToolbar";
import type { Capability } from "@/lib/qollab/capabilities";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  wb:      UseWhiteboardReturn;
  toolbar: UseToolbarReturn;
  caps:    Capability[];
}

// ── Quadrant nav ──────────────────────────────────────────────────────────────

const QUADRANTS = [
  { id: "tl", label: "↖", x: 0,        y: 0,        title: "Top Left"     },
  { id: "tr", label: "↗", x: VIEW_SIZE, y: 0,        title: "Top Right"    },
  { id: "bl", label: "↙", x: 0,        y: VIEW_SIZE, title: "Bottom Left"  },
  { id: "br", label: "↘", x: VIEW_SIZE, y: VIEW_SIZE, title: "Bottom Right" },
];

const CSS = `
.wb-root {
  position: relative; width: 100%; height: 100%;
  background: #080810; overflow: hidden;
  font-family: 'DM Sans', sans-serif;
}

/* ── Canvas wrap ── */
.wb-canvas-wrap {
  position: absolute; inset: 0;
}
.wb-canvas-wrap.mode-draw  { cursor: crosshair; }
.wb-canvas-wrap.mode-pan   { cursor: grab; }
.wb-canvas-wrap.mode-pan.panning { cursor: grabbing; }
.wb-canvas { display: block; width: 100%; height: 100%; }

/* ── Grid background ── */
.wb-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* ── Quadrant nav ── */
.wb-quadrants {
  position: absolute; bottom: 20px; right: 20px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 4px;
  z-index: 10;
}
.wb-quad-btn {
  width: 28px; height: 28px; border-radius: 6px;
  background: rgba(13,13,26,0.9); border: 1px solid rgba(255,255,255,0.08);
  color: #4a4660; font-size: 13px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s; backdrop-filter: blur(8px);
}
.wb-quad-btn:hover { background: rgba(124,58,237,0.15); color: #a78bfa; border-color: rgba(124,58,237,0.25); }
.wb-quad-btn.active { background: rgba(124,58,237,0.2); color: #a78bfa; border-color: rgba(124,58,237,0.35); }

/* ── Viewport indicator ── */
.wb-viewport-info {
  position: absolute; bottom: 20px; left: 20px;
  font-family: 'DM Mono', monospace; font-size: 10px; color: #4a4660;
  background: rgba(13,13,26,0.8); border: 1px solid rgba(255,255,255,0.06);
  padding: 4px 8px; border-radius: 6px; backdrop-filter: blur(8px);
  pointer-events: none; z-index: 10;
}

/* ── Mobile mode toggle ── */
.wb-mode-toggle {
  position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
  display: none; align-items: center; gap: 2px;
  background: rgba(13,13,26,0.95); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px; padding: 4px; backdrop-filter: blur(12px);
  z-index: 10;
}
.wb-mode-btn {
  padding: 6px 14px; border-radius: 7px; border: none; cursor: pointer;
  font-size: 12px; font-family: 'DM Sans', sans-serif; transition: all 0.15s;
  background: transparent; color: #918caa;
}
.wb-mode-btn.active { background: rgba(124,58,237,0.2); color: #a78bfa; }

/* ── No caps notice ── */
.wb-readonly {
  position: absolute; top: 70px; left: 50%; transform: translateX(-50%);
  font-size: 11px; color: #4a4660; font-family: 'DM Mono', monospace;
  background: rgba(13,13,26,0.8); border: 1px solid rgba(255,255,255,0.06);
  padding: 4px 10px; border-radius: 6px; pointer-events: none; z-index: 10;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .wb-mode-toggle { display: flex; }
  .wb-viewport-info { display: none; }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function QollabWhiteboard({ wb, toolbar, caps }: Props) {
  const canDraw    = caps.includes("wb:draw");
  const activeQuad = QUADRANTS.find(
    q => wb.viewport.x === q.x && wb.viewport.y === q.y
  );

  // Spacebar → toggle pan mode
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault();
        toolbar.setMode("pan");
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        toolbar.setMode("draw");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup",   onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup",   onKeyUp);
    };
  }, [toolbar]);

  // Prevent browser default on drag over
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const isPanning = toolbar.mode === "pan";

  return (
    <>
      <style>{CSS}</style>
      <div className="wb-root">

        {/* Dotted grid background */}
        <div className="wb-grid" style={{
          backgroundPosition: `${-wb.viewport.x % 40}px ${-wb.viewport.y % 40}px`,
        }} />

        {/* Canvas */}
        <div
          ref={wb.wrapRef}
          className={`wb-canvas-wrap mode-${toolbar.mode}${isPanning && wb.isDrawing ? " panning" : ""}`}
          onPointerDown={wb.onPointerDown}
          onPointerMove={wb.onPointerMove}
          onPointerUp={wb.onPointerUp}
          onWheel={wb.onWheel}
          onPaste={wb.onPaste}
          onDrop={wb.onDrop}
          onDragOver={onDragOver}
          tabIndex={0}
          style={{ outline: "none" }}
        >
          <canvas ref={wb.canvasRef} className="wb-canvas" />
        </div>

        {/* Toolbar */}
        {canDraw && (
          <QollabToolbar
            toolbar={toolbar}
            caps={caps}
            onClear={wb.clearAll}
          />
        )}

        {/* Read-only notice */}
        {!canDraw && (
          <div className="wb-readonly">view only</div>
        )}

        {/* Quadrant nav */}
        <div className="wb-quadrants">
          {QUADRANTS.map(q => (
            <button
              key={q.id}
              className={`wb-quad-btn ${activeQuad?.id === q.id ? "active" : ""}`}
              onClick={() => wb.panTo(q.x, q.y)}
              title={q.title}
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Viewport info */}
        <div className="wb-viewport-info">
          {wb.viewport.x},{wb.viewport.y}
        </div>

        {/* Mobile mode toggle */}
        <div className="wb-mode-toggle">
          <button
            className={`wb-mode-btn ${toolbar.mode === "draw" ? "active" : ""}`}
            onClick={() => toolbar.setMode("draw")}
          >
            ✏ Draw
          </button>
          <button
            className={`wb-mode-btn ${toolbar.mode === "pan" ? "active" : ""}`}
            onClick={() => toolbar.setMode("pan")}
          >
            ✋ Pan
          </button>
        </div>

      </div>
    </>
  );
}