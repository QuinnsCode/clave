export type Status =
  | "idle"
  | "acquiring"
  | "connecting"
  | "ready"
  | "connected"
  | "error"
  | "disconnected";

export interface Peer {
  id: string;
  stream: MediaStream | null;
}

export interface SessionConfig {
  sessionId: string;
  peerId?: string;
  displayName?: string;
}

export interface SessionEvents {
  onStatusChange: (status: Status, error?: string) => void;
  onPeerJoined: (peer: Peer) => void;
  onPeerUpdated: (peer: Peer) => void;
  onPeerLeft: (peerId: string) => void;
  onLocalStream: (stream: MediaStream) => void;
}