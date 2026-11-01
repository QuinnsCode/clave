// src/app/hooks/qollab/useQollabWs.ts
// WebSocket connection to QollabWhiteboardDO.
// Handles connect, reconnect, message dispatch.
// All other hooks consume this via callbacks.

import { useEffect, useRef, useCallback, useState } from "react";
import type { WbObject, DocMeta } from "@/durableObjects/qollabWhiteboardDO";
import type { Capability } from "@/lib/qollab/capabilities";

// ── Message types from DO ─────────────────────────────────────────────────────

export type QollabMsg =
  | { type: "init";         objects: WbObject[]; docs: DocMeta[]; locked: boolean }
  | { type: "wb:upsert";   object: WbObject }
  | { type: "wb:delete";   id: string }
  | { type: "wb:clear" }
  | { type: "doc:created"; id: string; title: string; createdBy: string }
  | { type: "doc:updated"; id: string; content: string; peerId: string }
  | { type: "doc:renamed"; id: string; title: string }
  | { type: "doc:deleted"; id: string }
  | { type: "caps:updated"; caps: Capability[] }
  | { type: "caps:granted"; targetPeerId: string; caps: Capability[] }
  | { type: "caps:revoked"; targetPeerId: string; caps: Capability[] }
  | { type: "peer:left";   peerId: string }
  | { type: "session:locked" };

export type QollabMsgHandler = (msg: QollabMsg) => void;

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseQollabWsOptions {
  sessionId: string;
  peerId:    string;
  enabled:   boolean;
}

export interface UseQollabWsReturn {
  connected:   boolean;
  onMessage:   (handler: QollabMsgHandler) => () => void;
}

const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT      = 5;

export function useQollabWs({
  sessionId,
  peerId,
  enabled,
}: UseQollabWsOptions): UseQollabWsReturn {
  const wsRef           = useRef<WebSocket | null>(null);
  const handlersRef     = useRef<Set<QollabMsgHandler>>(new Set());
  const reconnectCount  = useRef(0);
  const unmountedRef    = useRef(false);
  const [connected, setConnected] = useState(false);

  const dispatch = useCallback((msg: QollabMsg) => {
    for (const handler of handlersRef.current) {
      try { handler(msg); } catch { /* handler error, continue */ }
    }
  }, []);

  const connect = useCallback(() => {
    if (!enabled || unmountedRef.current) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url   = `${proto}//${window.location.host}/__qollab/${sessionId}?peerId=${peerId}`;
    const ws    = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectCount.current = 0;
      setConnected(true);
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as QollabMsg;
        dispatch(msg);
      } catch { /* malformed message */ }
    };

    ws.onclose = () => {
      setConnected(false);
      if (unmountedRef.current) return;
      if (reconnectCount.current >= MAX_RECONNECT) return;
      reconnectCount.current++;
      setTimeout(connect, RECONNECT_DELAY_MS * reconnectCount.current);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sessionId, peerId, enabled, dispatch]);

  useEffect(() => {
    unmountedRef.current = false;
    if (enabled) connect();
    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [connect, enabled]);

  // Register a message handler, returns unsubscribe fn
  const onMessage = useCallback((handler: QollabMsgHandler): (() => void) => {
    handlersRef.current.add(handler);
    return () => { handlersRef.current.delete(handler); };
  }, []);

  return { connected, onMessage };
}