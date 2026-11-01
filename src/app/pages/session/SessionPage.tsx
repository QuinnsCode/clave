// src/app/pages/session/SessionPage.tsx
// RSC — resolves room, reads owner's plugin permissions from KV snapshot,
// passes siteKey only if transcription is enabled for this room.
// Visitors (guests or logged-in) inherit the room owner's feature set.

import { AppContext } from "@/worker";
import SessionWithPlugins from "@/app/components/Session/SessionWithPlugins";
import { resolveRoom } from "@/lib/qlave/roomCode";
import { resolveRoomPlugins } from "@/lib/qlave/resolveRoomPlugins";
import { getInitialTranscript } from "@/app/api/qlave/getInitialTranscript";
// NEW: capabilities live in the room snapshot for new rooms. For legacy rooms
// without a snapshot we derive a sensible default (no diarization, audio
// bundled with video). This guarantees nothing breaks for in-flight sessions.
import { deriveCapabilitiesFromLegacyRoom } from "@/lib/qlave/qlaveCapabilities";
import { Drum } from "lucide-react";

export default async function SessionPage({
  ctx,
  params,
}: {
  ctx: AppContext;
  params: { code?: string };
}) {
  if (!params.code) {
    return new Response(null, {
      status: 302,
      headers: { Location: ctx.user ? "/dashboard" : "/user/login" },
    });
  }

  const room = await resolveRoom(params.code);

  if (!room) {
    return (
      <div style={{
        minHeight: "100vh", background: "#080810", color: "#ece8f8",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', system-ui, sans-serif", gap: 16, padding: 40,
      }}>
        <a href="/" style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "4px 12px", borderRadius: 100,
          background: "linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6)",
          fontSize: 13, fontWeight: 600, color: "#fff", textDecoration: "none",
          marginBottom: 24,
        }}>
          <Drum size={13} strokeWidth={2.5} /> qlave
        </a>
        <h1 style={{ fontSize: 24, fontWeight: 600 }}>This room has expired</h1>
        <p style={{ fontSize: 14, color: "#918caa", textAlign: "center", maxWidth: 380, lineHeight: 1.6 }}>
          The room <code style={{ fontFamily: "monospace", color: "#a78bfa" }}>{params.code}</code> existed
          but has since expired. Rooms are valid for 24 hours after creation.
        </p>
        <a href="/dashboard" style={{
          marginTop: 8, padding: "10px 24px", borderRadius: 8,
          background: "#7c3aed", color: "#fff", fontSize: 14, fontWeight: 500, textDecoration: "none",
        }}>
          Back to dashboard
        </a>
      </div>
    );
  }

  const [{ orgId, siteKey, recordingEnabled, recordingTier }, initialTranscript] =
    await Promise.all([
      resolveRoomPlugins(room, ctx.user?.id),
      getInitialTranscript(room.sessionId),
    ]);

  // NEW: resolve the session capabilities. New rooms have a snapshot from
  // createRoom (room.plugins.capabilities). Legacy rooms (created before this
  // change) don't — we rebuild a back-compatible default from the existing
  // transcription/recording blocks, with diarize forced off (since they never
  // recorded an audio-only track for it to consume).
  const capabilities = room.plugins.capabilities
    ?? deriveCapabilitiesFromLegacyRoom({
         transcription: room.plugins.transcription,
         recording:     room.plugins.recording,
       });

  const user = ctx.user
    ? { name: ctx.user.name ?? ctx.user.email ?? "Guest" }
    : null;

  return (
    <SessionWithPlugins
      sessionId={room.sessionId}
      roomCode={params.code}
      user={user}
      siteKey={siteKey}
      orgId={orgId}
      recordingEnabled={recordingEnabled}
      recordingTier={recordingTier}
      initialTranscript={initialTranscript}
      // NEW: pass the resolved capabilities so the client knows which hooks
      // to activate (specifically whether to start the audio-only recorder
      // for diarization).
      capabilities={capabilities}
    />
  );
}