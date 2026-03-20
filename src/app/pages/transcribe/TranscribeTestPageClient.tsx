"use client";
// app/pages/transcribe/TranscribeTestPage.tsx
// Standalone test page for live transcription.
// No session, no peers, no WebRTC — just mic → whisper → text.
// Remove from routes before production or gate behind admin check.

import { useState, useRef, useCallback } from "react";
import { useVAD } from "@/app/hooks/useVAD";
import { arrayBufferToBase64 } from "@/lib/utils/encoding"
interface LogEntry {
  timestamp: number;
  type: "chunk" | "result" | "error" | "info";
  text: string;
  ms?: number;
}

// const SITE_KEY = "platform"; // swap for real siteKey if needed
// just use sitekey now

const MODELS = [
  { key: "whisper-tiny-en",        label: "Whisper Tiny EN",       cost: "$",    note: "free beta" },
  { key: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo",cost: "$$",   note: "recommended" },
  { key: "whisper",                label: "Whisper Base",          cost: "$$",   note: "" },
  { key: "nova-3",                 label: "Deepgram Nova 3",       cost: "$$$$", note: "highest quality" },
];

export default function TranscribeTestPageClient({ siteKey }: { siteKey: string }) {
  const [running, setRunning] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [chunkCount, setChunkCount] = useState(0);
  const [totalMs, setTotalMs] = useState(0);

  const [selectedModel, setSelectedModel] = useState("whisper-large-v3-turbo");

  const previousTextRef = useRef("");


  const addLog = useCallback((type: LogEntry["type"], text: string, ms?: number) => {
    setLog((prev) => [...prev, { timestamp: Date.now(), type, text, ms }]);
  }, []);

  // ── Send chunk to Worker ──────────────────────────────────────────────
  const sendChunk = useCallback(async (blob: Blob, mimeType: string) => {
    const chunkStart = Date.now();
    setChunkCount((n) => n + 1);
    addLog("chunk", `chunk received — ${(blob.size / 1024).toFixed(1)}KB ${mimeType}`);

    const arrayBuffer = await blob.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);


    try { 
      const res = await fetch("/api/qlave/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-site-key": siteKey,
        },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType,
          previousText: previousTextRef.current,
          language: "en",
          model: selectedModel,  // add this
        }),
      });

      const data = await res.json();
      const elapsed = Date.now() - chunkStart;
      setTotalMs((t) => t + elapsed);

      if (!data.ok) {
        addLog("error", `${data.error?.code}: ${data.error?.message}`, elapsed);
        return;
      }

      const { text } = data.result;
      if (!text) {
        addLog("info", "empty result (silence?)", elapsed);
        return;
      }

      previousTextRef.current = text.split(" ").slice(-10).join(" ");
      setTranscript((prev) => [...prev, text]);
      addLog("result", text, elapsed);
    } catch (e: any) {
      addLog("error", e.message);
    }
  }, [addLog]);

  // ── VAD ───────────────────────────────────────────────────────────────
  const { start, stop } = useVAD({
    onChunk: sendChunk,
    silenceThresholdMs: 300,
    maxChunkMs: 8000,    // set to 0 to disable forced flush
    rmsThreshold: 0.003,
  });

  const MAX_RECORDING_MS = 60_000; // 1 minute hard cap for test page

  const toggle = async () => {
    if (running) {
      stop();
      setRunning(false);
      addLog("info", "stopped");
    } else {
      setRunning(true);
      addLog("info", "started — speak now");
      await start();
      // Auto-stop after 1 minute
      setTimeout(() => {
        stop();
        setRunning(false);
        addLog("info", "auto-stopped — 1 minute limit reached");
      }, MAX_RECORDING_MS);
    }
  };

  const clear = () => {
    setTranscript([]);
    setLog([]);
    setChunkCount(0);
    setTotalMs(0);
    previousTextRef.current = "";
  };

  const avgMs = chunkCount > 0 ? Math.round(totalMs / chunkCount) : 0;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080810",
      color: "#ece8f8",
      fontFamily: "'DM Mono', monospace",
      padding: 32,
      display: "flex",
      flexDirection: "column",
      gap: 24,
      maxWidth: 900,
      margin: "0 auto",
    }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#a78bfa" }}>
          transcription test
        </h1>
        <span style={{ fontSize: 12, color: "#4a4660" }}>
          /transcribe-test
        </span>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: "flex", gap: 24, fontSize: 12, color: "#918caa" }}>
        <span>chunks: <b style={{ color: "#ece8f8" }}>{chunkCount}</b></span>
        <span>avg latency: <b style={{ color: avgMs < 1000 ? "#34d399" : avgMs < 2000 ? "#ffd700" : "#f87171" }}>{avgMs}ms</b></span>
        <span>status: <b style={{ color: running ? "#22c55e" : "#4a4660" }}>{running ? "● recording" : "○ idle"}</b></span>
      </div>

      {/* ── Models ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {MODELS.map(m => (
          <button
            key={m.key}
            onClick={() => setSelectedModel(m.key)}
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              background: selectedModel === m.key ? "rgba(124,58,237,0.3)" : "transparent",
              border: `1px solid ${selectedModel === m.key ? "rgba(124,58,237,0.6)" : "rgba(255,255,255,0.1)"}`,
              color: selectedModel === m.key ? "#a78bfa" : "#918caa",
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "inherit",
              display: "flex",
              gap: 6,
              alignItems: "center",
            }}
          >
            <span>{m.label}</span>
            <span style={{ color: "#fbbf24", letterSpacing: "-1px" }}>{m.cost}</span>
            {m.note && <span style={{ color: "#4a4660", fontSize: 10 }}>{m.note}</span>}
          </button>
        ))}
      </div>

      {/* ── Controls ── */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={toggle}
          style={{
            padding: "10px 24px",
            borderRadius: 8,
            background: running ? "rgba(248,113,113,0.15)" : "rgba(124,58,237,0.8)",
            border: running ? "1px solid rgba(248,113,113,0.4)" : "none",
            color: running ? "#f87171" : "#fff",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {running ? "■ stop" : "● start recording"}
        </button>
        <button
          onClick={clear}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#918caa",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          clear
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, flex: 1 }}>
        {/* ── Transcript ── */}
        <div style={{
          background: "#0d0d1a",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minHeight: 300,
          overflowY: "auto",
        }}>
          <div style={{ fontSize: 11, color: "#4a4660", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            transcript
          </div>
          {transcript.length === 0 && (
            <div style={{ color: "#4a4660", fontSize: 13, fontStyle: "italic" }}>
              speak to see transcript...
            </div>
          )}
          {transcript.map((line, i) => (
            <div key={i} style={{ fontSize: 14, lineHeight: 1.6, color: "#ece8f8" }}>
              {line}
            </div>
          ))}
        </div>

        {/* ── Debug log ── */}
        <div style={{
          background: "#0d0d1a",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 12,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minHeight: 300,
          overflowY: "auto",
          fontSize: 11,
        }}>
          <div style={{ color: "#4a4660", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            debug log
          </div>
          {log.map((entry, i) => (
            <div key={i} style={{
              display: "flex",
              gap: 8,
              color: entry.type === "result" ? "#34d399"
                   : entry.type === "error" ? "#f87171"
                   : entry.type === "chunk" ? "#a78bfa"
                   : "#918caa",
              lineHeight: 1.5,
            }}>
              <span style={{ color: "#4a4660", flexShrink: 0 }}>
                {new Date(entry.timestamp).toLocaleTimeString([], { hour12: false })}
              </span>
              <span style={{ color: "inherit" }}>[{entry.type}]</span>
              <span style={{ flex: 1, wordBreak: "break-word" }}>{entry.text}</span>
              {entry.ms !== undefined && (
                <span style={{ color: "#4a4660", flexShrink: 0 }}>{entry.ms}ms</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Full transcript export ── */}
      {transcript.length > 0 && (
        <button
          onClick={() => {
            const blob = new Blob([transcript.join("\n")], { type: "text/plain" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `transcript-${Date.now()}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          style={{
            alignSelf: "flex-start",
            padding: "8px 16px",
            borderRadius: 8,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#a78bfa",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          download transcript (.txt)
        </button>
      )}
    </div>
  );
}