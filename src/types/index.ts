// src/types/index.ts
// Single export surface for all platform types.
// Import from "@/types" everywhere — never from sub-files directly.

export type {
    SignalMessage,
    PeerInfo,
    SessionPlugin,
  } from "./session";
  
  export type {
    TranscribeInput,
    TranscribeResult,
    TranscribeError,
    TranscribeResponse,
    UsageRecord,
    TranscriptionTier,
    CaptionMessage,
  } from "./transcription";