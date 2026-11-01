// src/sdk/useQlaveCall.ts
// React binding for the headless engine. For apps that hold an eqosys token:
//
//   const res = await fetch("https://qlave.dev/api/v1/rooms", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
//   const { signalingUrl, iceServers } = await res.json();
//   const { peers, join, leave } = useQlaveCall({ signalingUrl, iceServers, localStream, name });
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { QlaveCall, type QlaveCallOptions, type RemotePeer, type CallState } from "./qlaveCall";

export function useQlaveCall(opts: QlaveCallOptions | null) {
  const callRef = useRef<QlaveCall | null>(null);
  const [state, setState] = useState<CallState>("idle");
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opts) return;
    const call = new QlaveCall(opts);
    callRef.current = call;
    const sync = () => setPeers(call.remotePeers);
    for (const t of ["peer-joined", "peer-stream", "peer-updated", "peer-left"]) call.addEventListener(t, sync);
    call.addEventListener("state", e => setState((e as CustomEvent).detail.state));
    call.addEventListener("error", e => setError((e as CustomEvent).detail.message));
    return () => { call.leave(); callRef.current = null; };
    // A new signaling URL means a new call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts?.signalingUrl]);

  const join = useCallback(() => callRef.current?.join(), []);
  const leave = useCallback(() => callRef.current?.leave(), []);
  return { call: callRef.current, state, peers, error, join, leave };
}
