// src/lib/qlave/ice.ts
// ICE servers for a call. STUN alone fails for peers behind symmetric NAT /
// corporate firewalls; Cloudflare Realtime TURN relays those calls.
//
// Env (both secrets, from Dashboard → Realtime → TURN):
//   TURN_KEY_ID, TURN_KEY_API_TOKEN
// Without them we fall back to the bundled list in src/lib/webrtc/iceServers.ts.

import { env } from "cloudflare:workers";
import { ICE_SERVERS } from "@/lib/webrtc/iceServers";

// Fallback: the bundled list (STUN + openrelay's free public TURN, which is shared and rate-limited).
const STUN_ONLY: RTCIceServer[] = ICE_SERVERS.iceServers;

export async function getIceServers(ttlSeconds = 4 * 60 * 60): Promise<{ iceServers: RTCIceServer[]; turn: boolean }> {
  const keyId = (env as any).TURN_KEY_ID as string | undefined;
  const token = (env as any).TURN_KEY_API_TOKEN as string | undefined;
  if (!keyId || !token) return { iceServers: STUN_ONLY, turn: false };

  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ttl: ttlSeconds }),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const data = await res.json() as { iceServers: RTCIceServer[] | RTCIceServer };
    const list = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers];
    // Browsers time out on port 53; Cloudflare's docs recommend dropping those URLs.
    const iceServers = list.map(s => ({
      ...s,
      urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(u => !/:53(\?|$)/.test(u)),
    }));
    return { iceServers, turn: true };
  } catch (e) {
    console.error("[qlave] TURN credentials failed, STUN only:", e);
    return { iceServers: STUN_ONLY, turn: false };
  }
}
