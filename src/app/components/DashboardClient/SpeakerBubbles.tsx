"use client";
// src/app/components/DashboardClient/SpeakerBubbles.tsx
//
// Bubble-style transcript view with three R1 capabilities baked in:
//
//   1. Karaoke highlight — the word being spoken at `currentTime` gets a
//      subtle bold/glow treatment so the reader's eye can follow audio
//      playback. Always on; not gated by edit mode.
//
//   2. Edit mode toggle — pencil button in the section header flips the
//      transcript between read-only and clickable. When on, each word is
//      a hoverable target.
//
//   3. Per-word popover — clicking a word in edit mode opens a small popover
//      with [Edit | Lock] actions. Edit → inline input. Lock → marks the
//      word read-only (and locked words can't be opened for edit again).
//
// All edits + locks persist via the saveWordOverride server actions and are
// reflected back via optimistic local state.
//
// Speaker bubbles still alternate alignment when `speakerLabels.me` is set:
// the "me" speaker's bubbles right-align, everyone else left-aligns.

import { useState, useMemo, useRef, useEffect, useCallback, useTransition } from "react";
import { Pencil, Check, Lock, Unlock, X } from "lucide-react";
import { getSpeakerColor } from "@/lib/diarization/colors";
import {
  formatTimestamp,
  type Utterance,
  type DiarizedWord,
  type WordOverrides,
} from "@/lib/diarization/utterances";
// CHANGED (karaoke fix) — per-speaker active word lookup. Replaces the old
// findWordIndexAtMs which returned a single "the one current word" index.
// Per-speaker handles overlap (both same-speaker word overlap AND cross-
// speaker interruption-style overlap) so every bubble can highlight its
// own current word independently.
import { useActiveWords } from "@/app/hooks/mediaControls/useActiveWords";
import {
  saveWordEdit,
  toggleWordLock,
} from "@/app/serverActions/diarization/saveWordOverride";

// ── Props ───────────────────────────────────────────────────────────────────

interface SpeakerLabelsLite {
  labels?: Record<string, string>;
  me?:     string;
}

export interface SpeakerBubblesProps {
  speakers:      string[];
  utterances:    Utterance[];
  speakerLabels: SpeakerLabelsLite | null;

  // NEW (R1 pods pass) — needed for karaoke + edit
  diarizationId:  string;
  currentTime:    number;          // seconds, from drawer's video element
  overrides:      WordOverrides;   // initial server state

  // NEW (R1 pods pass) — required for server actions' auth check
  organizationId: string;
  userId:         string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function displayNameForSpeaker(
  speakerId: string,
  labels: SpeakerLabelsLite | null,
): string {
  if (labels?.labels?.[speakerId]) return labels.labels[speakerId];
  // Default: "speaker_0" → "Speaker 1", "speaker_1" → "Speaker 2", etc.
  const match = /^speaker_(\d+)$/i.exec(speakerId);
  if (match) return `Speaker ${parseInt(match[1], 10) + 1}`;
  return speakerId;
}

// Decide whether a timestamp marker should render above an utterance.
// Show one for the first utterance, and any time the gap from the previous
// utterance is >= TIMESTAMP_GAP_MS. Matches the earlier read-only bubble UI.
const TIMESTAMP_GAP_MS = 10_000;

function shouldShowTimestamp(idx: number, utterances: Utterance[]): boolean {
  if (idx === 0) return true;
  const prev = utterances[idx - 1];
  const cur  = utterances[idx];
  return (cur.startMs - prev.endMs) >= TIMESTAMP_GAP_MS;
}

// ── Styles ──────────────────────────────────────────────────────────────────

const CSS = `
.sb-root { display: flex; flex-direction: column; gap: 8px; }

/* Section header with edit toggle */
.sb-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 0 4px 0;
}
.sb-title {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--text-3); font-family: var(--mono);
}
.sb-actions { display: flex; gap: 6px; align-items: center; }
.sb-icon-btn {
  background: transparent; border: 1px solid var(--border);
  color: var(--text-3); border-radius: 6px;
  padding: 4px 8px; font-size: 11px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  transition: all 0.15s; font-family: var(--mono);
}
.sb-icon-btn:hover { border-color: var(--border-p); color: var(--text); background: var(--purple-g2); }
.sb-icon-btn.active { border-color: var(--purple); color: var(--purple-l); background: var(--purple-g2); }
.sb-icon-btn svg { display: block; }

/* Timestamp marker between utterance groups */
.sb-ts {
  font-size: 10px; color: var(--text-3); font-family: var(--mono);
  padding: 4px 0 0 4px; letter-spacing: 0.05em;
}

/* Bubble row */
.sb-row {
  display: flex; flex-direction: column; gap: 2px;
  max-width: 86%;
}
.sb-row.me { align-self: flex-end; align-items: flex-end; }
.sb-row.them { align-self: flex-start; align-items: flex-start; }

.sb-speaker-label {
  font-size: 11px; color: var(--text-3); padding: 0 8px;
  font-family: var(--mono);
}

.sb-bubble {
  padding: 8px 14px;
  border-radius: 14px;
  font-size: 14px;
  line-height: 1.45;
  color: var(--text);
  border: 1px solid;
  word-break: break-word;
}

/* Word span styling */
.sb-word {
  position: relative;
  display: inline;
  border-radius: 3px;
  transition: background 0.12s, color 0.12s;
}
.sb-word.editable {
  cursor: pointer;
}
.sb-word.editable:hover {
  background: rgba(155, 108, 255, 0.18);
}
/* Karaoke highlight — currently-spoken word. Subtle, doesn't fight the bubble. */
.sb-word.current {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  font-weight: 600;
}
/* Edited word — dotted underline reminds user this is corrected text. */
.sb-word.edited {
  border-bottom: 1px dotted rgba(155, 108, 255, 0.7);
}
/* Locked — small lock icon affordance, subtle. Also can't be edited. */
.sb-word.locked {
  border-bottom: 1px solid rgba(74, 222, 128, 0.6);
  cursor: not-allowed;
}
.sb-word.locked:hover { background: transparent; }

/* Inline edit input */
.sb-word-input {
  font-family: inherit;
  font-size: inherit;
  background: var(--bg-2);
  border: 1px solid var(--purple);
  color: var(--text);
  border-radius: 3px;
  padding: 0 4px;
  min-width: 40px;
  width: auto;
  outline: none;
}

/* Popover */
.sb-popover {
  position: fixed;
  z-index: 250;
  background: var(--bg-2);
  border: 1px solid var(--border-p);
  border-radius: 8px;
  padding: 4px;
  display: flex;
  gap: 2px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.4);
  animation: sbPop 0.1s ease;
}
@keyframes sbPop {
  from { opacity: 0; transform: translateY(-2px); }
  to   { opacity: 1; transform: translateY(0); }
}
.sb-popover-item {
  background: transparent; border: none; color: var(--text-2);
  font-size: 11px; padding: 5px 10px; border-radius: 5px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 5px;
  font-family: var(--mono);
  transition: all 0.1s;
}
.sb-popover-item:hover { background: var(--bg-3); color: var(--text); }
.sb-popover-item.danger:hover { color: var(--red, #f87171); }
.sb-popover-item svg { display: block; }
.sb-popover-close {
  background: transparent; border: none; color: var(--text-3); cursor: pointer;
  padding: 5px; border-radius: 5px; display: flex; align-items: center;
}
.sb-popover-close:hover { background: var(--bg-3); color: var(--text); }
`;

// ── Component ───────────────────────────────────────────────────────────────

export default function SpeakerBubbles({
  speakers,
  utterances,
  speakerLabels,
  diarizationId,
  currentTime,
  overrides,
  organizationId,
  userId,
}: SpeakerBubblesProps) {
  const [editMode, setEditMode]       = useState(false);
  const [popoverAt, setPopoverAt]     = useState<{ wordIndex: number; x: number; y: number } | null>(null);
  const [editing, setEditing]         = useState<{ wordIndex: number; value: string } | null>(null);
  const [localOverrides, setLocalOverrides] = useState<WordOverrides>(overrides);
  const [, startTransition]           = useTransition();

  // Sync from server-provided overrides whenever they change (e.g. drawer reload).
  useEffect(() => {
    setLocalOverrides(overrides);
  }, [overrides]);

  // Flat words array — needed for karaoke index lookup and edit text resolution.
  // Memoized so we only rebuild when the underlying utterances change.
  const allWords: DiarizedWord[] = useMemo(
    () => utterances.flatMap(u => u.words),
    [utterances]
  );

  // Karaoke: which word is being spoken right now, per speaker? Map may be
  // empty (between words) or have multiple entries (overlap regions).
  // CHANGED (karaoke fix) — was findWordIndexAtMs returning a single index;
  // that picked the first match on overlap and let later-starting words go
  // un-highlighted. Per-speaker map fixes both same-speaker word overlap
  // (e.g. "foot"/"steps" sharing 500ms) and cross-speaker interruption.
  const currentMs               = Math.round(currentTime * 1000);
  const currentWordsBySpeaker   = useActiveWords(allWords, currentMs);

  // ── Word click handler ──────────────────────────────────────────────────
  // In edit mode + word is not locked → open popover at the word's position.
  // Outside edit mode → do nothing (popover only available in edit mode).
  const handleWordClick = useCallback((e: React.MouseEvent<HTMLSpanElement>, wordIndex: number) => {
    if (!editMode) return;
    if (localOverrides.locks.includes(wordIndex)) return;   // can't edit locked
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    // Position popover just below the word. Fixed positioning handles scroll.
    setPopoverAt({
      wordIndex,
      x: Math.min(rect.left, window.innerWidth - 220),    // keep on-screen
      y: rect.bottom + 4,
    });
  }, [editMode, localOverrides.locks]);

  // Right-click also opens the popover (and prevents browser context menu).
  // Same gating as left click.
  const handleWordContextMenu = useCallback((e: React.MouseEvent<HTMLSpanElement>, wordIndex: number) => {
    if (!editMode) return;
    if (localOverrides.locks.includes(wordIndex)) return;
    e.preventDefault();
    e.stopPropagation();
    setPopoverAt({
      wordIndex,
      x: Math.min(e.clientX, window.innerWidth - 220),
      y: e.clientY + 4,
    });
  }, [editMode, localOverrides.locks]);

  // ── Popover actions ─────────────────────────────────────────────────────

  const startEditingFromPopover = useCallback((wordIndex: number) => {
    const currentText = allWords[wordIndex]?.text ?? "";
    setEditing({ wordIndex, value: currentText });
    setPopoverAt(null);
  }, [allWords]);

  const toggleLockFromPopover = useCallback((wordIndex: number) => {
    setPopoverAt(null);

    // Optimistic update so the UI doesn't lag the server roundtrip.
    const wasLocked = localOverrides.locks.includes(wordIndex);
    const optimistic: WordOverrides = {
      edits: localOverrides.edits,
      locks: wasLocked
        ? localOverrides.locks.filter(i => i !== wordIndex)
        : [...localOverrides.locks, wordIndex].sort((a, b) => a - b),
    };
    setLocalOverrides(optimistic);

    startTransition(async () => {
      const result = await toggleWordLock({
        diarizationId,
        wordIndex,
        userId,
        organizationId,
      });
      if (result.ok && result.overrides) {
        setLocalOverrides(result.overrides);
      } else {
        // Rollback — server rejected (auth fail, missing row, etc.)
        setLocalOverrides(localOverrides);
        console.error("[SpeakerBubbles] toggleWordLock failed:", result.error);
      }
    });
  }, [diarizationId, localOverrides, organizationId, userId]);

  // ── Inline edit submit ──────────────────────────────────────────────────

  const submitEdit = useCallback(async () => {
    if (!editing) return;
    const trimmed = editing.value.trim();
    if (!trimmed) {
      setEditing(null);
      return;
    }
    // Optimistic add to local edits
    const optimisticEdit = {
      wordIndex: editing.wordIndex,
      original:  allWords[editing.wordIndex]?.text ?? "",
      text:      trimmed,
      at:        new Date().toISOString(),
    };
    const otherEdits = localOverrides.edits.filter(e => e.wordIndex !== editing.wordIndex);
    setLocalOverrides({
      edits: [...otherEdits, optimisticEdit].sort((a, b) => a.wordIndex - b.wordIndex),
      locks: localOverrides.locks,
    });
    setEditing(null);

    const result = await saveWordEdit({
      diarizationId,
      wordIndex: optimisticEdit.wordIndex,
      text:      trimmed,
      userId,
      organizationId,
    });
    if (result.ok && result.overrides) {
      setLocalOverrides(result.overrides);
    } else {
      console.error("[SpeakerBubbles] saveWordEdit failed:", result.error);
      // Rollback on server failure
      setLocalOverrides(localOverrides);
    }
  }, [editing, allWords, diarizationId, localOverrides, organizationId, userId]);

  const cancelEdit = useCallback(() => setEditing(null), []);

  // ── Global handlers: close popover/edit on outside interactions ─────────

  useEffect(() => {
    if (!popoverAt && !editing) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".sb-popover") || target.closest(".sb-word-input")) return;
      if (target.closest(".sb-word")) return;  // word clicks are handled by their own handler
      setPopoverAt(null);
      if (editing) setEditing(null);   // implicit cancel
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPopoverAt(null);
        setEditing(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [popoverAt, editing]);

  // ── Build a quick lookup for "is this word edited?" (for dotted underline)
  const editedSet = useMemo(() => new Set(localOverrides.edits.map(e => e.wordIndex)), [localOverrides.edits]);
  const lockedSet = useMemo(() => new Set(localOverrides.locks), [localOverrides.locks]);

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="sb-root">
      <style>{CSS}</style>

      {/* Section header */}
      <div className="sb-header">
        <div className="sb-title">Transcript</div>
        <div className="sb-actions">
          <button
            className={`sb-icon-btn ${editMode ? "active" : ""}`}
            onClick={() => {
              setEditMode(m => !m);
              setPopoverAt(null);
              setEditing(null);
            }}
            title={editMode ? "Done editing" : "Edit transcript"}
          >
            {editMode
              ? (<><Check size={11}/> Done</>)
              : (<><Pencil size={11}/> Edit</>)}
          </button>
        </div>
      </div>

      {/* Utterance bubbles */}
      {utterances.map((u, ui) => {
        const isMe         = speakerLabels?.me === u.speaker;
        const color        = getSpeakerColor(u.speaker, speakers, speakerLabels ?? undefined);
        const dispName     = displayNameForSpeaker(u.speaker, speakerLabels);
        const showTs       = shouldShowTimestamp(ui, utterances);

        return (
          <div key={ui}>
            {showTs && (
              <div className="sb-ts">{formatTimestamp(u.startMs)}</div>
            )}
            <div className={`sb-row ${isMe ? "me" : "them"}`}>
              <div className="sb-speaker-label">{dispName}</div>
              <div
                className="sb-bubble"
                style={{
                  background: `${color}1A`,            // ~10% alpha
                  borderColor: `${color}66`,           // ~40% alpha
                }}
              >
                {u.words.map((w, localIdx) => {
                  const wordIndex = u.wordStartIndex + localIdx;
                  // CHANGED (karaoke fix) — check this speaker's current
                  // word, not "the" single current word across all speakers.
                  const isCurrent = currentWordsBySpeaker.get(u.speaker) === wordIndex;
                  const isEdited  = editedSet.has(wordIndex);
                  const isLocked  = lockedSet.has(wordIndex);
                  const isEditingThis = editing?.wordIndex === wordIndex;

                  // Inline editor for the one currently-edited word
                  if (isEditingThis) {
                    return (
                      <span key={localIdx}>
                        <input
                          className="sb-word-input"
                          autoFocus
                          value={editing!.value}
                          onChange={e => setEditing({ ...editing!, value: e.target.value })}
                          onBlur={submitEdit}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); submitEdit(); }
                            if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                          }}
                          // Auto-grow input to roughly fit the text length
                          style={{ width: `${Math.max(4, editing!.value.length + 1)}ch` }}
                        />
                        {localIdx < u.words.length - 1 && " "}
                      </span>
                    );
                  }

                  const classes = [
                    "sb-word",
                    editMode && !isLocked ? "editable" : "",
                    isCurrent ? "current" : "",
                    isEdited  ? "edited"  : "",
                    isLocked  ? "locked"  : "",
                  ].filter(Boolean).join(" ");

                  return (
                    <span
                      key={localIdx}
                      className={classes}
                      onClick={e => handleWordClick(e, wordIndex)}
                      onContextMenu={e => handleWordContextMenu(e, wordIndex)}
                      title={
                        isLocked   ? "Locked — click Edit toggle off to unlock" :
                        editMode   ? "Click to edit or lock" :
                        undefined
                      }
                    >
                      {w.text}{localIdx < u.words.length - 1 && " "}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}

      {/* Popover — fixed-positioned, only one at a time */}
      {popoverAt && (
        <div
          className="sb-popover"
          style={{ left: `${popoverAt.x}px`, top: `${popoverAt.y}px` }}
        >
          <button
            className="sb-popover-item"
            onClick={() => startEditingFromPopover(popoverAt.wordIndex)}
          >
            <Pencil size={11}/> Edit
          </button>
          <button
            className="sb-popover-item"
            onClick={() => toggleLockFromPopover(popoverAt.wordIndex)}
          >
            {lockedSet.has(popoverAt.wordIndex)
              ? (<><Unlock size={11}/> Unlock</>)
              : (<><Lock size={11}/> Lock</>)}
          </button>
          <button
            className="sb-popover-close"
            onClick={() => setPopoverAt(null)}
            title="Close (Esc)"
          >
            <X size={11}/>
          </button>
        </div>
      )}
    </div>
  );
}