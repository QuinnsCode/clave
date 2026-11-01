"use client";
// src/app/components/pods/PodCard.tsx
//
// Simpler card per R1.5 anchors revision. Shows just:
//   - Pod name
//   - Last-edited date (updatedAt)
//   - Tiny counts (sessions + anchors) as muted footer text
//
// Whole card is clickable → opens PodDetailModal with rename, anchor
// management, sessions, and delete inside.
//
// CHANGED (pods sessions pass) — accepts organizationId prop and passes
// it to PodDetailModal so sessions can be loaded correctly.

import { useState } from "react";
import type { PodListItem } from "@/lib/pods/podsService";
import PodDetailModal from "@/app/components/pods/PodDetailModal";

const CSS = `
.pc-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  display: flex; flex-direction: column; gap: 8px;
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
}
.pc-card:hover {
  border-color: var(--border-p);
  background: var(--bg-3);
  transform: translateY(-1px);
}
.pc-card:active { transform: translateY(0); }

.pc-name {
  font-size: 15px; font-weight: 500; color: var(--text);
  word-break: break-word; line-height: 1.3;
}
.pc-date { font-size: 11px; color: var(--text-3); font-family: var(--mono); }
.pc-meta {
  display: flex; gap: 10px;
  font-size: 10px; color: var(--text-3);
  font-family: var(--mono); letter-spacing: 0.03em;
  text-transform: uppercase; margin-top: 2px;
}
.pc-meta-dot { color: var(--text-3); opacity: 0.4; }
`;

function formatDate(d: Date): string {
  const date = new Date(d);
  const now  = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day:   "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

interface Props {
  pod:            PodListItem;
  organizationId: string;
}

export default function PodCard({ pod, organizationId }: Props) {
  const [open,     setOpen]     = useState(false);
  const [localPod, setLocalPod] = useState<PodListItem>(pod);

  return (
    <>
      <style>{CSS}</style>

      <div
        className="pc-card"
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="pc-name">{localPod.name}</div>
        <div className="pc-date">Updated {formatDate(localPod.updatedAt)}</div>
        <div className="pc-meta">
          <span>{localPod.sessionCount} {localPod.sessionCount === 1 ? "session" : "sessions"}</span>
          <span className="pc-meta-dot">·</span>
          <span>{localPod.anchorCount} {localPod.anchorCount === 1 ? "anchor" : "anchors"}</span>
        </div>
      </div>

      {open && (
        <PodDetailModal
          pod={localPod}
          organizationId={organizationId}
          onClose={() => setOpen(false)}
          onPodMutated={(next) => {
            if (next.name) {
              setLocalPod(p => ({ ...p, name: next.name!, updatedAt: new Date() }));
            }
          }}
          onPodDeleted={() => {
            window.location.reload();
          }}
        />
      )}
    </>
  );
}