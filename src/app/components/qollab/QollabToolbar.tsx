"use client";
// src/app/components/qollab/QollabToolbar.tsx
// Floating toolbar — composes useToolbar + useColorPicker.
// Excalidraw-style, qlave-themed, stays out of the way.

import { useRef } from "react";
import {
  Pencil, Highlighter, Brush, Type, Image, Hand,
  Trash2, RotateCcw, ChevronDown,
} from "lucide-react";
import { useColorPicker, DEFAULT_PRESETS } from "@/app/hooks/qollab/useColorPicker";
import type { UseToolbarReturn, DrawTool, Mode } from "@/app/hooks/qollab/useToolbar";
import type { Capability } from "@/lib/qollab/capabilities";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  toolbar:   UseToolbarReturn;
  caps:      Capability[];
  onClear:   () => void;
}

// ── Tool config ───────────────────────────────────────────────────────────────

const DRAW_TOOLS: { id: DrawTool; icon: React.ReactNode; label: string }[] = [
  { id: "pencil", icon: <Pencil size={15} />,      label: "Pencil" },
  { id: "marker", icon: <Highlighter size={15} />, label: "Marker" },
  { id: "brush",  icon: <Brush size={15} />,       label: "Brush"  },
  { id: "text",   icon: <Type size={15} />,        label: "Text"   },
  { id: "image",  icon: <Image size={15} />,       label: "Image"  },
];

const WIDTH_PRESETS = [2, 4, 8, 14, 20];

const CSS = `
.wb-toolbar {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  display: flex; align-items: center; gap: 2px;
  background: rgba(13,13,26,0.95); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px; padding: 6px 8px; backdrop-filter: blur(16px);
  box-shadow: 0 4px 32px rgba(0,0,0,0.5); z-index: 20;
  font-family: 'DM Sans', sans-serif;
}
.wb-divider {
  width: 1px; height: 24px;
  background: rgba(255,255,255,0.08); margin: 0 6px; flex-shrink: 0;
}
.wb-btn {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px;
  background: transparent; border: none; color: #918caa;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
  position: relative;
}
.wb-btn:hover { background: rgba(255,255,255,0.06); color: #ece8f8; }
.wb-btn.active {
  background: rgba(124,58,237,0.2);
  border: 1px solid rgba(124,58,237,0.35);
  color: #a78bfa;
}
.wb-btn.danger:hover { background: rgba(248,113,113,0.1); color: #f87171; }
.wb-btn.pan.active { background: rgba(251,191,36,0.15); border-color: rgba(251,191,36,0.3); color: #fbbf24; }

/* Color swatch button */
.wb-swatch {
  width: 34px; height: 34px; border-radius: 8px;
  border: 2px solid rgba(255,255,255,0.15);
  cursor: pointer; transition: border-color 0.15s; flex-shrink: 0;
}
.wb-swatch:hover { border-color: rgba(255,255,255,0.35); }

/* Popover base */
.wb-popover {
  position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  background: rgba(13,13,26,0.98); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px; padding: 12px; backdrop-filter: blur(16px);
  box-shadow: 0 8px 40px rgba(0,0,0,0.6); z-index: 30;
  min-width: 200px;
}

/* Color picker popover */
.wb-color-presets {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-bottom: 10px;
}
.wb-color-preset {
  width: 26px; height: 26px; border-radius: 6px;
  border: 2px solid transparent; cursor: pointer; transition: all 0.12s;
}
.wb-color-preset:hover { transform: scale(1.15); }
.wb-color-preset.selected { border-color: #fff; }
.wb-color-sliders { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.wb-slider-row { display: flex; align-items: center; gap: 8px; }
.wb-slider-label { font-size: 10px; color: #4a4660; font-family: 'DM Mono', monospace; text-transform: uppercase; width: 12px; }
.wb-slider {
  flex: 1; height: 4px; border-radius: 100px; appearance: none;
  outline: none; cursor: pointer;
}
.wb-slider::-webkit-slider-thumb {
  appearance: none; width: 14px; height: 14px; border-radius: 50%;
  background: #fff; border: 2px solid #7c3aed; cursor: pointer;
}
.wb-hex-row { display: flex; gap: 6px; }
.wb-hex-input {
  flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px; padding: 5px 8px; color: #ece8f8;
  font-family: 'DM Mono', monospace; font-size: 12px; outline: none;
}
.wb-hex-input:focus { border-color: rgba(124,58,237,0.5); }

/* Width picker popover */
.wb-widths {
  display: flex; align-items: center; gap: 8px; padding: 4px 0;
}
.wb-width-preset {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 8px; cursor: pointer;
  transition: background 0.12s; background: transparent; border: none;
}
.wb-width-preset:hover { background: rgba(255,255,255,0.06); }
.wb-width-preset.selected { background: rgba(124,58,237,0.2); }
.wb-width-dot { border-radius: 50%; background: #ece8f8; }

/* Mode toggle */
.wb-mode-label {
  font-size: 10px; font-family: 'DM Mono', monospace;
  color: #4a4660; text-transform: uppercase; letter-spacing: 0.08em;
  padding: 0 4px;
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function QollabToolbar({ toolbar, caps, onClear }: Props) {
  const colorPicker = useColorPicker({
    initial:  toolbar.color,
    presets:  DEFAULT_PRESETS,
    onChange: toolbar.setColor,
  });

  const widthPopoverRef  = useRef<HTMLDivElement>(null);
  const widthTriggerRef  = useRef<HTMLButtonElement>(null);
  const [widthOpen, setWidthOpen] = [toolbar.showTools, toolbar.toggleTools];

  const canClear = caps.includes("wb:clear");

  return (
    <>
      <style>{CSS}</style>
      <div className="wb-toolbar">

        {/* Pan / Draw mode toggle */}
        <button
          className={`wb-btn pan ${toolbar.mode === "pan" ? "active" : ""}`}
          onClick={toolbar.toggleMode}
          title={toolbar.mode === "pan" ? "Switch to Draw (Space)" : "Switch to Pan (Space)"}
        >
          <Hand size={15} />
        </button>

        <div className="wb-divider" />

        {/* Draw tools */}
        {DRAW_TOOLS.map(t => (
          <button
            key={t.id}
            className={`wb-btn ${toolbar.tool === t.id ? "active" : ""}`}
            onClick={() => { toolbar.setTool(t.id); toolbar.setMode("draw"); }}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}

        <div className="wb-divider" />

        {/* Width picker */}
        <div style={{ position: "relative" }}>
          <button
            ref={widthTriggerRef as any}
            className={`wb-btn ${toolbar.showTools ? "active" : ""}`}
            onClick={toolbar.toggleTools}
            title="Stroke width"
            style={{ gap: 3 }}
          >
            <div style={{
              width:  Math.max(4, Math.min(toolbar.width, 16)),
              height: Math.max(4, Math.min(toolbar.width, 16)),
              borderRadius: "50%",
              background: toolbar.color,
            }} />
            <ChevronDown size={10} style={{ color: "#4a4660" }} />
          </button>

          {toolbar.showTools && (
            <div className="wb-popover" style={{ minWidth: "auto", left: 0, transform: "none" }}>
              <div className="wb-widths">
                {WIDTH_PRESETS.map(w => (
                  <button
                    key={w}
                    className={`wb-width-preset ${toolbar.width === w ? "selected" : ""}`}
                    onClick={() => { toolbar.setWidth(w); toolbar.toggleTools(); }}
                    title={`${w}px`}
                  >
                    <div
                      className="wb-width-dot"
                      style={{ width: Math.max(2, w * 0.9), height: Math.max(2, w * 0.9) }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Color swatch + picker */}
        <div style={{ position: "relative" }}>
          <div
            ref={colorPicker.triggerRef as any}
            className="wb-swatch"
            style={{ background: toolbar.color }}
            onClick={colorPicker.toggle}
            title="Color"
          />

          {colorPicker.isOpen && (
            <div ref={colorPicker.popoverRef as any} className="wb-popover">

              {/* Presets */}
              <div className="wb-color-presets">
                {colorPicker.presets.map(hex => (
                  <div
                    key={hex}
                    className={`wb-color-preset ${colorPicker.color === hex ? "selected" : ""}`}
                    style={{ background: hex }}
                    onClick={() => colorPicker.setColor(hex)}
                  />
                ))}
              </div>

              {/* HSL sliders */}
              <div className="wb-color-sliders">
                <div className="wb-slider-row">
                  <span className="wb-slider-label">H</span>
                  <input
                    type="range" min={0} max={360}
                    value={colorPicker.hue}
                    onChange={e => colorPicker.setHue(Number(e.target.value))}
                    className="wb-slider"
                    style={{
                      background: `linear-gradient(to right,
                        hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%),
                        hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))`,
                    }}
                  />
                </div>
                <div className="wb-slider-row">
                  <span className="wb-slider-label">S</span>
                  <input
                    type="range" min={0} max={100}
                    value={colorPicker.saturation}
                    onChange={e => colorPicker.setSaturation(Number(e.target.value))}
                    className="wb-slider"
                    style={{
                      background: `linear-gradient(to right,
                        hsl(${colorPicker.hue},0%,${colorPicker.lightness}%),
                        hsl(${colorPicker.hue},100%,${colorPicker.lightness}%))`,
                    }}
                  />
                </div>
                <div className="wb-slider-row">
                  <span className="wb-slider-label">L</span>
                  <input
                    type="range" min={0} max={100}
                    value={colorPicker.lightness}
                    onChange={e => colorPicker.setLightness(Number(e.target.value))}
                    className="wb-slider"
                    style={{
                      background: `linear-gradient(to right,
                        hsl(${colorPicker.hue},${colorPicker.saturation}%,0%),
                        hsl(${colorPicker.hue},${colorPicker.saturation}%,50%),
                        hsl(${colorPicker.hue},${colorPicker.saturation}%,100%))`,
                    }}
                  />
                </div>
                <div className="wb-slider-row">
                  <span className="wb-slider-label">A</span>
                  <input
                    type="range" min={0} max={100}
                    value={colorPicker.alpha}
                    onChange={e => colorPicker.setAlpha(Number(e.target.value))}
                    className="wb-slider"
                    style={{
                      background: `linear-gradient(to right, transparent, ${colorPicker.color})`,
                    }}
                  />
                </div>
              </div>

              {/* Hex input */}
              <div className="wb-hex-row">
                <input
                  className="wb-hex-input"
                  value={colorPicker.inputValue}
                  onChange={e => colorPicker.setInputValue(e.target.value)}
                  onBlur={colorPicker.commitInput}
                  onKeyDown={e => e.key === "Enter" && colorPicker.commitInput()}
                  placeholder="#a78bfa"
                  spellCheck={false}
                />
              </div>

            </div>
          )}
        </div>

        <div className="wb-divider" />

        {/* Clear — owner only */}
        {canClear && (
          <button
            className="wb-btn danger"
            onClick={onClear}
            title="Clear whiteboard"
          >
            <Trash2 size={15} />
          </button>
        )}

      </div>
    </>
  );
}