// src/app/components/DashboardClient/SpeakerTimeline.tsx
//
// The main waveform scrubber. Renders ONE waveform (the master audio
// envelope) with a scrub line and time readout. Per-speaker activity is now
// handled by the SpeakerTracks component below (multitrack DAW-style view).
//
// LAYERS (top to bottom in the DOM, bottom to top visually):
//   1. waveform canvas       — static, redraws only on resize or amplitudes change
//   2. scrub line            — absolute-positioned div, transforms on currentTime
//                              change (GPU-accelerated, never triggers canvas redraw)
//   3. time readout          — YouTube/SoundCloud style "1:23 / 4:14"
//
// State ownership:
//   - The drawer owns the video/audio element.
//   - Drawer passes `currentTime` and `onSeek(sec)` down. Timeline doesn't
//     know it's a video — could be audio, could be anything. Lifted state.
//
// Interactions:
//   - Click anywhere on the component → onSeek to that time
//   - No drag-to-scrub (click only)
//
// Performance:
//   - Waveform canvas redraws ONLY when amplitudes, width, or style change.
//     `timeupdate` events fire every ~250ms; we don't want them touching
//     the canvas. Scrub line is a separate div with CSS transform.
//
// CHANGED (tracks pass) — REMOVED the flat per-speaker strips. They lived
// here as a placeholder for the proper multitrack view. That view is now
// SpeakerTracks, rendered as a sibling below this component (by
// SpeakerTimelineSection). This file is now purely the main scrubber.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  drawWaveform,
  DEFAULT_WAVEFORM_STYLE,
  type WaveformStyleId,
} from "@/lib/diarization/waveformStyles";

export interface SpeakerTimelineProps {
  // Normalized amplitudes (0..1) — one per bucket. From getSessionWaveform.
  amplitudes: number[];

  // Total audio duration. Drives time math + scrub-line position.
  durationSec: number;

  // Lifted state from the drawer:
  //   currentTime: video.currentTime in seconds (read-only here)
  //   onSeek:      called when user clicks somewhere on the timeline
  currentTime: number;
  onSeek:      (sec: number) => void;

  // Visual style for the canvas waveform. Defaults to whatever DEFAULT_WAVEFORM_STYLE is.
  style?: WaveformStyleId;
}

// ── Visual constants ────────────────────────────────────────────────────────

const HEIGHT = 80;    // waveform canvas CSS height

// Format a duration like "3:42".
function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SpeakerTimeline({
  amplitudes,
  durationSec,
  currentTime,
  onSeek,
  style = DEFAULT_WAVEFORM_STYLE,
}: SpeakerTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef     = useRef<HTMLDivElement | null>(null);  // waveform area (no time readout)
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = useState<number>(0);

  // ── Measure container width — bars adapt to available space ─────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Draw waveform whenever width, amplitudes, or style change ───────────
  // Critically NOT dependent on currentTime — that's the scrub line's job.
  useEffect(() => {
    if (!canvasRef.current || width <= 0 || amplitudes.length === 0) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;

    canvas.width  = Math.floor(width  * dpr);
    canvas.height = Math.floor(HEIGHT * dpr);
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${HEIGHT}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Reset transform before scaling. Setting canvas.width/height implicitly
    // resets, but being explicit avoids regressions if anyone refactors.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // Read --purple from computed style on the parent so canvas matches the theme.
    let baseColor = "#9b6cff";
    if (containerRef.current) {
      const computed = getComputedStyle(containerRef.current).getPropertyValue("--purple").trim();
      if (computed) baseColor = computed;
    }

    // Delegate to the selected renderer.
    drawWaveform(style, {
      ctx,
      w: width,
      h: HEIGHT,
      amplitudes,
      baseColor,
    });
  }, [width, amplitudes, style]);

  // ── Click-to-seek — whole component is a hit target ─────────────────────
  // We measure against the stage (waveform area) for the x→time conversion.
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!stageRef.current || durationSec <= 0) return;
    const rect = stageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    onSeek(ratio * durationSec);
  }, [durationSec, onSeek]);

  // ── Scrub line position as % of stage width ─────────────────────────────
  const scrubPct = durationSec > 0
    ? Math.max(0, Math.min(100, (currentTime / durationSec) * 100))
    : 0;

  return (
    <div className="speaker-timeline" ref={containerRef} onClick={handleClick}>
      <style>{`
        .speaker-timeline {
          width: 100%;
          padding: 12px 0 8px;
          cursor: pointer;
          user-select: none;
        }

        /* Stage = waveform canvas. Scrub line is positioned within this. */
        .speaker-timeline-stage {
          position: relative;
          width: 100%;
        }

        .speaker-timeline-stage canvas {
          display: block;
          width: 100%;
        }

        /* Scrub line — vertical bar across the canvas height */
        .speaker-timeline-scrub {
          position: absolute;
          top: 0; bottom: 0;
          width: 2px;
          background: var(--text);
          opacity: 0.9;
          pointer-events: none;
          transform: translateX(-1px);
          will-change: left;
        }
        .speaker-timeline-scrub::before {
          /* Small playhead dot on top of the scrub line, like YouTube's handle */
          content: "";
          position: absolute;
          top: -3px; left: -3px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--text);
        }

        /* Time readout — YouTube/SoundCloud style "current / total" */
        .speaker-timeline-time {
          margin-top: 8px;
          font-size: 11px;
          font-variant-numeric: tabular-nums;
          font-family: var(--mono);
          color: var(--text);
          opacity: 0.65;
          letter-spacing: 0.03em;
        }
        .speaker-timeline-time .total { opacity: 0.5; }
      `}</style>

      <div ref={stageRef} className="speaker-timeline-stage">
        <canvas ref={canvasRef} />

        {/* Scrub line — only render when we have a meaningful duration */}
        {durationSec > 0 && (
          <div
            className="speaker-timeline-scrub"
            style={{ left: `${scrubPct}%` }}
          />
        )}
      </div>

      {/* Time readout — left-aligned, "current / total" */}
      <div className="speaker-timeline-time">
        {fmtTime(currentTime)} <span className="total">/ {fmtTime(durationSec)}</span>
      </div>
    </div>
  );
}

export default SpeakerTimeline;