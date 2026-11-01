// src/app/components/DashboardClient/SpeakerTracks.tsx
//
// Multitrack timeline view. One row per speaker. Each row shows that
// speaker's "clips" (merged utterance groups) as colored rectangles
// positioned in time, with a mini-waveform rendered inside each clip.
// Reads like Reason / Studio One / Logic — at a glance you can see who
// talked when, how much, and where the conversation rests.
//
// Layout per row:
//   ┌─label───┬─lane (canvas)──────────────────────────────────────┐
//   │ Spk 0   │ [clip][clip]              [clip][clip][clip][clip] │
//   ├─────────┼────────────────────────────────────────────────────┤
//   │ Spk 1   │      [clip]    [clip][clip]                        │
//   └─────────┴────────────────────────────────────────────────────┘
//
// Silence markers render as gray semi-transparent bands spanning all lanes
// vertically, sitting above the clips but below the scrub line.
//
// Click anywhere in any lane → onSeek. Same x→time conversion as the main
// waveform above. Each row also has its own scrub line — visually they line
// up with the main scrub line above because all components share the same
// horizontal axis (durationSec) and the same container width.

"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { getSpeakerColor } from "@/lib/diarization/colors";
import type { SessionTimelineView } from "@/app/serverActions/diarization/getSessionTimeline";

interface SpeakerLabelsLite {
  labels?: Record<string, string>;
  me?:     string;
}

export interface SpeakerTracksProps {
  timeline:       SessionTimelineView;
  speakerLabels:  SpeakerLabelsLite | null;
  speakers:       string[];                    // canonical order, for color assignment
  currentTime:    number;
  onSeek:         (sec: number) => void;
}

// ── Visual constants ────────────────────────────────────────────────────────

const ROW_HEIGHT      = 38;    // pixels per speaker row
const ROW_GAP         = 4;     // vertical gap between rows
const LABEL_WIDTH     = 84;    // fixed left column for speaker name
const CLIP_RADIUS     = 4;     // rounded corner radius on clip rectangles
const CLIP_INSET      = 3;     // px inset from row top/bottom for clip rectangle

export default function SpeakerTracks({
  timeline,
  speakerLabels,
  speakers,
  currentTime,
  onSeek,
}: SpeakerTracksProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const laneAreaRef  = useRef<HTMLDivElement | null>(null);   // the lane area to the right of labels
  const [laneWidth, setLaneWidth] = useState<number>(0);

  // ── Measure lane area width ─────────────────────────────────────────────
  // All the clip math is done in CSS percentages relative to lane width,
  // so we just need to know the lane area's actual pixel width to draw
  // canvases at the right resolution.
  useEffect(() => {
    if (!laneAreaRef.current) return;
    const el = laneAreaRef.current;
    setLaneWidth(el.clientWidth);
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setLaneWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Click-to-seek over the lane area only (not the label column) ─────────
  // We use the laneAreaRef's bounding rect for the x→time conversion.
  // Clicks on the label column are ignored — that prevents accidentally
  // seeking when you meant to read or click a speaker name.
  const handleLaneClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!laneAreaRef.current || timeline.durationSec <= 0) return;
    const rect = laneAreaRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < 0 || x > rect.width) return;   // click outside lane
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    onSeek(ratio * timeline.durationSec);
  }, [timeline.durationSec, onSeek]);

  // Scrub line position as % of lane width (matches main waveform).
  const scrubPct = timeline.durationSec > 0
    ? Math.max(0, Math.min(100, (currentTime / timeline.durationSec) * 100))
    : 0;

  // Quick lookup: silence marker spans for the overlay.
  const silenceMarkers = timeline.markers.filter(m => m.kind === "silence") as Array<
    { kind: "silence"; startSec: number; endSec: number }
  >;

  // Resolve a display name for a speaker. Falls back to the raw id.
  const labelFor = (speakerId: string): string => {
    return speakerLabels?.labels?.[speakerId] ?? speakerId;
  };

  return (
    <div className="speaker-tracks" ref={containerRef}>
      <style>{`
        .speaker-tracks {
          width: 100%;
          padding: 8px 0 4px;
          user-select: none;
        }

        .stk-row {
          display: flex;
          align-items: stretch;
          height: ${ROW_HEIGHT}px;
          margin-bottom: ${ROW_GAP}px;
        }
        .stk-row:last-child { margin-bottom: 0; }

        .stk-label {
          width: ${LABEL_WIDTH}px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          padding-right: 10px;
          font-size: 11px;
          font-family: var(--mono);
          color: var(--text-2);
          letter-spacing: 0.02em;
          /* Truncate long speaker names with ellipsis */
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Lane area = the time-axis canvas for this row. */
        .stk-lane {
          flex: 1;
          position: relative;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
          cursor: pointer;
          overflow: hidden;
        }
        .stk-lane canvas {
          display: block;
          width: 100%;
          height: 100%;
        }

        /* Container for overlay layers (silence bands, scrub line) — spans
           the lane area horizontally and ALL rows vertically. */
        .stk-overlay {
          position: absolute;
          top: 0; bottom: 0;
          left: ${LABEL_WIDTH}px;
          right: 0;
          pointer-events: none;   /* clicks fall through to lanes */
        }
        .stk-silence-band {
          position: absolute;
          top: 0; bottom: 0;
          background: rgba(120, 120, 140, 0.07);
          border-left:  1px dashed rgba(120, 120, 140, 0.18);
          border-right: 1px dashed rgba(120, 120, 140, 0.18);
        }
        .stk-scrub {
          position: absolute;
          top: 0; bottom: 0;
          width: 2px;
          background: var(--text);
          opacity: 0.85;
          transform: translateX(-1px);
        }
        .stk-scrub::before {
          /* Match the main waveform's playhead dot */
          content: "";
          position: absolute;
          top: -3px; left: -3px;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--text);
        }

        /* The tracks-wrap is the relative-positioning anchor for the overlay. */
        .stk-wrap {
          position: relative;
        }
      `}</style>

      <div className="stk-wrap">
        {/* Speaker rows */}
        {speakers.map((speakerId, idx) => {
          const track = timeline.speakers.find(t => t.speakerId === speakerId);
          const color = getSpeakerColor(speakerId, speakers, speakerLabels ?? undefined);

          return (
            <div key={speakerId} className="stk-row">
              <div className="stk-label" title={labelFor(speakerId)}>
                {labelFor(speakerId)}
              </div>
              <div
                className="stk-lane"
                // Lane-click handler — only the LAST lane gets the ref because
                // all lanes share the same width and x-position; we just need
                // ANY of them to read off. (Using the first speaker's lane.)
                ref={idx === 0 ? laneAreaRef : null}
                onClick={handleLaneClick}
              >
                <TrackCanvas
                  clips={track?.clips ?? []}
                  durationSec={timeline.durationSec}
                  width={laneWidth}
                  height={ROW_HEIGHT}
                  color={color}
                />
              </div>
            </div>
          );
        })}

        {/* Overlay — silence bands + scrub line.
            Sits on top of the lanes; pointer-events:none so clicks pass through. */}
        <div className="stk-overlay">
          {silenceMarkers.map((m, i) => {
            const leftPct  = (m.startSec / timeline.durationSec) * 100;
            const widthPct = ((m.endSec - m.startSec) / timeline.durationSec) * 100;
            return (
              <div
                key={i}
                className="stk-silence-band"
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`Silence: ${m.startSec.toFixed(1)}s – ${m.endSec.toFixed(1)}s`}
              />
            );
          })}

          {/* Scrub line — render only if we have a meaningful duration */}
          {timeline.durationSec > 0 && (
            <div
              className="stk-scrub"
              style={{ left: `${scrubPct}%` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── TrackCanvas ─────────────────────────────────────────────────────────────
// Renders one speaker's clips into a single canvas. Each clip is a rounded
// rectangle in the speaker's color, with a mini-waveform of mirrored bars
// inside drawn from the clip's amplitudes array.

interface TrackCanvasProps {
  clips:       SessionTimelineView["speakers"][number]["clips"];
  durationSec: number;
  width:       number;
  height:      number;
  color:       string;
}

function TrackCanvas({ clips, durationSec, width, height, color }: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!canvasRef.current || width <= 0 || height <= 0 || durationSec <= 0) return;

    const canvas = canvasRef.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.floor(width  * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width  = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Explicit transform reset — canvas.width/height implicitly resets, but
    // being defensive guards against future regressions.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Time-to-pixel scaling. All clip positions are in seconds; everything
    // we draw is in pixels.
    const pxPerSec = width / durationSec;

    for (const clip of clips) {
      // Clip rectangle position + size
      const clipX = clip.startSec * pxPerSec;
      const clipW = Math.max(2, (clip.endSec - clip.startSec) * pxPerSec);   // min 2px so tiny clips are still visible
      const clipY = CLIP_INSET;
      const clipH = height - CLIP_INSET * 2;

      // ── Background fill (faint speaker color) ──
      ctx.fillStyle = `${color}26`;   // ~15% alpha via hex suffix
      ctx.beginPath();
      if ((ctx as any).roundRect) {
        (ctx as any).roundRect(clipX, clipY, clipW, clipH, CLIP_RADIUS);
      } else {
        ctx.rect(clipX, clipY, clipW, clipH);
      }
      ctx.fill();

      // ── Mini-waveform bars inside the clip ──
      // Same downsample logic as the main waveform: choose a bar count
      // based on the clip's pixel width, then take peak-max over each
      // bucket range from clip.amplitudes.
      if (clip.amplitudes.length > 0) {
        const targetBars    = Math.max(1, Math.floor(clipW / 3));   // ~3px per bar
        const barCount      = Math.min(targetBars, clip.amplitudes.length);
        const bucketsPerBar = clip.amplitudes.length / barCount;
        const barWidth      = 1.5;
        const pxPerBar      = clipW / barCount;
        const barOffset     = (pxPerBar - barWidth) / 2;
        const centerY       = clipY + clipH / 2;
        const maxHalf       = (clipH / 2) - 2;

        ctx.fillStyle = color;
        for (let i = 0; i < barCount; i++) {
          const start = Math.floor(i * bucketsPerBar);
          const end   = Math.floor((i + 1) * bucketsPerBar);
          let peak = 0;
          for (let j = start; j < end && j < clip.amplitudes.length; j++) {
            if (clip.amplitudes[j] > peak) peak = clip.amplitudes[j];
          }
          if (start === end && start < clip.amplitudes.length) peak = clip.amplitudes[start];

          const halfH = Math.max(1, peak * maxHalf);
          const x = clipX + i * pxPerBar + barOffset;
          ctx.fillRect(x, centerY - halfH, barWidth, halfH * 2);
        }
      }
    }
  }, [clips, durationSec, width, height, color]);

  return <canvas ref={canvasRef} />;
}