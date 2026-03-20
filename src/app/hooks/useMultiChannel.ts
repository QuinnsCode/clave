// app/hooks/useMultiChannel.ts
// Multi-channel audio input — enumerate devices, open N streams,
// run a useVAD + useTranscribe instance per channel.
//
// Each channel is a "local peer" — same transcript/caption pipeline
// as a remote peer, just sourced locally from a USB audio interface input.
//
// Usage:
//   const mc = useMultiChannel({ siteKey, getSessionWs, enabled })
//   mc.channels        — live channel list with streams + transcript state
//   mc.devices         — available audio input devices
//   mc.addChannel(deviceId, label) — open a stream for a device
//   mc.removeChannel(channelId)    — stop and remove
//   mc.transcript      — merged transcript across all channels
//   mc.captions        — merged captions keyed by channelId

import { useState, useRef, useCallback, useEffect } from "react";
import { useVAD } from "./useVAD";
import type { CaptionMessage, TranscribeSegment } from "@/types/transcription";
import { arrayBufferToBase64 } from "@/lib/utils/encoding";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface MultiChannel {
  id:          string;   // stable uuid for this channel slot
  deviceId:    string;
  label:       string;   // user-assigned name e.g. "Ryan", "Guest 1"
  stream:      MediaStream | null;
  color:       string;
}

export interface MultiChannelTranscriptLine {
  channelId: string;
  label:     string;
  text:      string;
  timestamp: number;
}

interface UseMultiChannelOptions {
  siteKey:       string;
  getSessionWs:  () => WebSocket | null;
  enabled?:      boolean;
  model?:        string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_CHANNELS = 8; // hard cap — 1000 transcript entries per channel = manageable

const CHANNEL_COLORS = [
  "#00ffe1","#ff6b35","#ffd700","#a78bfa",
  "#34d399","#f472b6","#60a5fa","#fb923c",
];

// ── Single channel transcriber ─────────────────────────────────────────────────
// Plain function (not a hook) — we manage the lifecycle manually per channel
// so we can add/remove channels dynamically without violating rules of hooks.
//
// Each channel runs its own setInterval-based chunker (from useVAD logic)
// and POSTs to /api/qlave/transcribe independently.

class ChannelWorker {
  id:        string;
  label:     string;
  stream:    MediaStream;
  siteKey:   string;
  model:     string;
  getWs:     () => WebSocket | null;
  onCaption: (channelId: string, text: string) => void;
  onTranscript: (channelId: string, text: string) => void;

  private context:  AudioContext | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks:   Blob[] = [];

  constructor(opts: {
    id: string; label: string; stream: MediaStream;
    siteKey: string; model: string;
    getWs: () => WebSocket | null;
    onCaption: (channelId: string, text: string) => void;
    onTranscript: (channelId: string, text: string) => void;
  }) {
    Object.assign(this, opts);
    this.start();
  }

  private start() {
    const INTERVAL_MS = 2_500;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus" : "audio/webm";

    this.recorder = new MediaRecorder(this.stream, { mimeType });
    this.recorder.ondataavailable = e => { if (e.data.size > 0) this.chunks.push(e.data); };
    this.recorder.start(INTERVAL_MS);

    this.interval = setInterval(async () => {
      if (this.chunks.length === 0) return;
      const blob = new Blob(this.chunks, { type: mimeType });
      this.chunks = [];
      if (blob.size < 200) return;

      try {
        const arrayBuf = await blob.arrayBuffer();
        const base64    = arrayBufferToBase64(arrayBuf);
        const ws        = this.getWs();

        const res = await fetch("/api/qlave/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteKey:    this.siteKey,
            audio:      base64,
            mimeType,
            model:      this.model,
            peerId:     this.id,
            sessionWs:  null, // WS handle can't be serialized — server uses siteKey routing
          }),
        });

        if (!res.ok) return;
        const data = await res.json() as { text?: string; segments?: TranscribeSegment[] };
        const text = data.text?.trim();
        if (!text) return;

        this.onCaption(this.id, text);
        this.onTranscript(this.id, text);

        // Broadcast caption to session peers via WS
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type:      "caption",
            peerId:    this.id,
            text,
            timestamp: Date.now(),
          }));
        }
      } catch { /* network error — skip chunk */ }
    }, INTERVAL_MS);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    this.stream.getTracks().forEach(t => t.stop());
    this.context?.close();
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMultiChannel({
  siteKey,
  getSessionWs,
  enabled = true,
  model = "nova-2",
}: UseMultiChannelOptions) {
  const [devices,    setDevices]    = useState<AudioDevice[]>([]);
  const [channels,   setChannels]   = useState<MultiChannel[]>([]);
  const [captions,   setCaptions]   = useState<Record<string, string>>({});
  const [transcript, setTranscript] = useState<MultiChannelTranscriptLine[]>([]);

  const workers  = useRef<Map<string, ChannelWorker>>(new Map());
  const labelMap = useRef<Map<string, string>>(new Map()); // channelId → label

  // ── Enumerate devices ───────────────────────────────────────────────────────

  const refreshDevices = useCallback(async () => {
    try {
      // Need a permission grant first — request a throwaway stream
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop()));
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all
        .filter(d => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications")
        .map((d, i) => ({
          deviceId: d.deviceId,
          label:    d.label || `Microphone ${i + 1}`,
        }));
      setDevices(inputs);
    } catch (e) {
      console.error("useMultiChannel: device enumeration failed", e);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
  }, [refreshDevices]);

  // ── Add channel ─────────────────────────────────────────────────────────────

  const addChannel = useCallback(async (deviceId: string, label: string): Promise<string | null> => {
    if (!enabled) return null;
    if (workers.current.size >= MAX_CHANNELS) {
      console.warn(`useMultiChannel: MAX_CHANNELS (${MAX_CHANNELS}) reached`);
      return null;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
    } catch (e) {
      console.error("useMultiChannel: getUserMedia failed for", deviceId, e);
      return null;
    }

    const id    = crypto.randomUUID();
    const color = CHANNEL_COLORS[workers.current.size % CHANNEL_COLORS.length];

    labelMap.current.set(id, label);

    const worker = new ChannelWorker({
      id, label, stream, siteKey, model,
      getWs: getSessionWs,
      onCaption: (channelId, text) => {
        setCaptions(prev => ({ ...prev, [channelId]: text }));
      },
      onTranscript: (channelId, text) => {
        const lbl = labelMap.current.get(channelId) ?? channelId;
        // MAX 1000 entries per channel — trim oldest
        // TODO: raise cap or add pagination for long sessions
        setTranscript(prev => {
          const next = [...prev, { channelId, label: lbl, text, timestamp: Date.now() }];
          return next.length > 1000 ? next.slice(-1000) : next;
        });
      },
    });

    workers.current.set(id, worker);

    setChannels(prev => [...prev, { id, deviceId, label, stream, color }]);
    return id;
  }, [enabled, siteKey, model, getSessionWs]);

  // ── Remove channel ──────────────────────────────────────────────────────────

  const removeChannel = useCallback((channelId: string) => {
    workers.current.get(channelId)?.stop();
    workers.current.delete(channelId);
    labelMap.current.delete(channelId);
    setChannels(prev => prev.filter(c => c.id !== channelId));
    setCaptions(prev => { const n = { ...prev }; delete n[channelId]; return n; });
  }, []);

  // ── Rename channel ──────────────────────────────────────────────────────────

  const renameChannel = useCallback((channelId: string, label: string) => {
    labelMap.current.set(channelId, label);
    setChannels(prev => prev.map(c => c.id === channelId ? { ...c, label } : c));
  }, []);

  // ── Stop all ────────────────────────────────────────────────────────────────

  const stopAll = useCallback(() => {
    workers.current.forEach(w => w.stop());
    workers.current.clear();
    labelMap.current.clear();
    setChannels([]);
    setCaptions({});
  }, []);

  // ── Download transcript ─────────────────────────────────────────────────────

  const downloadTranscript = useCallback((format: "txt" | "srt" = "txt") => {
    if (transcript.length === 0) return;

    const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    let content = "";
    if (format === "txt") {
      content = transcript
        .map(l => `[${fmtTime(l.timestamp)}] ${l.label}: ${l.text}`)
        .join("\n");
    } else {
      const t0 = transcript[0]?.timestamp ?? 0;
      transcript.forEach(({ text, timestamp }, i) => {
        const off = timestamp - t0;
        const fmt = (ms: number) => {
          const h  = String(Math.floor(ms / 3_600_000)).padStart(2, "0");
          const m  = String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0");
          const s  = String(Math.floor((ms % 60_000) / 1_000)).padStart(2, "0");
          const ms_ = String(ms % 1_000).padStart(3, "0");
          return `${h}:${m}:${s},${ms_}`;
        };
        content += `${i + 1}\n${fmt(off)} --> ${fmt(off + 2_500)}\n${text}\n\n`;
      });
    }

    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `multichannel-${Date.now()}.${format}`; a.click();
    URL.revokeObjectURL(url);
  }, [transcript]);

  return {
    devices,
    channels,
    captions,
    transcript,
    addChannel,
    removeChannel,
    renameChannel,
    stopAll,
    downloadTranscript,
    refreshDevices,
    atCapacity: workers.current.size >= MAX_CHANNELS,
  };
}