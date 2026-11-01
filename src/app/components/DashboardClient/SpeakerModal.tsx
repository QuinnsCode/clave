"use client";
// src/app/components/DashboardClient/SpeakerModal.tsx
//
// Modal for toggling which speakers are visible in the bubble transcript.
// At least one speaker must stay visible — closing the last open eye is a no-op.
//
// Bubbles behind the modal update live as the user toggles (parent owns state).
//
// Matches the styling pattern in SessionDrawer.tsx: in-component <style> block,
// CSS variables for theming, animation on mount.

import { getSpeakerColor, speakerDisplayName } from "@/lib/diarization/colors";

interface Props {
  speakers:      string[];                          // canonical order
  visibility:    Record<string, boolean>;            // speaker → visible?
  speakerLabels: { labels?: Record<string, string>; me?: string } | null;
  onToggle:      (speaker: string) => void;
  onClose:       () => void;
}

const CSS = `
.spm-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  animation: spmFade 0.15s ease;
}
@keyframes spmFade { from { opacity: 0; } to { opacity: 1; } }

.spm-card {
  width: min(420px, 100%);
  max-height: min(640px, 90vh);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  animation: spmSlideUp 0.2s ease;
}
@keyframes spmSlideUp { from { transform: translateY(12px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

.spm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.spm-title { font-size: 13px; font-weight: 600; color: var(--text); letter-spacing: 0.02em; }
.spm-close {
  background: transparent; border: none; color: var(--text-3);
  padding: 4px; border-radius: 6px; cursor: pointer;
  display: flex; align-items: center; transition: all 0.15s;
}
.spm-close:hover { background: var(--bg-3); color: var(--text); }

.spm-subtitle {
  font-size: 11px; color: var(--text-3); padding: 10px 18px 4px;
  font-family: var(--mono); letter-spacing: 0.04em;
}

.spm-body { flex: 1; overflow-y: auto; padding: 4px 0 12px; }

.spm-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 18px;
  cursor: pointer; user-select: none;
  transition: background 0.12s;
}
.spm-row:hover { background: var(--bg-3); }

.spm-dot {
  width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.04);
}
.spm-name { flex: 1; font-size: 14px; color: var(--text); font-weight: 500; }
.spm-name-sub { font-size: 11px; color: var(--text-3); margin-left: 6px; font-weight: 400; }

.spm-eye {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 24px; border-radius: 6px;
  color: var(--text-3); transition: all 0.15s;
  flex-shrink: 0;
}
.spm-eye.on { color: var(--text); background: var(--bg-3); }
.spm-eye.off { color: var(--text-3); opacity: 0.55; }
.spm-eye.locked { opacity: 0.3; cursor: not-allowed; }

.spm-footer {
  padding: 10px 18px; border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end; flex-shrink: 0;
}
.spm-footer-btn {
  font-size: 12px; font-weight: 500;
  background: var(--purple); color: #fff;
  border: none; padding: 7px 16px; border-radius: 7px; cursor: pointer;
  transition: background 0.15s;
}
.spm-footer-btn:hover { background: var(--purple-d, #6d28d9); }
`;

function EyeOpen() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M1 7.5C2.5 4.5 5 3 7.5 3s5 1.5 6.5 4.5C12.5 10.5 10 12 7.5 12S2.5 10.5 1 7.5z"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="7.5" cy="7.5" r="2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  );
}

function EyeOff() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M2 2.5l11 10M3 5.2C2.2 5.9 1.5 6.7 1 7.5c1.5 3 4 4.5 6.5 4.5 1 0 2-.2 2.9-.6M5.5 4c.6-.2 1.3-.4 2-.4 2.5 0 5 1.5 6.5 4.5-.4.7-.9 1.4-1.5 2"
        stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export default function SpeakerModal({ speakers, visibility, speakerLabels, onToggle, onClose }: Props) {
  const visibleCount = Object.values(visibility).filter(Boolean).length;
  const meSpeaker    = speakerLabels?.me ?? null;

  function handleToggle(speaker: string) {
    const isOn = visibility[speaker];
    // Constraint: at least one speaker must remain visible
    if (isOn && visibleCount <= 1) return;
    onToggle(speaker);
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="spm-overlay" onClick={onClose}>
        <div className="spm-card" onClick={e => e.stopPropagation()}>

          <div className="spm-header">
            <div className="spm-title">Speakers</div>
            <button className="spm-close" onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="spm-subtitle">Toggle who you see in the transcript</div>

          <div className="spm-body">
            {speakers.map(spk => {
              const color    = getSpeakerColor(spk, speakers);
              const isOn     = visibility[spk];
              const customName = speakerLabels?.labels?.[spk];
              const displayName = customName ?? speakerDisplayName(spk);
              const isMe     = meSpeaker === spk;
              const lastOne  = isOn && visibleCount <= 1;

              return (
                <div
                  key={spk}
                  className="spm-row"
                  onClick={() => handleToggle(spk)}
                  style={{ cursor: lastOne ? "not-allowed" : "pointer" }}
                >
                  <span className="spm-dot" style={{ background: color.dot }} />
                  <span className="spm-name">
                    {displayName}
                    {isMe && <span className="spm-name-sub">· me</span>}
                  </span>
                  <span className={`spm-eye ${isOn ? "on" : "off"}${lastOne ? " locked" : ""}`}>
                    {isOn ? <EyeOpen /> : <EyeOff />}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="spm-footer">
            <button className="spm-footer-btn" onClick={onClose}>Done</button>
          </div>

        </div>
      </div>
    </>
  );
}