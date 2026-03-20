// src/types/session.ts
// Session, plugin, and peer types.
// Used by: SessionClient, all plugins, DO signal handler.

import type { ReactNode } from "react";

export interface SignalMessage {
  type:
    | "join"
    | "joined"
    | "peer-joined"
    | "peer-left"
    | "offer"
    | "answer"
    | "ice-candidate"
    | "mute-state"
    | "caption"
    | "error";
  peerId?: string;
  peers?: string[];
  peerNames?: Record<string, string>; // peerId → displayName, sent with "joined"
  name?: string;                      // display name, sent with "join" + "peer-joined"
  from?: string;
  to?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  audioMuted?: boolean;
  videoMuted?: boolean;
  // caption fields
  text?: string;
  timestamp?: number;
  isFinal?: boolean;
  message?: string;
}

export interface PeerInfo {
  peerId: string;
  displayName: string;
  stream: MediaStream | null;
}

export interface SessionPlugin {
  // lifecycle
  onJoin?: (ws: WebSocket, peerId: string, stream: MediaStream) => void;
  onLeave?: () => void;

  // message bus — return true to consume (prevents default handling)
  onMessage?: (msg: SignalMessage) => boolean | void;

  // peer events
  onPeerJoined?: (peer: PeerInfo) => void;
  onPeerLeft?: (peerId: string) => void;
  onPeerStreamUpdated?: (peer: PeerInfo) => void;

  // render slots
  renderControls?: () => ReactNode;  // extra buttons in controls bar
  renderOverlay?: () => ReactNode;   // floats over tile grid
  renderPanel?: () => ReactNode;     // side/bottom panel
}