"use client";
// src/app/pages/session/SessionWithPlugins.tsx

import { useState, useCallback, useRef } from "react";
import SessionClient from "@/app/components/Session/SessionClient";
import { ChannelSetup } from "@/app/components/Session/ChannelSetup";
import { useTranscriptionPlugin } from "@/app/hooks/useTranscriptionPlugin";
import { useMultiChannel } from "@/app/hooks/useMultiChannel";
import { useRecordingStorage } from "@/app/hooks/useRecordingStorage";
import RecordingIndicator from "@/app/components/Session/RecordingIndicator";
import { Mic } from "lucide-react";
import type { SessionPlugin } from "@/types";
import type { RecordingTier } from "@/lib/plugins/recording/types";

interface Props {
  sessionId:        string;
  roomCode:         string;
  user:             { name: string } | null;
  siteKey:          string | null;
  orgId:            string;
  recordingEnabled: boolean;
  recordingTier:    RecordingTier;
}

export default function SessionWithPlugins({
  sessionId,
  roomCode,
  user,
  siteKey,
  orgId,
  recordingEnabled,
  recordingTier,
}: Props) {
  const [showChannelSetup, setShowChannelSetup] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const multiChannel = useMultiChannel({
    siteKey:      siteKey ?? "",
    getSessionWs: () => wsRef.current,
    enabled:      !!siteKey,
  });

  const transcription = useTranscriptionPlugin({
    siteKey:         siteKey ?? "",
    enabled:         !!siteKey,
    extraChannels:   multiChannel.channels,
    extraCaptions:   multiChannel.captions,
    extraTranscript: multiChannel.transcript,
  });

  const recording = useRecordingStorage({
    sessionId,
    roomCode,
    orgId,
    tier:        recordingTier,
    enabled:     recordingEnabled,
    displayName: user?.name ?? "Guest",
  });

  // Attach renderControls here in .tsx where JSX is allowed
  const recordingPlugin: SessionPlugin = {
    ...recording.plugin,
    renderControls: () => (
      <RecordingIndicator
        state={recording.state}
        tier={recordingTier}
        chunkCount={recording.chunkCount}
        enabled={recordingEnabled}
      />
    ),
  };

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

  const plugins = [
    transcription,
    ...(recordingEnabled ? [recordingPlugin] : []),
  ];

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
      />
    </>
  );
}