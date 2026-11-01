"use client";
// src/app/components/pods/NewPodButton.tsx
//
// Client leaf. Button → modal with pre-filled auto-generated name (editable).
// Submit calls createPod server action. On success, reloads to surface the new
// pod (R1.5 — can be replaced with optimistic insertion later).

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { createPod } from "@/app/serverActions/pods/createPod";

const CSS = `
.npb-btn {
  background: var(--purple);
  color: #fff;
  border: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 13px; font-weight: 500;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  box-shadow: 0 2px 12px var(--purple-g, rgba(155,108,255,0.4));
  transition: all 0.15s;
}
.npb-btn:hover { background: #6d28d9; }
.npb-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.npb-overlay {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.npb-card {
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 100%;
  max-width: 420px;
  padding: 20px 22px;
  display: flex; flex-direction: column; gap: 14px;
}
.npb-head {
  display: flex; align-items: center; justify-content: space-between;
}
.npb-title { font-size: 15px; font-weight: 600; color: var(--text); }
.npb-close {
  background: transparent; border: none; color: var(--text-3);
  cursor: pointer; padding: 4px; border-radius: 5px;
  display: inline-flex; align-items: center;
}
.npb-close:hover { background: var(--bg-3); color: var(--text); }

.npb-input {
  background: var(--bg-3);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  width: 100%;
}
.npb-input:focus { border-color: var(--purple); }

.npb-hint { font-size: 11px; color: var(--text-3); }

.npb-actions {
  display: flex; gap: 8px; justify-content: flex-end;
}
.npb-cancel {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-2);
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
}
.npb-cancel:hover { background: var(--bg-3); color: var(--text); }
.npb-create {
  background: var(--purple);
  color: #fff;
  border: none;
  padding: 7px 14px;
  border-radius: 7px;
  font-size: 13px;
  cursor: pointer;
  font-weight: 500;
}
.npb-create:hover { background: #6d28d9; }
.npb-create:disabled { opacity: 0.6; cursor: not-allowed; }

.npb-error { font-size: 12px; color: var(--red, #f87171); }
`;

export default function NewPodButton() {
  const [open, setOpen]     = useState(false);
  const [name, setName]     = useState("");
  const [error, setError]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal() {
    setName("");           // empty → server will generate. User can type to override.
    setError(null);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createPod(name.trim() || undefined);
      if (!result.ok) {
        setError(result.error ?? "Could not create pod");
        return;
      }
      // Hard reload to re-fetch the server-rendered page with the new pod.
      // Cheap + reliable. Replace with router-level invalidation later if desired.
      window.location.reload();
    });
  }

  return (
    <>
      <style>{CSS}</style>

      <button className="npb-btn" onClick={openModal}>
        <Plus size={14}/> New Pod
      </button>

      {open && (
        <div className="npb-overlay" onClick={close}>
          <div className="npb-card" onClick={e => e.stopPropagation()}>

            <div className="npb-head">
              <div className="npb-title">Create a Pod</div>
              <button className="npb-close" onClick={close}><X size={15}/></button>
            </div>

            <div>
              <input
                className="npb-input"
                placeholder="Leave blank for a random name (e.g. Brave Crimson Pod)"
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter")  { e.preventDefault(); submit(); }
                  if (e.key === "Escape") { e.preventDefault(); close(); }
                }}
                maxLength={64}
                disabled={isPending}
              />
              <div className="npb-hint" style={{ marginTop: 6 }}>
                Pods group sessions. You can rename, link, or delete this later.
              </div>
            </div>

            {error && <div className="npb-error">{error}</div>}

            <div className="npb-actions">
              <button className="npb-cancel" onClick={close} disabled={isPending}>
                Cancel
              </button>
              <button className="npb-create" onClick={submit} disabled={isPending}>
                {isPending ? "Creating…" : "Create"}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}