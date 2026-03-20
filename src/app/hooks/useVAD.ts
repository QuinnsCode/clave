// app/hooks/useVAD.ts
// Fixed-interval audio chunker — no VAD silence detection.
// Sends chunks every `intervalMs` regardless of speech.
// Whisper handles silence filtering server-side via vad_filter.
//
// Pass `stream` to reuse an existing MediaStream (e.g. from WebRTC).
// If omitted, acquires mic via getUserMedia as before.

import { useEffect, useRef, useCallback } from "react";

export const VAD_DEFAULTS = {
  // How often to send a chunk (ms). Lower = more responsive, higher API cost.
  intervalMs: 2_500,

  // Overlap with previous chunk (ms). Prevents word loss at boundaries.
  // was 500 — catches more boundary words
  overlapMs: 800,

  // Skip WAV blobs smaller than this (bytes). Filters total-silence chunks.
  minBlobBytes: 200,

  // WAV sample rate. 16000 = Whisper native, smallest + best for speech.
  wavSampleRate: 16_000,

  // WAV bit depth. 16 = standard, 8 = half size.
  wavBitDepth: 16 as 8 | 16,
} as const;

export type VADOptions = {
  onChunk: (audioBlob: Blob, mimeType: string, chunkStartTime: number) => void;
  stream?: MediaStream | (() => MediaStream | undefined); // optional — reuse existing stream, skip getUserMedia
} & Partial<typeof VAD_DEFAULTS>;

// ── WAV encoder ───────────────────────────────────────────────────────────────

function encodeWav(pcm: Float32Array, sampleRate: number, bitDepth: 8 | 16): Blob {
  const bytesPerSample = bitDepth / 8;
  const dataBytes = pcm.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buf);
  const str = (off: number, s: string) =>
    [...s].forEach((c, i) => view.setUint8(off + i, c.charCodeAt(0)));

  str(0,  "RIFF"); view.setUint32(4,  36 + dataBytes, true);
  str(8,  "WAVE"); str(12, "fmt ");
  view.setUint32(16, 16,                         true);
  view.setUint16(20, 1,                          true); // PCM
  view.setUint16(22, 1,                          true); // mono
  view.setUint32(24, sampleRate,                 true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample,             true);
  view.setUint16(34, bitDepth,                   true);
  str(36, "data"); view.setUint32(40, dataBytes,  true);

  if (bitDepth === 16) {
    const out = new Int16Array(buf, 44);
    for (let i = 0; i < pcm.length; i++)
      out[i] = Math.max(-32768, Math.min(32767, pcm[i] * 32767));
  } else {
    const out = new Uint8Array(buf, 44);
    for (let i = 0; i < pcm.length; i++)
      out[i] = Math.max(0, Math.min(255, (pcm[i] + 1) * 127.5));
  }

  return new Blob([buf], { type: "audio/wav" });
}

// ── AudioWorklet ──────────────────────────────────────────────────────────────

const WORKLET_CODE = `
class ChunkProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) this.port.postMessage({ pcm: input.slice() });
    return true;
  }
}
registerProcessor("chunk-processor", ChunkProcessor);
`;

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useVAD({
  onChunk,
  stream:       externalStream,
  intervalMs     = VAD_DEFAULTS.intervalMs,
  overlapMs      = VAD_DEFAULTS.overlapMs,
  minBlobBytes   = VAD_DEFAULTS.minBlobBytes,
  wavSampleRate  = VAD_DEFAULTS.wavSampleRate,
  wavBitDepth    = VAD_DEFAULTS.wavBitDepth,
}: VADOptions) {
  const streamRef       = useRef<MediaStream | null>(null);
  const ownedStreamRef  = useRef(false);   // true only if we called getUserMedia — skip track stop if false
  const contextRef      = useRef<AudioContext | null>(null);
  const workletRef      = useRef<AudioWorkletNode | null>(null);
  const allPcmRef       = useRef<Float32Array[]>([]);  // full rolling PCM buffer from worklet
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef    = useRef<number>(0);           // wall-clock ms when recording started
  const lastFlushIdxRef = useRef<number>(0);           // sample index of last flush's end — used to compute overlap start

  const getSamplesPerMs = useCallback(() => wavSampleRate / 1000, [wavSampleRate]);

  const flush = useCallback(() => {
    const allBuffers = allPcmRef.current;
    if (allBuffers.length === 0) return;

    const totalSamples   = allBuffers.reduce((n, b) => n + b.length, 0);
    const overlapSamples = Math.floor(overlapMs * getSamplesPerMs());
    const startSample    = Math.max(0, lastFlushIdxRef.current - overlapSamples);
    const chunkStartTime = startTimeRef.current + Math.floor(startSample / getSamplesPerMs());
    const chunkLength    = totalSamples - startSample;
    if (chunkLength <= 0) return;

    const merged = new Float32Array(chunkLength);
    let writtenSamples = 0;
    let skippedSamples = 0;

    for (const buf of allBuffers) {
      if (skippedSamples + buf.length <= startSample) {
        skippedSamples += buf.length;
        continue;
      }
      const bufStart = Math.max(0, startSample - skippedSamples);
      const slice = buf.subarray(bufStart);
      merged.set(slice, writtenSamples);
      writtenSamples += slice.length;
      skippedSamples += buf.length;
    }

    lastFlushIdxRef.current = totalSamples;

    // Trim rolling buffer to just overlap window to avoid unbounded memory growth
    const keepSamples = overlapSamples * 2;
    if (totalSamples > keepSamples) {
      const trimmed  = new Float32Array(keepSamples);
      let written = 0, skipped = 0;
      const trimStart = totalSamples - keepSamples;
      for (const buf of allBuffers) {
        if (skipped + buf.length <= trimStart) { skipped += buf.length; continue; }
        const s = Math.max(0, trimStart - skipped);
        trimmed.set(buf.subarray(s), written);
        written += buf.length - s;
        skipped += buf.length;
      }
      allPcmRef.current      = [trimmed];
      lastFlushIdxRef.current = keepSamples;
    }

    const wav = encodeWav(merged, wavSampleRate, wavBitDepth);
    if (wav.size >= minBlobBytes) onChunk(wav, "audio/wav", chunkStartTime);
  }, [onChunk, overlapMs, getSamplesPerMs, wavSampleRate, wavBitDepth, minBlobBytes]);

  // Keep externalStream in a ref so it never appears in useCallback dep arrays.
  // This prevents start/stop/flush from being recreated when the parent re-renders.
  const externalStreamRef = useRef(externalStream);
  externalStreamRef.current = externalStream;

  const start = useCallback(async () => {
    startTimeRef.current = Date.now();

    // Resolve stream lazily — supports both direct value and getter
    const ext = externalStreamRef.current;
    const resolvedStream = typeof ext === "function" ? ext() : ext;

    let stream: MediaStream;
    if (resolvedStream) {
      stream = resolvedStream;
      streamRef.current      = stream;
      ownedStreamRef.current = false;
    } else {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current      = stream;
      ownedStreamRef.current = true;
    }

    const context = new AudioContext({ sampleRate: wavSampleRate });
    contextRef.current = context;

    const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
    const workletUrl = URL.createObjectURL(blob);
    await context.audioWorklet.addModule(workletUrl);
    URL.revokeObjectURL(workletUrl);

    const source     = context.createMediaStreamSource(stream);
    const workletNode = new AudioWorkletNode(context, "chunk-processor");
    workletRef.current = workletNode;

    workletNode.port.onmessage = ({ data }) => {
      if (data.pcm) allPcmRef.current.push(new Float32Array(data.pcm));
    };

    source.connect(workletNode);
    intervalRef.current = setInterval(flush, intervalMs);
  }, [flush, intervalMs, wavSampleRate]); // externalStream via ref — intentionally omitted

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    flush();
    workletRef.current?.disconnect();
    contextRef.current?.close();
    // Only stop tracks if we own the stream
    if (ownedStreamRef.current) {
      streamRef.current?.getTracks().forEach(t => t.stop());
    }
    streamRef.current       = null;
    contextRef.current      = null;
    workletRef.current      = null;
    allPcmRef.current       = [];
    lastFlushIdxRef.current = 0;
    ownedStreamRef.current  = false;
  }, [flush]);

  useEffect(() => () => stop(), [stop]);

  return { start, stop };
}