// app/hooks/useTranscribe.ts
// Concurrent chunk processing + segment-level deduplication.

import { useState, useRef, useCallback } from "react";
import { useVAD } from "./useVAD";
import type { CaptionMessage, TranscribeSegment } from "@/types/transcription";
import { arrayBufferToBase64 } from "@/lib/utils/encoding";
import type { TranscriptChunk } from "@/app/api/qlave/getInitialTranscript";

interface Caption {
  peerId: string;
  text: string;
  timestamp: number;
}

interface TimedWord {
  startMs: number;
  endMs: number;
  text: string;
}

function mergeSegments(
  existing: TimedWord[],
  newSegments: TranscribeSegment[],
  chunkStartMs: number
): TimedWord[] {
  const incoming: TimedWord[] = newSegments
    .filter(s => s.text.trim())
    .map(s => ({
      startMs: chunkStartMs + s.start * 1000,
      endMs:   chunkStartMs + s.end   * 1000,
      text:    s.text.trim(),
    }));

  if (incoming.length === 0) return existing;

  const incomingStart = incoming[0].startMs;
  const incomingEnd   = incoming[incoming.length - 1].endMs;
  const kept = existing.filter(w => w.endMs < incomingStart || w.startMs > incomingEnd);
  return [...kept, ...incoming].sort((a, b) => a.startMs - b.startMs);
}

function wordsToText(words: TimedWord[]): string {
  return words.map(w => w.text).join(" ").replace(/\s+/g, " ").trim();
}

interface UseTranscribeOptions {
  siteKey:           string;
  getPeerId:         () => string;
  getDisplayName?:   () => string;
  getSessionWs:      () => WebSocket | null;
  getStream?:        () => MediaStream | null;
  enabled?:          boolean;
  model?:            string;
  initialTranscript?: TranscriptChunk[];
}

export function useTranscribe({
  siteKey,
  getPeerId,
  getDisplayName,
  getSessionWs,
  getStream,
  enabled = true,
  model,
  initialTranscript = [],
}: UseTranscribeOptions) {
  const [captions,   setCaptions]   = useState<Record<string, Caption>>({});
  const [liveText,   setLiveText]   = useState("");
  const [transcript, setTranscript] = useState<TranscriptChunk[]>(initialTranscript);
  const [capReached, setCapReached] = useState(false);

  const timedWordsRef   = useRef<TimedWord[]>([]);
  const previousTextRef = useRef<string>(
    // Seed context from last chunk of initial transcript if available
    initialTranscript.length > 0
      ? initialTranscript[initialTranscript.length - 1].text.split(" ").slice(-10).join(" ")
      : ""
  );
  const isActiveRef  = useRef(false);
  const streamRef    = useRef<MediaStream | null>(null);

  const handleIncomingCaption = useCallback((msg: CaptionMessage) => {
    setCaptions(prev => ({ ...prev, [msg.peerId]: { peerId: msg.peerId, text: msg.text, timestamp: msg.timestamp } }));
    if (msg.isFinal) {
      setTranscript(prev => [...prev, { peerId: msg.displayName ?? msg.peerId, text: msg.text, timestamp: msg.timestamp }]);
      setTimeout(() => {
        setCaptions(prev => {
          if (prev[msg.peerId]?.timestamp !== msg.timestamp) return prev;
          const { [msg.peerId]: _, ...rest } = prev;
          return rest;
        });
      }, 4000);
    }
  }, []);

  const sendChunk = useCallback(async (blob: Blob, mimeType: string, chunkStartTime: number) => {
    const ws          = getSessionWs();
    const peerId      = getPeerId();
    const peerId_     = peerId || "me";
    const displayName_ = getDisplayName?.() || peerId_;

    if (!enabled || capReached) return;

    const base64 = arrayBufferToBase64(await blob.arrayBuffer());

    let result: any;
    try {
      const res = await fetch("/api/qlave/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-site-key": siteKey,
        },
        body: JSON.stringify({
          audioBase64:  base64,
          mimeType,
          previousText: previousTextRef.current,
          language:     "en",
          chunkStartTime,
          ...(model ? { model } : {}),
        }),
      });
      result = await res.json();
    } catch {
      return;
    }

    if (!result.ok) {
      if (result.error?.code === "CAP_REACHED") setCapReached(true);
      return;
    }

    const { text, segments, chunkStartTime: returnedStart } = result.result;
    if (!text) return;

    previousTextRef.current = text.split(" ").slice(-10).join(" ");

    if (segments?.length > 0) {
      timedWordsRef.current = mergeSegments(
        timedWordsRef.current,
        segments,
        returnedStart ?? chunkStartTime
      );
    } else {
      timedWordsRef.current = mergeSegments(
        timedWordsRef.current,
        [{ start: 0, end: 0, text }],
        returnedStart ?? chunkStartTime
      );
    }

    setLiveText(wordsToText(timedWordsRef.current));

    const timestamp = Date.now();
    const MAX_TRANSCRIPT_ENTRIES = 1000;
    setTranscript(prev => {
      const next = [...prev, { peerId: displayName_, text, timestamp }];
      return next.length > MAX_TRANSCRIPT_ENTRIES ? next.slice(-MAX_TRANSCRIPT_ENTRIES) : next;
    });

    setCaptions(prev => ({ ...prev, [peerId_]: { peerId: peerId_, text, timestamp } }));
    setTimeout(() => {
      setCaptions(prev => {
        if (prev[peerId_]?.timestamp !== timestamp) return prev;
        const { [peerId_]: _, ...rest } = prev;
        return rest;
      });
    }, 4000);

    if (ws?.readyState === WebSocket.OPEN) {
      const captionMsg: CaptionMessage = {
        type:    "caption",
        peerId:  peerId_,
        text,
        timestamp,
        isFinal: true,
      };
      ws.send(JSON.stringify(captionMsg));
    }
  }, [enabled, capReached, getSessionWs, getPeerId, getDisplayName, siteKey, model]);

  const sendChunkRef = useRef(sendChunk);
  sendChunkRef.current = sendChunk;

  const stableOnChunk = useCallback(
    (blob: Blob, mimeType: string, chunkStartTime: number) =>
      sendChunkRef.current(blob, mimeType, chunkStartTime),
    []
  );

  const { start: startVAD, stop: stopVAD } = useVAD({
    onChunk:    stableOnChunk,
    intervalMs: 2_500,
    overlapMs:  800,
    get stream() { return streamRef.current ?? undefined; },
  });

  const start = useCallback(async (stream?: MediaStream) => {
    if (isActiveRef.current) return;
    isActiveRef.current   = true;
    timedWordsRef.current = [];
    if (stream) streamRef.current = stream;
    await startVAD();
  }, [startVAD]);

  const stop = useCallback(() => {
    isActiveRef.current = false;
    stopVAD();
  }, [stopVAD]);

  const downloadTranscript = useCallback((format: "txt" | "srt" = "txt") => {
    if (transcript.length === 0) return;

    const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    const fmtSrtTime = (ms: number) => {
      const offset = ms - transcript[0].timestamp;
      const h   = String(Math.floor(offset / 3_600_000)).padStart(2, "0");
      const m   = String(Math.floor((offset % 3_600_000) / 60_000)).padStart(2, "0");
      const s   = String(Math.floor((offset % 60_000) / 1_000)).padStart(2, "0");
      const ms_ = String(offset % 1_000).padStart(3, "0");
      return `${h}:${m}:${s},${ms_}`;
    };

    let content = "";

    if (format === "txt") {
      content = transcript
        .map(({ peerId, text, timestamp }) =>
          `[${fmtTime(timestamp)}] ${peerId}: ${text}`)
        .join("\n");
    } else {
      transcript.forEach(({ text, timestamp }, i) => {
        const start = fmtSrtTime(timestamp);
        const end   = fmtSrtTime(timestamp + 2_500);
        content += `${i + 1}\n${start} --> ${end}\n${text}\n\n`;
      });
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `transcript-${Date.now()}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }, [transcript]);

  return {
    captions,
    liveText,
    transcript,
    capReached,
    start,
    stop,
    handleIncomingCaption,
    downloadTranscript,
  };
}