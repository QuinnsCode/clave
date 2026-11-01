// src/app/hooks/qollab/useToolbar.ts
// Tool, color, width selection state.
// Consumed by QollabToolbar and useWhiteboard.

import { useState, useCallback } from "react";
import type { StrokeTool } from "@/lib/qollab/strokeCodec";
import { hexToU32 } from "@/lib/qollab/strokeCodec";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawTool = "pencil" | "marker" | "brush" | "text" | "image";
export type Mode     = "draw" | "pan";

export const DRAW_TOOL_TO_STROKE: Record<DrawTool, StrokeTool | null> = {
  pencil: 0,
  marker: 1,
  brush:  2,
  text:   null,
  image:  null,
};

export const TOOL_WIDTHS: Record<DrawTool, number> = {
  pencil: 2,
  marker: 8,
  brush:  5,
  text:   0,
  image:  0,
};

export const TOOL_OPACITY: Record<DrawTool, number> = {
  pencil: 1.0,
  marker: 1.0,
  brush:  0.6,
  text:   1.0,
  image:  1.0,
};

export const PRESET_COLORS = [
  "#ffffff", "#ece8f8", "#a78bfa", "#7c3aed",
  "#22c55e", "#fbbf24", "#f87171", "#60a5fa",
  "#f472b6", "#34d399", "#fb923c", "#000000",
];

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseToolbarReturn {
  // State
  tool:         DrawTool;
  mode:         Mode;
  color:        string;   // hex
  colorU32:     number;   // packed RGBA for codec
  width:        number;
  opacity:      number;
  showColors:   boolean;
  showTools:    boolean;

  // Actions
  setTool:      (t: DrawTool) => void;
  setMode:      (m: Mode) => void;
  setColor:     (hex: string) => void;
  setWidth:     (w: number) => void;
  toggleColors: () => void;
  toggleTools:  () => void;
  closePopups:  () => void;
  toggleMode:   () => void;
}

export function useToolbar(): UseToolbarReturn {
  const [tool,       setToolState] = useState<DrawTool>("marker");
  const [mode,       setMode]      = useState<Mode>("draw");
  const [color,      setColorState] = useState("#a78bfa");
  const [width,      setWidthState] = useState(8);
  const [showColors, setShowColors] = useState(false);
  const [showTools,  setShowTools]  = useState(false);

  const setTool = useCallback((t: DrawTool) => {
    setToolState(t);
    setWidthState(TOOL_WIDTHS[t] || width);
    setShowTools(false);
  }, [width]);

  const setColor = useCallback((hex: string) => {
    setColorState(hex);
    setShowColors(false);
  }, []);

  const setWidth = useCallback((w: number) => {
    setWidthState(Math.max(1, Math.min(255, w)));
  }, []);

  const toggleColors = useCallback(() => {
    setShowColors(v => !v);
    setShowTools(false);
  }, []);

  const toggleTools = useCallback(() => {
    setShowTools(v => !v);
    setShowColors(false);
  }, []);

  const closePopups = useCallback(() => {
    setShowColors(false);
    setShowTools(false);
  }, []);

  const toggleMode = useCallback(() => {
    setMode(m => m === "draw" ? "pan" : "draw");
  }, []);

  const opacity  = TOOL_OPACITY[tool];
  const colorU32 = hexToU32(color, Math.round(opacity * 255));

  return {
    tool, mode, color, colorU32, width, opacity,
    showColors, showTools,
    setTool, setMode, setColor, setWidth,
    toggleColors, toggleTools, closePopups, toggleMode,
  };
}