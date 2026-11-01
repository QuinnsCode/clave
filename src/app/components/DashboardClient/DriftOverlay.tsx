"use client";
// src/app/components/DashboardClient/DriftOverlay.tsx
//
// TEMPORARY — remove once karaoke timing is verified working.
// Marked for deletion alongside useDriftCheck + driftCheck.ts.
//
// Fixed bottom-right HUD that shows, at the current playback moment:
//   - currentTime in seconds + ms
//   - which speaker diarization says is talking (+ the word)
//   - which speaker timeline.markers says is talking
//   - ✅ match / ⚠️ mismatch
//
// Reads pre-computed snapshot from useDriftCheck — this component is
// purely presentational.

import type { DriftSnapshot } from "@/lib/diarization/driftCheck";

interface Props {
  snapshot: DriftSnapshot;
  /** Optional speakerLabels map so the HUD shows pretty names. */
  labels?: Record<string, string> | null;
}

const CSS = `
.drift-overlay {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 9999;
  min-width: 220px;
  max-width: 340px;
  padding: 10px 12px;
  background: rgba(8, 8, 16, 0.92);
  border: 1px solid rgba(155, 108, 255, 0.4);
  border-radius: 10px;
  font-family: 'DM Mono', ui-monospace, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: #ece8f8;
  box-shadow: 0 6px 24px rgba(0,0,0,0.6);
  pointer-events: none;
  backdrop-filter: blur(8px);
}
.drift-row { display: flex; justify-content: space-between; gap: 12px; }
.drift-label { color: #918caa; }
.drift-value { color: #ece8f8; text-align: right; }
.drift-status {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.drift-status.match    { background: rgba(74, 222, 128, 0.18); color: #4ade80; }
.drift-status.mismatch { background: rgba(248, 113, 113, 0.18); color: #f87171; }
.drift-status.no-data  { background: rgba(155, 108, 255, 0.18); color: #b48bff; }
.drift-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.drift-title {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #918caa;
}
.drift-word { color: #b48bff; }
.drift-muted { color: #4a4660; }
`;

function nameFor(speakerId: string | null, labels?: Record<string, string> | null): string {
  if (!speakerId) return "—";
  if (labels?.[speakerId]) return labels[speakerId];
  const m = /^speaker_(\d+)$/i.exec(speakerId);
  if (m) return `S${parseInt(m[1], 10) + 1}`;
  return speakerId;
}

export default function DriftOverlay({ snapshot, labels }: Props) {
  const {
    currentSec,
    diarSpeaker,
    diarWordText,
    diarWordIdx,
    diarWordRange,
    timelineSpeaker,
    agreement,
    msIntoWord,
  } = snapshot;

  return (
    <>
      <style>{CSS}</style>
      <div className="drift-overlay">
        <div className="drift-header">
          <span className="drift-title">drift check</span>
          <span className={`drift-status ${agreement}`}>
            {agreement === "match"    && "✓ match"}
            {agreement === "mismatch" && "⚠ drift"}
            {agreement === "no-data"  && "— idle"}
          </span>
        </div>

        <div className="drift-row">
          <span className="drift-label">t</span>
          <span className="drift-value">{currentSec.toFixed(3)}s</span>
        </div>

        <div className="drift-row">
          <span className="drift-label">diar</span>
          <span className="drift-value">
            {nameFor(diarSpeaker, labels)}
            {diarWordText && (
              <> · <span className="drift-word">"{diarWordText}"</span></>
            )}
          </span>
        </div>

        {diarWordRange && (
          <div className="drift-row">
            <span className="drift-label">word</span>
            <span className="drift-value drift-muted">
              [{diarWordIdx}] {diarWordRange.startMs}–{diarWordRange.endMs}
              {msIntoWord !== null && <> · +{msIntoWord}ms</>}
            </span>
          </div>
        )}

        <div className="drift-row">
          <span className="drift-label">timeline</span>
          <span className="drift-value">{nameFor(timelineSpeaker, labels)}</span>
        </div>
      </div>
    </>
  );
}