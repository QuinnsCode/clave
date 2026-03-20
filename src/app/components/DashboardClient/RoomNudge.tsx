"use client";
// src/app/components/DashboardClient/RoomNudge.tsx

import { useState, useEffect, useRef } from "react";

// ── Phrase sequence — edit freely, timing in ms ───────────────────────────────
export const NUDGE_SEQUENCE: Array<{ text: string; delay: number; size?: number }> = [
  { text: "Start a room.",                          delay: 0,      size: 14 },
  { text: "Start a room?",                          delay: 8000,   size: 14 },
  { text: "Start. A. Room.",                        delay: 16000,  size: 15 },
  { text: "You should start a room.",               delay: 24000,  size: 14 },
  { text: "A room. Start one.",                     delay: 32000,  size: 14 },
  { text: "The room misses you.",                   delay: 40000,  size: 14 },
  { text: "Rooms don't start themselves.",          delay: 48000,  size: 13 },
  { text: "Still here. Still no room.",             delay: 56000,  size: 13 },
  { text: "This is getting uncomfortable.",         delay: 64000,  size: 13 },
  { text: "I'm not mad. I'm just... waiting.",      delay: 72000,  size: 12 },
  { text: "What are we even doing here.",           delay: 80000,  size: 12 },
  { text: "Fine. I'll just sit here.",              delay: 88000,  size: 12 },
  { text: "...",                                    delay: 96000,  size: 18 },
  { text: "START THE ROOM.",                        delay: 104000, size: 16 },
  { text: "please",                                 delay: 112000, size: 11 },
];

const CSS = `
  @keyframes nudge-in {
    from { opacity: 0; transform: translateY(12px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
  @keyframes nudge-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
    50%       { box-shadow: 0 0 0 8px rgba(124,58,237,0); }
  }
  @keyframes nudge-text {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0);   }
  }
  @keyframes nudge-shake {
    0%,100% { transform: translateX(0); }
    20%     { transform: translateX(-3px); }
    40%     { transform: translateX(3px); }
    60%     { transform: translateX(-2px); }
    80%     { transform: translateX(2px); }
  }

  .room-nudge {
    position: fixed;
    bottom: 28px;
    right: 28px;
    z-index: 50;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    animation: nudge-in 0.4s cubic-bezier(0.16,1,0.3,1) both;
  }

  .nudge-bubble {
    background: rgba(13,13,26,0.92);
    border: 1px solid rgba(124,58,237,0.35);
    border-radius: 12px;
    padding: 8px 14px;
    color: rgba(255,255,255,0.55);
    font-size: 12px;
    font-style: italic;
    backdrop-filter: blur(8px);
    max-width: 220px;
    text-align: right;
    line-height: 1.4;
  }

  .nudge-phrase {
    animation: nudge-text 0.3s ease both;
  }

  .nudge-btn {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--purple);
    border: none;
    border-radius: 14px;
    padding: 13px 20px;
    cursor: pointer;
    animation: nudge-pulse 3s ease-in-out infinite;
    transition: background 0.15s, transform 0.1s;
    position: relative;
    overflow: hidden;
  }
  .nudge-btn::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgba(251,146,60,0.15) 0%, transparent 60%);
    pointer-events: none;
  }
  .nudge-btn:hover {
    background: #6d28d9;
    transform: scale(1.02);
  }
  .nudge-btn:active { transform: scale(0.98); }

  .nudge-btn.shake {
    animation: nudge-shake 0.5s ease, nudge-pulse 3s ease-in-out infinite;
  }

  .nudge-icon {
    width: 32px;
    height: 32px;
    background: rgba(251,146,60,0.2);
    border: 1px solid rgba(251,146,60,0.4);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .nudge-label {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
  }
  .nudge-label-sub {
    font-size: 10px;
    color: rgba(255,255,255,0.45);
    font-weight: 400;
    letter-spacing: 0.02em;
  }
  .nudge-label-main {
    color: #fff;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition: font-size 0.2s ease;
  }

  .nudge-close {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 20px;
    height: 20px;
    background: var(--bg-3);
    border: 1px solid var(--border);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    color: var(--text-3);
    cursor: pointer;
    transition: color 0.15s;
    line-height: 1;
  }
  .nudge-close:hover { color: var(--text-1); }
`;

interface Props {
  onStartRoom: () => void;
  generating?: boolean;
  roomUrl?: string | null;  // if set, show Go to room instead
}

export default function RoomNudge({ onStartRoom, generating, roomUrl }: Props) {
  const [phraseIdx, setPhraseIdx]   = useState(0);
  const [dismissed, setDismissed]   = useState(false);
  const [shake, setShake]           = useState(false);
  const [key, setKey]               = useState(0); // force re-animate text
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Schedule all phrase transitions
    for (let i = 1; i < NUDGE_SEQUENCE.length; i++) {
      const t = setTimeout(() => {
        setPhraseIdx(i);
        setKey(k => k + 1);
        // Shake on the desperate ones
        if (NUDGE_SEQUENCE[i].text === "START THE ROOM.") {
          setShake(true);
          setTimeout(() => setShake(false), 600);
        }
      }, NUDGE_SEQUENCE[i].delay);
      timeoutsRef.current.push(t);
    }
    return () => timeoutsRef.current.forEach(clearTimeout);
  }, []);

  if (dismissed) return null;

  const phrase   = NUDGE_SEQUENCE[phraseIdx];
  const fontSize = phrase.size ?? 14;
  const showBubble = phraseIdx > 0;

  return (
    <>
      <style>{CSS}</style>
      <div className="room-nudge">
        {showBubble && (
          <div className="nudge-bubble">
            <span key={key} className="nudge-phrase">{phrase.text}</span>
          </div>
        )}

        <div style={{ position: "relative" }}>
          <button
            className={`nudge-btn${shake ? " shake" : ""}`}
            onClick={roomUrl ? () => window.open(roomUrl, "_blank") : onStartRoom}
            disabled={generating && !roomUrl}
          >
            <div className="nudge-icon">
              <MicIcon />
            </div>
            <div className="nudge-label">
              <span className="nudge-label-sub">
                {generating ? "one sec..." : "ready when you are"}
              </span>
              <span className="nudge-label-main" style={{ fontSize: 14 }}>
                {generating ? "Starting…" : roomUrl ? "Go to room ↗" : "Start a room"}
              </span>
            </div>
          </button>

          <button
            className="nudge-close"
            onClick={() => setDismissed(true)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    </>
  );
}

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="5" y="1" width="6" height="9" rx="3" stroke="#fb923c" strokeWidth="1.4"/>
      <path d="M2.5 8a5.5 5.5 0 0 0 11 0" stroke="#fb923c" strokeWidth="1.4" strokeLinecap="round"/>
      <line x1="8" y1="13.5" x2="8" y2="15.5" stroke="#fb923c" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}