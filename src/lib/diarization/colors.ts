// src/lib/diarization/colors.ts
//
// Stable 6-color palette for speaker bubbles. Index by speaker label order.
// Brand purple is RESERVED for future "me" highlight — not in this palette.
//
// Each entry exposes:
//   - bubble: bg color for the speech bubble
//   - text:   text color inside the bubble
//   - dot:    a saturated swatch for the speaker chip / modal row
//
// Hand-picked to read well against var(--bg-2) dark surface AND a light surface
// (the CSS variable theming should handle the latter automatically — these are
// fixed colors that contrast cleanly with both).

export interface SpeakerColor {
    bubble: string; // bubble background
    text:   string; // bubble text color
    dot:    string; // chip/marker color
    name:   string; // human-readable name (for debug)
  }
  
  const PALETTE: SpeakerColor[] = [
    { name: "indigo", bubble: "rgba(99, 102, 241, 0.18)",  text: "#c7d2fe", dot: "#6366f1" },
    { name: "cyan",   bubble: "rgba(6, 182, 212, 0.18)",   text: "#a5f3fc", dot: "#06b6d4" },
    { name: "amber",  bubble: "rgba(245, 158, 11, 0.18)",  text: "#fde68a", dot: "#f59e0b" },
    { name: "pink",   bubble: "rgba(236, 72, 153, 0.18)",  text: "#fbcfe8", dot: "#ec4899" },
    { name: "lime",   bubble: "rgba(132, 204, 22, 0.18)",  text: "#d9f99d", dot: "#84cc16" },
    { name: "rose",   bubble: "rgba(244, 63, 94, 0.18)",   text: "#fecdd3", dot: "#f43f5e" },
  ];
  
  // Stable mapping from speaker label → color via insertion order index.
  // Caller supplies the canonical speaker order so colors don't shift across renders.
  export function getSpeakerColor(speaker: string, speakerOrder: string[]): SpeakerColor {
    const idx = speakerOrder.indexOf(speaker);
    const safeIdx = idx < 0 ? 0 : idx % PALETTE.length;
    return PALETTE[safeIdx];
  }
  
  // Human-friendly display name from raw label.
  // "speaker_0" → "Speaker 1" (1-indexed feels more natural than 0-indexed)
  export function speakerDisplayName(speaker: string): string {
    const m = speaker.match(/^speaker_(\d+)$/);
    if (m) return `Speaker ${parseInt(m[1], 10) + 1}`;
    return speaker;
  }