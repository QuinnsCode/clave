"use client";
// src/app/components/DashboardClient/ArtifactBadges.tsx
//
// Small squircle badges showing which artifacts exist for a session.
// Icon-only, no text — visual indicators that match the existing badge
// language but read as artifact "slots" instead of text tags.
//
// Icons (lucide-react):
//   Mic            — assembled audio.webm
//   AudioWaveform  — waveform.dat (scrubber data)
//   MessagesSquare — diarization (per-speaker words + transcript)
//   SpellCheck     — cleanup (anchor-based transcript corrections)   // NEW (cleanup pass)
//   GanttChart     — timeline (multi-track per-speaker clips)
//
// Visual states:
//   exists  = filled purple chip
//   missing = outlined dim
//   running = pulsing
//   failed  = red outline
//
// Click "i" at the end → popover legend explaining each icon. CRUD modal
// on badge click is deferred (badges are read-only indicators for now).

import { useState, useRef, useEffect } from "react";
import { Mic, AudioWaveform, MessagesSquare, SpellCheck, GanttChart, Info } from "lucide-react";   // CHANGED (cleanup pass) — added SpellCheck
import type { ArtifactStateView } from "@/app/serverActions/diarization/getSessionArtifacts";

interface Props {
  artifacts?: ArtifactStateView;
  status?:    string;     // pipeline top-level: queued | running | done | failed
  size?:      "xs" | "sm";
}

const CSS = `
.ab-row {
  display: inline-flex; align-items: center; gap: 4px;
  position: relative;
}
.ab-chip {
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent;
  transition: all 0.15s;
  user-select: none;
}
.ab-chip.size-xs { width: 22px; height: 22px; border-radius: 6px; }
.ab-chip.size-sm { width: 26px; height: 26px; border-radius: 7px; }

/* Exists — filled purple */
.ab-chip.exists  { background: rgba(124,58,237,0.18); border-color: rgba(124,58,237,0.40); color: var(--purple-l); }
/* Missing — outlined dim */
.ab-chip.missing { background: transparent;            border-color: rgba(255,255,255,0.08); color: rgba(255,255,255,0.22); }
/* Running — pulsing */
.ab-chip.running { background: rgba(168,85,247,0.10);  border-color: rgba(168,85,247,0.40); color: #c4b1f0; animation: ab-pulse 1.4s ease-in-out infinite; }
/* Failed — red */
.ab-chip.failed  { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.35); color: #fca5a5; }
@keyframes ab-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

.ab-info {
  margin-left: 2px;
  width: 22px; height: 22px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.08);
  background: transparent;
  color: rgba(255,255,255,0.30);
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}
.ab-info:hover { border-color: rgba(124,58,237,0.35); color: var(--purple-l); }

/* Popover anchored below the info button */
.ab-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  background: #0d0d1a;
  border: 1px solid rgba(124,58,237,0.25);
  border-radius: 10px;
  padding: 12px 14px;
  font-family: 'DM Sans', system-ui, sans-serif;
  font-size: 12px;
  color: #ece8f8;
  min-width: 240px;
  box-shadow: 0 12px 36px rgba(0,0,0,0.6);
}
.ab-popover-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em;
  color: #918caa; margin-bottom: 8px;
  font-family: 'DM Mono', monospace;
}
.ab-legend-row {
  display: flex; align-items: center; gap: 10px;
  padding: 5px 0;
}
.ab-legend-text { display: flex; flex-direction: column; gap: 1px; }
.ab-legend-label {
  color: var(--purple-l);
  font-family: 'DM Mono', monospace;
  font-size: 11px;
}
.ab-legend-desc  { color: #918caa; font-size: 11px; }
.ab-footer-note {
  margin-top: 10px; padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 9px; line-height: 1.5;
  color: #4a4660;
  font-family: 'DM Mono', monospace;
}
`;

// Icons + labels. Labels only show in the popover legend.
const BADGES = [
  { key: "audio",       Icon: Mic,            label: "audio",       desc: "Cleaned recording" },
  { key: "waveform",    Icon: AudioWaveform,  label: "waveform",    desc: "Scrubber data" },
  { key: "diarization", Icon: MessagesSquare, label: "diarization", desc: "Speakers + words" },
  { key: "cleanup",     Icon: SpellCheck,     label: "cleanup",     desc: "Anchor-based corrections" },   // NEW (cleanup pass)
  { key: "timeline",    Icon: GanttChart,     label: "timeline",    desc: "Multi-track clips" },
] as const;

type BadgeKey = (typeof BADGES)[number]["key"];
type ChipState = "exists" | "missing" | "running" | "failed";

function chipStateFor(exists: boolean, status: string | undefined): ChipState {
  if (status === "failed") return "failed";
  if (status === "running" && !exists) return "running";
  return exists ? "exists" : "missing";
}

export default function ArtifactBadges({ artifacts, status, size = "xs" }: Props) {
  const [open, setOpen] = useState(false);
  const popoverRef      = useRef<HTMLDivElement | null>(null);
  const infoBtnRef      = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (infoBtnRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function stateFor(key: BadgeKey): ChipState {
    const exists = !!artifacts?.[key]?.exists;
    return chipStateFor(exists, status);
  }

  // Icon size scales with chip size. xs=22px chip → 12px icon, sm=26px → 14px.
  const iconSize = size === "xs" ? 12 : 14;

  return (
    <span className="ab-row">
      <style>{CSS}</style>
      {BADGES.map(b => {
        const v = stateFor(b.key);
        const Icon = b.Icon;
        return (
          <span
            key={b.key}
            className={`ab-chip size-${size} ${v}`}
            title={`${b.label}: ${v}`}
          >
            <Icon size={iconSize} strokeWidth={2} />
          </span>
        );
      })}

      <button
        ref={infoBtnRef}
        className="ab-info"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        aria-label="Legend"
      >
        <Info size={iconSize} strokeWidth={2} />
      </button>

      {open && (
        <div ref={popoverRef} className="ab-popover" onClick={e => e.stopPropagation()}>
          <div className="ab-popover-title">Artifacts</div>
          {BADGES.map(b => {
            const v = stateFor(b.key);
            const Icon = b.Icon;
            return (
              <div key={b.key} className="ab-legend-row">
                <span className={`ab-chip size-sm ${v}`}>
                  <Icon size={14} strokeWidth={2} />
                </span>
                <div className="ab-legend-text">
                  <span className="ab-legend-label">{b.label}</span>
                  <span className="ab-legend-desc">{b.desc}</span>
                </div>
              </div>
            );
          })}
          <div className="ab-footer-note">
            filled = exists · outlined = missing<br/>
            pulse = running · red = failed
          </div>
        </div>
      )}
    </span>
  );
}