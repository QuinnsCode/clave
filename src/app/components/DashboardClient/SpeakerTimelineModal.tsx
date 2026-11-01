// src/app/components/DashboardClient/SpeakerTimelineModal.tsx
//
// Popped-out larger view. Layers above the SessionDrawer.
// The drawer's overlay sits at z-index: 200; this modal sits at 300 so it
// renders on top with its own backdrop. Clicking THIS backdrop closes the
// modal only — the drawer stays open underneath. Audio keeps playing
// (the video element is in the drawer, untouched).
//
// State ownership: currentTime + onSeek come from the drawer, same as the
// inline view. Both stay in sync because they read the same lifted state.
//
// CHANGED (tracks pass) — also renders the multitrack tracks view below
// the main scrubber. Same composition as SpeakerTimelineSection, just at
// modal size: bigger main waveform + roomier tracks.

"use client";

import { useEffect } from "react";
import { SpeakerTimeline } from "./SpeakerTimeline";
import SpeakerTracks from "./SpeakerTracks";
import type { SessionWaveformView } from "@/app/serverActions/diarization/getSessionWaveform";
import type { SessionTimelineView } from "@/app/serverActions/diarization/getSessionTimeline";
import type { WaveformStyleId } from "@/lib/diarization/waveformStyles";

interface SpeakerLabelsLite {
  labels?: Record<string, string>;
  me?:     string;
}

interface Props {
  waveform:  SessionWaveformView;
  timeline:  SessionTimelineView | null;     // NEW (tracks pass)
  sessionId: string;

  speakers:      string[];
  speakerLabels: SpeakerLabelsLite | null;

  // Lifted state
  currentTime: number;
  onSeek:      (sec: number) => void;

  onClose: () => void;

  style?: WaveformStyleId;
}

function formatDuration(sec: number): string {
  if (!isFinite(sec) || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const CSS = `
.stmodal-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: stmodalFade 0.15s ease;
}
@keyframes stmodalFade { from { opacity: 0; } to { opacity: 1; } }

.stmodal-card {
  background: var(--bg-2); border: 1px solid var(--border);
  border-radius: 12px;
  width: min(960px, 100%);
  max-height: calc(100vh - 48px);
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  animation: stmodalScale 0.18s ease;
}
@keyframes stmodalScale {
  from { transform: scale(0.96); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

.stmodal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0;
}
.stmodal-header-left { display: flex; flex-direction: column; gap: 2px; }
.stmodal-title {
  font-size: 13px; font-weight: 600; color: var(--text);
}
.stmodal-meta {
  font-size: 11px; color: var(--text-3); font-family: var(--mono);
}
.stmodal-close {
  background: transparent; border: none; color: var(--text-3);
  padding: 6px; border-radius: 6px; cursor: pointer; transition: all 0.15s;
  display: flex; align-items: center;
}
.stmodal-close:hover { background: var(--bg-3); color: var(--text); }

.stmodal-body {
  flex: 1; overflow-y: auto; padding: 24px 28px;
  display: flex; flex-direction: column; gap: 16px;
}

/* Override SpeakerTimeline's inline-size canvas — bigger in the modal.
   The scrub line + time readout auto-scale with the wider container. */
.stmodal-body .speaker-timeline canvas { height: 200px !important; }
.stmodal-body .speaker-timeline-time { font-size: 13px; margin-top: 12px; }

@media (max-height: 600px) {
  .stmodal-body { padding: 16px 20px; }
  .stmodal-body .speaker-timeline canvas { height: 140px !important; }
}
`;

export function SpeakerTimelineModal({
  waveform,
  timeline,
  sessionId,
  speakers,
  speakerLabels,
  currentTime,
  onSeek,
  onClose,
  style,
}: Props) {
  // Esc-to-close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <style>{CSS}</style>
      <div className="stmodal-overlay" onClick={onClose}>
        <div className="stmodal-card" onClick={e => e.stopPropagation()}>

          <div className="stmodal-header">
            <div className="stmodal-header-left">
              <div className="stmodal-title">Session Timeline</div>
              <div className="stmodal-meta">
                {sessionId.slice(0, 12)}… · {formatDuration(waveform.durationSec)}
                {timeline && ` · ${timeline.speakers.length} speakers · ${timeline.markers.length} markers`}
              </div>
            </div>
            <button className="stmodal-close" onClick={onClose} title="Close (Esc)">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="stmodal-body">
            {/* Main scrubber — bigger in modal */}
            <SpeakerTimeline
              amplitudes={waveform.amplitudes}
              durationSec={waveform.durationSec}
              currentTime={currentTime}
              onSeek={onSeek}
              style={style}
            />

            {/* Tracks view — bigger in modal too */}
            {timeline && speakers.length > 0 && (
              <SpeakerTracks
                timeline={timeline}
                speakers={speakers}
                speakerLabels={speakerLabels}
                currentTime={currentTime}
                onSeek={onSeek}
              />
            )}
          </div>

        </div>
      </div>
    </>
  );
}

export default SpeakerTimelineModal;