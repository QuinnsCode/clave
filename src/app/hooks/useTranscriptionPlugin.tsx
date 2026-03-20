"use client";
// src/app/hooks/useTranscriptionPlugin.tsx

import { useState, useCallback, useRef, useEffect } from "react";
import { AudioWaveform, NotebookPen } from "lucide-react";
import { useTranscribe } from "@/app/hooks/useTranscribe";
import { SessionMixer, getChannelColor } from "@/app/components/Session/SessionMixer";
import type { SessionPlugin, SignalMessage, PeerInfo } from "@/types";
import type { CaptionMessage } from "@/lib/transcription";

interface TranscriptionPluginOptions {
  siteKey:          string;
  enabled?:         boolean;
  extraChannels?:   { id: string; label: string; stream: MediaStream | null; color: string }[];
  extraCaptions?:   Record<string, string>;
  extraTranscript?: { channelId: string; label: string; text: string; timestamp: number }[];
}

export function useTranscriptionPlugin({
  siteKey,
  enabled = true,
  extraChannels   = [],
  extraCaptions   = {},
  extraTranscript = [],
}: TranscriptionPluginOptions): SessionPlugin {
  // Both false on server — no hydration mismatch
  const [showMixer,      setShowMixer]      = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [mounted,        setMounted]        = useState(false);

  const [peers, setPeers]               = useState<PeerInfo[]>([]);

  const wsRef     = useRef<WebSocket | null>(null);
  const peerIdRef = useRef<string>("");

  useEffect(() => { setMounted(true); }, []);

  const {
    captions,
    liveText,
    transcript,
    capReached,
    start,
    stop,
    handleIncomingCaption,
    downloadTranscript,
  } = useTranscribe({
    siteKey,
    getPeerId:      () => peerIdRef.current,
    getDisplayName: () => peers.find(p => p.peerId === peerIdRef.current)?.displayName ?? peerIdRef.current,
    getSessionWs:   () => wsRef.current,
    enabled,
  });

  const getChannels = useCallback(() => {
    const peerChannels = peers.map((p, i) => ({
      peerId:      p.peerId,
      displayName: p.displayName,
      stream:      p.stream,
      color:       getChannelColor(i),
    }));
    const extra = extraChannels.map(c => ({
      peerId:      c.id,
      displayName: c.label,
      stream:      c.stream,
      color:       c.color,
    }));
    return [...peerChannels, ...extra];
  }, [peers, extraChannels]);

  const onJoin: SessionPlugin["onJoin"] = useCallback((ws, peerId, stream) => {
    wsRef.current     = ws;
    peerIdRef.current = peerId;
    setPeers([{ peerId, displayName: "You", stream }]);
    start(stream ?? undefined); // pass existing stream — avoids double getUserMedia
  }, [start]);

  const onLeave: SessionPlugin["onLeave"] = useCallback(() => {
    stop();
    wsRef.current = null;
  }, [stop]);

  const onMessage: SessionPlugin["onMessage"] = useCallback((msg: SignalMessage) => {
    if (msg.type === "caption") {
      handleIncomingCaption(msg as CaptionMessage);
      return true;
    }
  }, [handleIncomingCaption]);

  const onPeerJoined: SessionPlugin["onPeerJoined"] = useCallback((peer: PeerInfo) => {
    setPeers(prev => prev.find(p => p.peerId === peer.peerId) ? prev : [...prev, peer]);
  }, []);

  const onPeerLeft: SessionPlugin["onPeerLeft"] = useCallback((peerId: string) => {
    setPeers(prev => prev.filter(p => p.peerId !== peerId));
  }, []);

  const onPeerStreamUpdated: SessionPlugin["onPeerStreamUpdated"] = useCallback((peer: PeerInfo) => {
    setPeers(prev => prev.map(p => p.peerId === peer.peerId ? peer : p));
  }, []);

  // ── Control buttons ───────────────────────────────────────────────────────

  const renderControls = useCallback(() => {
    if (!mounted) return null;
    return (
      <>
        <button
          className={`ctrl-btn ${showMixer ? "active" : ""}`}
          onClick={() => setShowMixer(v => !v)}
          title={showMixer ? "Hide mixer" : "Show mixer"}
        >
          <AudioWaveform size={20} />
        </button>
        <button
          className={`ctrl-btn ${showTranscript ? "active" : ""}`}
          onClick={() => setShowTranscript(v => !v)}
          title={showTranscript ? "Hide transcript" : "Show transcript"}
        >
          <NotebookPen size={20} />
        </button>
      </>
    );
  }, [mounted, showMixer, showTranscript]);

  // ── Panel ─────────────────────────────────────────────────────────────────

  const renderOverlay = useCallback(() => {
    if (!mounted) return null;
    if (!showMixer && !showTranscript) return null;
    return (
      <SessionMixer
        channels={getChannels()}
        liveText={liveText}
        transcript={[
          ...transcript,
          ...extraTranscript.map(l => ({ peerId: l.channelId, text: l.text, timestamp: l.timestamp })),
        ].sort((a, b) => a.timestamp - b.timestamp)}
        captions={{ ...captions, ...Object.fromEntries(Object.entries(extraCaptions).map(([k, v]) => [k, { text: v, timestamp: Date.now() }])) }}
        isRoomMaker={true}
        showMixer={showMixer}
        showTranscript={showTranscript}
        onCloseMixer={() => setShowMixer(false)}
        onExport={downloadTranscript}
        capReached={capReached}
      />
    );
  // renderOverlay dep array
  }, [mounted, showMixer, showTranscript, getChannels, liveText, transcript, captions, extraTranscript, extraCaptions, downloadTranscript, capReached]);

  return {
    onJoin,
    onLeave,
    onMessage,
    onPeerJoined,
    onPeerLeft,
    onPeerStreamUpdated,
    renderControls,
    renderOverlay,
  };
}