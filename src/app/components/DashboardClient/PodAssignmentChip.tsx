"use client";
// src/app/components/DashboardClient/PodAssignmentChip.tsx
//
// Drawer leaf. Small chip showing the current pod name. Click → dropdown of
// all available pods + "Create new pod" + the current selection highlighted.
// Pick one → calls assignSessionToPod server action.
//
// Receives `pods` + `currentPodId` as props from the parent server component
// (no client-side fetch). The drawer's server-side parent loads pods alongside
// the diarization data and passes them down.

import { useState, useRef, useEffect, useTransition } from "react";
import { Plus, Check, ChevronDown } from "lucide-react";
import { assignSessionToPod } from "@/app/serverActions/pods/assignSessionToPod";
import { createPod } from "@/app/serverActions/pods/createPod";

interface PodOption {
  id:   string;
  name: string;
}

interface Props {
  sessionLogId:  string;       // QlaveSessionLog.id — what we reassign
  currentPodId:  string | null;
  currentPodName: string | null;
  pods:          PodOption[];
}

const CSS = `
.pac-wrap { position: relative; display: inline-block; }

.pac-chip {
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text-2);
  padding: 4px 8px 4px 10px;
  border-radius: 100px;
  font-size: 11px;
  font-family: var(--mono);
  display: inline-flex; align-items: center; gap: 4px;
  cursor: pointer;
  transition: all 0.15s;
  max-width: 200px;
}
.pac-chip:hover { border-color: var(--border-p); color: var(--text); }
.pac-chip-name {
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pac-chip svg { color: var(--text-3); }

.pac-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 250;
  background: var(--bg-2);
  border: 1px solid var(--border-p);
  border-radius: 8px;
  padding: 4px;
  min-width: 220px;
  max-height: 320px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 1px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.4);
}
.pac-item {
  background: transparent; border: none;
  color: var(--text-2);
  text-align: left;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  display: flex; align-items: center; justify-content: space-between; gap: 6px;
  font-family: inherit;
}
.pac-item:hover { background: var(--bg-3); color: var(--text); }
.pac-item.current { color: var(--purple-l); }
.pac-item .pac-item-check { color: var(--purple-l); }

.pac-divider {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

.pac-create {
  background: transparent; border: none;
  color: var(--purple-l);
  text-align: left;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  display: flex; align-items: center; gap: 6px;
  font-family: inherit;
}
.pac-create:hover { background: var(--purple-g2, rgba(155,108,255,0.1)); }

.pac-error { font-size: 11px; color: var(--red, #f87171); padding: 4px 10px; }
`;

export default function PodAssignmentChip({
  sessionLogId, currentPodId, currentPodName, pods,
}: Props) {
  const [open, setOpen]            = useState(false);
  const [localPods, setLocalPods]  = useState<PodOption[]>(pods);
  const [activeId, setActiveId]    = useState<string | null>(currentPodId);
  const [activeName, setActiveName] = useState<string | null>(currentPodName);
  const [error, setError]          = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pickPod(pod: PodOption) {
    if (pod.id === activeId) { setOpen(false); return; }
    setError(null);

    // Optimistic — show new pod immediately
    const previousId = activeId;
    const previousName = activeName;
    setActiveId(pod.id);
    setActiveName(pod.name);
    setOpen(false);

    startTransition(async () => {
      const result = await assignSessionToPod(sessionLogId, pod.id);
      if (!result.ok) {
        setActiveId(previousId);
        setActiveName(previousName);
        setError(result.error ?? "Could not switch pod");
      }
    });
  }

  function createAndAssign() {
    setError(null);
    startTransition(async () => {
      const created = await createPod();
      if (!created.ok || !created.data) {
        setError(created.error ?? "Could not create pod");
        return;
      }
      const newPod = { id: created.data.id, name: created.data.name };
      setLocalPods(p => [newPod, ...p]);

      // Immediately assign the session to the new pod
      const previousId = activeId;
      const previousName = activeName;
      setActiveId(newPod.id);
      setActiveName(newPod.name);
      setOpen(false);

      const assigned = await assignSessionToPod(sessionLogId, newPod.id);
      if (!assigned.ok) {
        setActiveId(previousId);
        setActiveName(previousName);
        setError(assigned.error ?? "Could not assign new pod");
      }
    });
  }

  const displayName = activeName ?? "No pod";

  return (
    <div className="pac-wrap" ref={wrapRef}>
      <style>{CSS}</style>

      <button
        className="pac-chip"
        onClick={() => setOpen(o => !o)}
        title="Change pod"
        disabled={isPending}
      >
        <span className="pac-chip-name">{displayName}</span>
        <ChevronDown size={11}/>
      </button>

      {open && (
        <div className="pac-menu">
          {error && <div className="pac-error">{error}</div>}

          {localPods.length === 0 && (
            <div className="pac-error" style={{ color: "var(--text-3)" }}>
              No pods yet
            </div>
          )}

          {localPods.map(pod => (
            <button
              key={pod.id}
              className={`pac-item ${pod.id === activeId ? "current" : ""}`}
              onClick={() => pickPod(pod)}
            >
              <span>{pod.name}</span>
              {pod.id === activeId && <Check size={12} className="pac-item-check"/>}
            </button>
          ))}

          <div className="pac-divider"/>

          <button className="pac-create" onClick={createAndAssign} disabled={isPending}>
            <Plus size={12}/> Create new pod
          </button>
        </div>
      )}
    </div>
  );
}