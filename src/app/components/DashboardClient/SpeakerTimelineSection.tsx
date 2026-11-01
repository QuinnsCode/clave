// src/app/components/DashboardClient/SpeakerTimelineSection.tsx
//
// The drawer section that holds the timeline UI:
//   1. Header row: "WAVEFORM" label + Expand button (modal)
//   2. Main waveform scrubber (SpeakerTimeline)
//   3. Per-speaker tracks view (SpeakerTracks) — multitrack DAW-style
//
// The tracks view receives timeline data fetched server-side from
// timeline.json. If timeline data isn't available (sessions before this
// release, or generation failed), only the main waveform renders. Graceful
// degradation.
//
// State ownership:
//   - currentTime + onSeek come from the drawer (lifted state)
//   - This section forwards them down to the inline timeline AND the modal
//   - Same currentTime drives main scrubber + tracks + modal — all stay in sync
//
// CHANGED (tracks pass) — composes SpeakerTracks below SpeakerTimeline.
// The flat per-speaker strips that used to live inside SpeakerTimeline are
// replaced by the multitrack view. Speakers without clips get an empty lane.
//
// CHANGED (tracks pass) — accepts a `timeline` prop alongside `waveform`.
// Both come from server actions on the drawer side.

"use client";

import { useState } from "react";
import { SpeakerTimeline } from "./SpeakerTimeline";
import { SpeakerTimelineModal } from "./SpeakerTimelineModal";
import SpeakerTracks from "./SpeakerTracks";
import type { SessionWaveformView } from "@/app/serverActions/diarization/getSessionWaveform";
import type { SessionTimelineView } from "@/app/serverActions/diarization/getSessionTimeline";
import type { WaveformStyleId } from "@/lib/diarization/waveformStyles";

interface SpeakerLabelsLite {
  labels?: Record<string, string>;
  me?:     string;
}

interface Props {
  waveform:   SessionWaveformView | null;
  timeline:   SessionTimelineView | null;        // NEW (tracks pass)
  loading:    boolean;                            // true while either is loading
  sessionId:  string;

  speakers:      string[];
  speakerLabels: SpeakerLabelsLite | null;

  // Lifted from drawer — drives scrub line + click-to-seek
  currentTime: number;
  onSeek:      (sec: number) => void;

  // Visual style for the main waveform.
  style?: WaveformStyleId;
}

const CSS = `
.stsec { display: flex; flex-direction: column; gap: 6px; }

.stsec-header {
  display: flex; align-items: center; justify-content: space-between;
}
.stsec-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-3); font-family: var(--mono);
}
.stsec-expand {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-3); border-radius: 6px;
  padding: 3px 8px; font-size: 11px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  transition: all 0.15s; font-family: var(--mono);
}
.stsec-expand:hover {
  border-color: var(--border-p); color: var(--text);
  background: var(--purple-g2);
}
.stsec-expand svg { display: block; }

.stsec-box {
  background: var(--bg-3); border: 1px solid var(--border);
  border-radius: 8px; padding: 6px 12px 8px;
}

/* Divider between main waveform and tracks view */
.stsec-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0 6px;
}

.stsec-empty {
  font-size: 12px; color: var(--text-3); text-align: center;
  padding: 14px 0;
}
`;

export default function SpeakerTimelineSection({
  waveform,
  timeline,
  loading,
  sessionId,
  speakers,
  speakerLabels,
  currentTime,
  onSeek,
  style,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Don't render the section at all if there's no waveform AND we're done loading.
  if (!loading && !waveform) return null;

  return (
    <>
      <style>{CSS}</style>
      <div className="stsec">
        <div className="stsec-header">
          <div className="stsec-title">Waveform</div>
          {waveform && (
            <button
              className="stsec-expand"
              onClick={() => setExpanded(true)}
              title="Expand waveform"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path
                  d="M6.5 1h3.5v3.5M10 1l-4 4M4.5 10H1V6.5M1 10l4-4"
                  stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"
                />
              </svg>
              Expand
            </button>
          )}
        </div>

        <div className="stsec-box">
          {loading && <div className="stsec-empty">Loading waveform…</div>}

          {!loading && waveform && (
            <>
              {/* Main scrubber */}
              <SpeakerTimeline
                amplitudes={waveform.amplitudes}
                durationSec={waveform.durationSec}
                currentTime={currentTime}
                onSeek={onSeek}
                style={style}
              />

              {/* Tracks view — only if we have timeline data AND speakers to show */}
              {timeline && speakers.length > 0 && (
                <>
                  <div className="stsec-divider" />
                  <SpeakerTracks
                    timeline={timeline}
                    speakers={speakers}
                    speakerLabels={speakerLabels}
                    currentTime={currentTime}
                    onSeek={onSeek}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {expanded && waveform && (
        <SpeakerTimelineModal
          waveform={waveform}
          timeline={timeline}
          sessionId={sessionId}
          speakers={speakers}
          speakerLabels={speakerLabels}
          currentTime={currentTime}
          onSeek={onSeek}
          onClose={() => setExpanded(false)}
          style={style}
        />
      )}
    </>
  );
}