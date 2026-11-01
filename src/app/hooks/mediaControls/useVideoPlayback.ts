// src/lib/hooks/mediaControls/useVideoPlayback.ts
//
// Core playback hook. Returns a callback ref to attach to a <video>
// element, plus playback state and control functions:
//   - videoRef    — callback ref. Pass as <video ref={videoRef}>.
//   - currentTime — seconds, updated at ~60fps while playing
//   - isPlaying   — synced from video's play/pause events
//   - play / pause / toggle / seek
//
// Why a callback ref (not useRef):
//   The previous version used useRef + useEffect([videoRef]). The effect
//   only runs once (the ref OBJECT never changes), so if the video element
//   isn't in the DOM on initial mount — e.g. behind a `{!loading && ...}`
//   conditional — the listener-attach effect runs against a null ref and
//   silently does nothing. When the element later appears, the effect
//   doesn't re-run. Result: no play/pause events captured, isPlaying never
//   flips true, RAF never starts, currentTime stuck at 0.
//
//   A callback ref is the React-idiomatic fix: React calls it with the
//   element when mounted, and with null when unmounted. We treat the
//   element as state so listener-attach effects can depend on it directly.
//
// Why RAF instead of onTimeUpdate:
//   The browser's `timeupdate` event fires roughly every 250ms. For word-
//   level karaoke that's too coarse — most words last 200-600ms so a 250ms-
//   stale time can leave the highlight a full word behind. RAF reads
//   `video.currentTime` at display refresh rate (~16ms) which is below
//   human perception for "behind". RAF runs only while isPlaying === true;
//   while paused, currentTime doesn't change so polling is wasted.

import { useState, useEffect, useCallback, useRef } from "react";

export interface VideoPlaybackControls {
  /** Callback ref. Pass to your <video> element: <video ref={videoRef} />. */
  videoRef:    (el: HTMLVideoElement | null) => void;
  /** Current playback time in seconds, updated at ~60fps while playing. */
  currentTime: number;
  /** True while the video is actively playing. Derived from play/pause events. */
  isPlaying:   boolean;
  /** Start playback. No-op if no element attached. */
  play:        () => void;
  /** Pause playback. No-op if no element attached. */
  pause:       () => void;
  /** Toggle play/pause. Useful for keyboard shortcuts. */
  toggle:      () => void;
  /** Seek to a specific second. Updates currentTime immediately. */
  seek:        (sec: number) => void;
}

export function useVideoPlayback(): VideoPlaybackControls {
  // The element lives in state so dependent effects re-run when it mounts/
  // unmounts. We ALSO keep an imperative ref for sync access from control
  // functions and the RAF loop (avoids stale closures).
  const [element, setElement] = useState<HTMLVideoElement | null>(null);
  const elementRef            = useRef<HTMLVideoElement | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying,   setIsPlaying]   = useState(false);

  // Track the RAF id so we can cancel cleanly on unmount / pause.
  const rafRef = useRef<number | null>(null);

  // Callback ref — React invokes with element on mount, null on unmount.
  const videoRef = useCallback((el: HTMLVideoElement | null) => {
    elementRef.current = el;
    setElement(el);
  }, []);

  // ── Sync isPlaying from the element's own events ────────────────────────
  // The element is the source of truth — autoplay blocks, end-of-stream,
  // user using native controls etc. can change state without us calling
  // .play()/.pause(). Re-runs whenever the element changes (mount/unmount).
  useEffect(() => {
    if (!element) return;

    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnded);

    // Pick up initial state — element may already be playing if startStream
    // called .play() before this effect ran.
    setIsPlaying(!element.paused);
    // Also sync currentTime once on attach (e.g. mid-playback remount).
    setCurrentTime(element.currentTime);

    return () => {
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onEnded);
    };
  }, [element]);

  // ── RAF loop for currentTime while playing ──────────────────────────────
  // While paused, currentTime can still change via seek() — handled there.
  // While playing, RAF reads element.currentTime each frame.
  useEffect(() => {
    if (!isPlaying || !element) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const tick = () => {
      const el = elementRef.current;
      if (el) setCurrentTime(el.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying, element]);

  // ── timeupdate as backup for paused-state scrubs ────────────────────────
  // User scrubs with native controls while paused — RAF isn't running, but
  // timeupdate fires on seek even when paused. Cheap insurance.
  useEffect(() => {
    if (!element) return;
    const onTimeUpdate = () => {
      // Only when NOT playing — otherwise RAF handles it and we'd race.
      if (element.paused) setCurrentTime(element.currentTime);
    };
    element.addEventListener("timeupdate", onTimeUpdate);
    return () => element.removeEventListener("timeupdate", onTimeUpdate);
  }, [element]);

  // ── Control functions ───────────────────────────────────────────────────
  // Use elementRef so closures don't go stale between renders.

  const play = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    el.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    el.pause();
  }, []);

  const toggle = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  const seek = useCallback((sec: number) => {
    const el = elementRef.current;
    if (!el) return;
    el.currentTime = sec;
    // Reflect immediately so consumers (highlight, scrub line) don't wait.
    setCurrentTime(sec);
  }, []);

  return { videoRef, currentTime, isPlaying, play, pause, toggle, seek };
}