"use client";
// src/app/components/Session/QollabPortal.tsx
// Opens Qollab in a new window — completely isolated from session.
// Zero impact on WebRTC peer connections.

import { useEffect, useRef } from "react";

interface Props {
  sessionId: string;
  peerId:    string;
  userId:    string | null;
  orgId:     string;
  onClose:   () => void;
}

export default function QollabPortal({ sessionId, peerId, userId, orgId, onClose }: Props) {
  const winRef = useRef<Window | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({
      peerId,
      ...(userId ? { userId } : {}),
      orgId,
    });

    const win = window.open(
      `/qollab/${sessionId}?${params}`,
      `qollab-${sessionId}`,
      "width=1280,height=860,noopener,noreferrer"
    );

    winRef.current = win;

    // Poll for window close — no postMessage needed
    const interval = setInterval(() => {
      if (win?.closed) {
        clearInterval(interval);
        onClose();
      }
    }, 500);

    return () => {
      clearInterval(interval);
      // Don't force-close on unmount — user may have it open intentionally
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}