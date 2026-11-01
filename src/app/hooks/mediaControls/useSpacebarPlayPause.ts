// src/lib/hooks/mediaControls/useSpacebarPlayPause.ts
//
// Spacebar = play/pause when the drawer is open.
//
// Why a hook (genuine browser side effect):
//   - Adds a keyboard listener on window (DOM API)
//   - Needs cleanup on unmount
//   - Reusable from any media surface
//
// Skip behaviour: ignore when the user is typing or interacting with
// something where space has its own meaning:
//   - INPUT, TEXTAREA, SELECT, contenteditable → typing
//   - VIDEO element itself → browser already binds space to play/pause; if
//     we also call toggle() the two cancel out and nothing happens.
//   - BUTTON → space activates the button; let the browser handle it.

import { useEffect } from "react";

export interface SpacebarPlayPauseOptions {
  /** When false, the hook does nothing. Lets parent disable per-context. */
  enabled?:    boolean;
  /** Called when space is pressed in an eligible context. */
  onToggle:    () => void;
}

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function isNativelyHandled(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  // Browser binds space to these — don't double-fire.
  return tag === "VIDEO" || tag === "BUTTON";
}

export function useSpacebarPlayPause({
  enabled = true,
  onToggle,
}: SpacebarPlayPauseOptions): void {
  useEffect(() => {
    if (!enabled) return;

    function onKey(e: KeyboardEvent) {
      if (e.code !== "Space" && e.key !== " ") return;
      const active = document.activeElement;
      if (isTypingTarget(active)) return;
      if (isNativelyHandled(active)) return;
      // Stop the page from scrolling on space.
      e.preventDefault();
      onToggle();
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, onToggle]);
}