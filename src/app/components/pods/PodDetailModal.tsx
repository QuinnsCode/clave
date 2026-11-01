"use client";
// src/app/components/pods/PodDetailModal.tsx
//
// Client wrapper that adds modal chrome around PodDetailView.
//
// CHANGED (R1.5 no-loop pass) — anchors are now passed through as a prop
// (server-rendered into the initial /pods payload). NO more useEffect to
// fetch them on open. The modal is now pure: props in → JSX out.
//
// CHANGED (pods sessions pass) — loads initialSessions on open via
// useEffect so PodSessionsSection has data immediately without a
// client-side fetch inside the section itself.
//
// Side effects kept:
//   - Esc key listener (genuine client-only behavior)
//   - Backdrop click handler (genuine client-only behavior)
//   - Sessions load on open (one-time fetch when modal mounts)
//
// PodDetailView is the actual content — kept separate so it can be lifted
// to a standalone /pods/:slug page later without modal chrome.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { PodListItem } from "@/lib/pods/podsService";
import type { PodSessionItem } from "@/lib/pods/podSessionsService";
import { getPodSessions } from "@/app/serverActions/pods/podSessions";
import PodDetailView from "@/app/components/pods/PodDetailView";

interface Props {
  pod:             PodListItem;
  organizationId:  string;
  onClose:         () => void;
  onPodMutated?:   (next: { name?: string }) => void;
  onPodDeleted?:   () => void;
}

const CSS = `
.pdm-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  animation: pdmFade 0.15s ease;
}
@keyframes pdmFade { from { opacity: 0; } to { opacity: 1; } }

.pdm-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 560px;
  max-height: calc(100vh - 48px);
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  animation: pdmScale 0.16s ease;
}
@keyframes pdmScale {
  from { transform: scale(0.97); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}

.pdm-close-bar {
  display: flex; justify-content: flex-end;
  padding: 10px 12px 0;
}
.pdm-close {
  background: transparent; border: none; color: var(--text-3);
  padding: 4px; border-radius: 5px; cursor: pointer;
  display: inline-flex; align-items: center;
}
.pdm-close:hover { background: var(--bg-3); color: var(--text); }

.pdm-body {
  padding: 4px 22px 22px;
  overflow-y: auto;
}
`;

export default function PodDetailModal({
  pod,
  organizationId,
  onClose,
  onPodMutated,
  onPodDeleted,
}: Props) {
  const [initialSessions, setInitialSessions] = useState<PodSessionItem[]>([]);

  // Esc to close — client-only behavior, useEffect is the right tool here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Load sessions once when modal opens — one-time mount fetch.
  // PodSessionsSection manages subsequent refreshes (add/remove) itself.
  useEffect(() => {
    getPodSessions(pod.id, organizationId).then(setInitialSessions).catch(() => {});
  }, [pod.id, organizationId]);

  return (
    <div className="pdm-overlay" onClick={onClose}>
      <style>{CSS}</style>
      <div className="pdm-card" onClick={e => e.stopPropagation()}>

        <div className="pdm-close-bar">
          <button className="pdm-close" onClick={onClose} title="Close (Esc)">
            <X size={15}/>
          </button>
        </div>

        <div className="pdm-body">
          <PodDetailView
            pod={pod}
            organizationId={organizationId}
            initialSessions={initialSessions}
            onPodMutated={onPodMutated}
            onPodDeleted={onPodDeleted}
          />
        </div>

      </div>
    </div>
  );
}