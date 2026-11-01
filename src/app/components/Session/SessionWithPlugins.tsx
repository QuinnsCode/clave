"use client";
// src/app/pages/session/SessionWithPlugins.tsx

import { useCallback, useMemo, useState, useRef } from "react";
import SessionClient from "@/app/components/Session/SessionClient";
import { ChannelSetup } from "@/app/components/Session/ChannelSetup";
import { useTranscriptionPlugin } from "@/app/hooks/useTranscriptionPlugin";
import { useMultiChannel } from "@/app/hooks/useMultiChannel";
import { useRecordingStorage } from "@/app/hooks/useRecordingStorage";
import RecordingIndicator from "@/app/components/Session/RecordingIndicator";
import QollabPortal from "@/app/components/Session/QollabPortal";
import { Mic, PenLine } from "lucide-react";
import type { SessionPlugin } from "@/types";
import type { RecordingTier } from "@/lib/plugins/recording/types";
import type { TranscriptChunk } from "@/app/api/qlave/getInitialTranscript";
// NEW: resolved capability snapshot type. SessionPage reads this from the room
// and passes it down — it tells us which subsystems to actually run
// (specifically whether to spin up the audio-only recorder for diarization).
// Inlined to keep client bundle from pulling tiers.ts via the resolver chain.
// Source of truth is @/lib/qlave/qlaveCapabilities — keep these in sync.
interface SessionCapabilities {
  capture: {
    videoRecorder:  boolean;
    audioRecorder:  boolean;
    liveTranscribe: boolean;
  };
  postProcess: {
    diarize: boolean;
  };
  vocabulary: {
    enabled: false;
    learn:   false;
  };
}

interface Props {
  sessionId:         string;
  roomCode:          string;
  user:              { id?: string; name: string } | null;
  siteKey:           string | null;
  orgId:             string;
  recordingEnabled:  boolean;
  recordingTier:     RecordingTier;
  initialTranscript: TranscriptChunk[];
  // NEW: resolved per-session capability flags from the room snapshot.
  // Authoritative for what subsystems run — recordingEnabled above is kept
  // separate because it also gates the RecordingIndicator UI, while
  // capabilities.capture.audioRecorder gates the parallel audio MediaRecorder.
  capabilities:      SessionCapabilities;
}

export default function SessionWithPlugins({
  sessionId,
  roomCode,
  user,
  siteKey,
  orgId,
  recordingEnabled,
  recordingTier,
  initialTranscript,
  capabilities,
}: Props) {
  const peerIdRef          = useRef(crypto.randomUUID());
  const [showChannelSetup, setShowChannelSetup] = useState(false);
  const [qollabOpen,       setQollabOpen]       = useState(false);
  const wsRef              = useRef<WebSocket | null>(null);
  // Was never assigned before: multi-channel captions had no socket to send on.
  const onSocket           = useCallback((ws: WebSocket | null) => { wsRef.current = ws; }, []);

  const multiChannel = useMultiChannel({
    siteKey:      siteKey ?? "",
    getSessionWs: () => wsRef.current,
    enabled:      !!siteKey,
  });

  const transcription = useTranscriptionPlugin({
    siteKey:           siteKey ?? "",
    enabled:           !!siteKey,
    initialTranscript,
    extraChannels:     multiChannel.channels,
    extraCaptions:     multiChannel.captions,
    extraTranscript:   multiChannel.transcript,
  });

  const recording = useRecordingStorage({
    sessionId,
    roomCode,
    orgId,
    tier:        recordingTier,
    enabled:     recordingEnabled,
    displayName: user?.name ?? "Guest",
    // audio-only recorder gate — driven by capabilities snapshot resolved
    // server-side. When true, runs a second MediaRecorder for diarization.
    audioEnabled: capabilities.capture.audioRecorder,
  });

  const recordingPlugin = useMemo<SessionPlugin>(() => ({
    ...recording.plugin,
    renderControls: () => (
      <RecordingIndicator
        state={recording.state}
        tier={recordingTier}
        chunkCount={recording.chunkCount}
        enabled={recordingEnabled}
        audioEnabled={capabilities.capture.audioRecorder}
        audioChunkCount={recording.audioChunkCount}
      />
    ),
  }), [recording.state, recording.chunkCount, recording.audioChunkCount, recording.plugin, recordingTier, recordingEnabled, capabilities.capture.audioRecorder]);

  // Whiteboard plugin — kept intact, hidden from plugins array for now.
  // Re-add qollabPlugin to the plugins array below to restore the button.
  const qollabPlugin = useMemo<SessionPlugin>(() => ({
    renderControls: () => (
      <button
        onClick={() => setQollabOpen(o => !o)}
        title="Open Qollab whiteboard & docs"
        style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 48, height: 48, borderRadius: "50%",
          background:  qollabOpen ? "rgba(124,58,237,0.2)"          : "rgba(255,255,255,0.06)",
          border:      qollabOpen ? "1px solid rgba(124,58,237,0.4)" : "1px solid rgba(255,255,255,0.1)",
          color:       qollabOpen ? "#a78bfa"                        : "#ece8f8",
          cursor: "pointer", transition: "all 0.15s",
        }}
      >
        <PenLine size={20} />
      </button>
    ),
  }), [qollabOpen]);

  const plugins = useMemo(() => [
    transcription,
    // Include recording plugin when video OR audio recording is active.
    // audioEnabled can be true even when recordingEnabled is false (diarize-only).
    ...(recordingEnabled || capabilities.capture.audioRecorder ? [recordingPlugin] : []),
    // qollabPlugin — hidden for now, restore by adding it back here
  ], [transcription, recordingEnabled, capabilities.capture.audioRecorder, recordingPlugin]);

  const renderLobbyExtra = useCallback(() => {
    if (!siteKey) return null;
    return (
      <button
        onClick={() => setShowChannelSetup(true)}
        style={{
          padding: "9px 20px", borderRadius: 8,
          background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)",
          color: "#a78bfa", fontSize: 13, cursor: "pointer",
          fontFamily: "'DM Sans', system-ui, sans-serif",
          display: "flex", alignItems: "center", gap: 7,
        }}
      >
        <Mic size={14} /> Multi-channel setup
      </button>
    );
  }, [siteKey]);

  return (
    <>
      {showChannelSetup && (
        <ChannelSetup
          devices={multiChannel.devices}
          channels={multiChannel.channels}
          atCapacity={multiChannel.atCapacity}
          onAdd={multiChannel.addChannel}
          onRemove={multiChannel.removeChannel}
          onRename={multiChannel.renameChannel}
          onRefresh={multiChannel.refreshDevices}
          onDone={() => setShowChannelSetup(false)}
          onSkip={() => { multiChannel.stopAll(); setShowChannelSetup(false); }}
        />
      )}

      <SessionClient
        sessionId={sessionId}
        roomCode={roomCode}
        user={user}
        plugins={plugins}
        renderLobbyExtra={renderLobbyExtra}
        siteKey={siteKey ?? ""}
        peerId={peerIdRef.current}
        onSourceSwitch={recording.switchStream}
        onSocket={onSocket}
      />

      {qollabOpen && (
        <QollabPortal
          sessionId={sessionId}
          peerId={peerIdRef.current}
          userId={user?.id ?? null}
          orgId={orgId}
          onClose={() => setQollabOpen(false)}
        />
      )}
    </>
  );
}