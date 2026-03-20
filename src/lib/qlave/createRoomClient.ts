// src/lib/qlave/createRoomClient.ts
// Client-side utility — calls the createRoom API route.
// Use this anywhere on the client that needs to create a room.

import type { RoomConfig } from "@/lib/qlave/roomCode";

export async function createRoomClient(config?: RoomConfig): Promise<string | null> {
  try {
    const res  = await fetch("/api/qlave/createRoom", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ config: config ?? null }),
    });
    const data = await res.json() as { url?: string };
    return data.url ?? null;
  } catch {
    return null;
  }
}