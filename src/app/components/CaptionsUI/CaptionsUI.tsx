// @/app/components/CaptionsUI/CaptionsUI.tsx
// Renders live caption bubbles per peer + transcript download button.
// Drop anywhere in your session layout.

"use client";

import type { CaptionMessage } from "@/lib/transcription";

interface Caption {
  peerId: string;
  text: string;
  timestamp: number;
}

interface CaptionsUIProps {
  captions: Map<string, Caption>;
  capReached: boolean;
  transcript: { peerId: string; text: string; timestamp: number }[];
  onDownload: (format: "txt" | "srt") => void;
  peerNames?: Record<string, string>; // optional peerId → display name map
}

export function CaptionsUI({
  captions,
  capReached,
  transcript,
  onDownload,
  peerNames = {},
}: CaptionsUIProps) {
  const activeCaptions = [...captions.values()];

  return (
    <div className="captions-root">
      {/* ── Live caption bubbles ── */}
      <div className="captions-live">
        {activeCaptions.map((caption) => (
          <div key={caption.peerId} className="caption-bubble">
            <span className="caption-peer">
              {peerNames[caption.peerId] ?? caption.peerId.slice(0, 8)}
            </span>
            <span className="caption-text">{caption.text}</span>
          </div>
        ))}
      </div>

      {/* ── Cap reached warning ── */}
      {capReached && (
        <div className="caption-cap-warning">
          Transcription limit reached for this month.
        </div>
      )}

      {/* ── Transcript download (show when session has content) ── */}
      {transcript.length > 0 && (
        <div className="caption-download">
          <button onClick={() => onDownload("txt")}>Download transcript (.txt)</button>
          <button onClick={() => onDownload("srt")}>Download subtitles (.srt)</button>
        </div>
      )}

      <style>{`
        .captions-root {
          position: absolute;
          bottom: 80px;
          left: 0;
          right: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          pointer-events: none;
          z-index: 10;
        }
        .captions-live {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          width: 100%;
          max-width: 700px;
          padding: 0 16px;
        }
        .caption-bubble {
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(8px);
          border-radius: 8px;
          padding: 6px 12px;
          color: #fff;
          font-size: 15px;
          line-height: 1.4;
          max-width: 100%;
          animation: caption-in 0.15s ease;
        }
        .caption-peer {
          font-size: 11px;
          opacity: 0.6;
          margin-right: 6px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .caption-text {
          opacity: 0.95;
        }
        .caption-cap-warning {
          background: rgba(239,68,68,0.85);
          color: #fff;
          font-size: 13px;
          padding: 4px 12px;
          border-radius: 6px;
          pointer-events: all;
        }
        .caption-download {
          display: flex;
          gap: 8px;
          pointer-events: all;
        }
        .caption-download button {
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
          color: #fff;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          cursor: pointer;
        }
        .caption-download button:hover {
          background: rgba(255,255,255,0.2);
        }
        @keyframes caption-in {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}