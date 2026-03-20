// src/durableObjects/userSessionDO.ts

import { DurableObject } from "cloudflare:workers";
import { mergeSettings, sanitizeSettings } from "@/lib/userSettings";
import type { UserSettings } from "@/lib/userSettings";

interface UserSessionState {
  userId:      string;
  presence:    "online" | "away" | "offline";
  lastActive:  number;
}

type WebSocketMessage =
  | { type: "logout_all" }
  | { type: "update_presence"; presence: "online" | "away" | "offline" }
  | { type: "ping" }
  | { type: "sync_state" }
  | { type: "get_settings" }
  | { type: "update_settings"; settings: any };

export class UserSessionDO extends DurableObject {
  private userId: string | null = null;
  private state:  DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url    = new URL(request.url);
    const action = url.searchParams.get("action");
  
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocketUpgrade(request);
    }
  
    if (action === "state")  return this.getState();
    if (action === "clear")  { await this.clearState(); return Response.json({ ok: true }); }
    if (action === "tier-updated" && request.method === "POST") {
      this.broadcastToAllDevices({ type: "tier_updated" });
      return Response.json({ ok: true });
    }
  
    if (action === "settings" && request.method === "GET") {
      const stored = await this.state.storage.get<UserSettings>("settings");
      return Response.json({ ok: true, settings: mergeSettings(stored ?? null) });
    }
  
    if (action === "settings" && request.method === "POST") {
      const body   = await request.json() as any;
      const patch  = sanitizeSettings(body);
      const stored = await this.state.storage.get<UserSettings>("settings");
      const merged = mergeSettings({ ...(stored ?? {}), ...patch, room: { ...(stored?.room ?? {}), ...(patch.room ?? {}) } });
      await this.state.storage.put("settings", merged);
      this.broadcastToAllDevices({ type: "settings_updated", settings: merged });
      return Response.json({ ok: true, settings: merged });
    }
  
    return new Response("Not found", { status: 404 });
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url      = new URL(request.url);
    const userId   = url.searchParams.get("userId");
    const deviceId = url.searchParams.get("deviceId") || "unknown";

    if (!userId) return new Response("Missing userId", { status: 400 });
    this.userId = userId;

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server, [deviceId]);

    // Send initial state + settings on connect
    const [state, stored] = await Promise.all([
      this.loadState(),
      this.state.storage.get<UserSettings>("settings"),
    ]);

    server.send(JSON.stringify({
      type:     "initial_state",
      ...state,
      settings: mergeSettings(stored ?? null),
      deviceId,
    }));

    server.accept();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    try {
      const data     = JSON.parse(message as string) as WebSocketMessage;
      const [deviceId] = this.state.getTags(ws);

      switch (data.type) {
        case "logout_all":
          await this.handleLogoutAll();
          break;

        case "update_presence":
          await this.handleUpdatePresence(data.presence);
          break;

        case "ping":
          ws.send(JSON.stringify({ type: "pong" }));
          break;

        case "sync_state": {
          const state   = await this.loadState();
          const stored  = await this.state.storage.get<UserSettings>("settings");
          ws.send(JSON.stringify({ type: "state", ...state, settings: mergeSettings(stored ?? null) }));
          break;
        }

        case "get_settings": {
          const stored   = await this.state.storage.get<UserSettings>("settings");
          ws.send(JSON.stringify({ type: "settings", settings: mergeSettings(stored ?? null) }));
          break;
        }

        case "update_settings": {
          const patch  = sanitizeSettings(data.settings);
          const stored = await this.state.storage.get<UserSettings>("settings");
          const merged = mergeSettings({
            ...(stored ?? {}),
            ...patch,
            room: { ...(stored?.room ?? {}), ...(patch.room ?? {}) },
          });
          await this.state.storage.put("settings", merged);
          this.broadcastToAllDevices({ type: "settings_updated", settings: merged });
          break;
        }

        default:
          console.warn("[UserSessionDO] Unknown message type:", (data as any).type);
      }

      await this.state.storage.put("lastActive", Date.now());
    } catch (error) {
      console.error("[UserSessionDO] Error:", error);
      ws.send(JSON.stringify({ type: "error", message: "Failed to process message" }));
    }
  }

  async webSocketClose(ws: WebSocket) {
    const connectedDevices = this.state.getWebSockets();
    if (connectedDevices.length === 0) {
      await this.state.storage.put("presence", "offline");
    }
  }

  private async handleLogoutAll() {
    this.state.getWebSockets().forEach(ws => ws.close(1000, "Logged out from all devices"));
    await this.clearState();
  }

  private async handleUpdatePresence(presence: "online" | "away" | "offline") {
    await this.state.storage.put("presence", presence);
    this.broadcastToAllDevices({ type: "presence_updated", presence });
  }

  private broadcastToAllDevices(message: any) {
    const data = JSON.stringify(message);
    this.state.getWebSockets().forEach(ws => {
      try { ws.send(data); } catch { /* closing */ }
    });
  }

  private async loadState(): Promise<UserSessionState> {
    const [presence, lastActive] = await Promise.all([
      this.state.storage.get<"online" | "away" | "offline">("presence"),
      this.state.storage.get<number>("lastActive"),
    ]);
    return {
      userId:     this.userId ?? "",
      presence:   presence   ?? "offline",
      lastActive: lastActive ?? Date.now(),
    };
  }

  private async getState(): Promise<Response> {
    const state            = await this.loadState();
    const stored           = await this.state.storage.get<UserSettings>("settings");
    const connectedDevices = this.state.getWebSockets().length;
    return Response.json({ ...state, settings: mergeSettings(stored ?? null), connectedDevices });
  }

  private async clearState(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}