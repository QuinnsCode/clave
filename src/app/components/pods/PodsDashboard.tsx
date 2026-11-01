// src/app/components/Pods/PodsDashboard.tsx
//
// Server component. Pure layout — receives pods as props from the page,
// renders the header + grid. Interactive bits (rename, delete, create)
// live in client leaves so this whole layout stays server-rendered.
//
// NOTE on CSS (R1.5 polish) — this is the entry point for `/pods` outside
// DashboardClient. DashboardClient defines the theme tokens inside its own
// <style>, so they're absent on this page. We inline a minimal set of dark
// theme tokens at :root here, plus a body background, so /pods renders
// styled. Later refactor: extract tokens to global styles.css, migrate the
// rest of the app to Tailwind where possible.
//
// CHANGED (pods sessions pass) — passes orgId to each PodCard so the
// detail modal can load sessions correctly.

import type { PodListItem } from "@/lib/pods/podsService";
import PodCard from "@/app/components/pods/PodCard";
import NewPodButton from "@/app/components/pods/NewPodButton";

interface Props {
  orgId:     string;
  pods:      PodListItem[];
  loadError: string | null;
}

const CSS = `
:root {
  --bg:        #080810;
  --bg-2:      #0d0d1a;
  --bg-3:      #111120;
  --surface:   #161428;
  --border:    rgba(255,255,255,0.06);
  --border-p:  rgba(124,58,237,0.25);
  --text:      #ece8f8;
  --text-2:    #918caa;
  --text-3:    #4a4660;
  --purple:    #7c3aed;
  --purple-l:  #a78bfa;
  --purple-d:  #4c1d95;
  --purple-g:  rgba(124,58,237,0.28);
  --purple-g2: rgba(124,58,237,0.08);
  --green:     #22c55e;
  --red:       #f87171;
  --mono:      'DM Mono', monospace;
}

body {
  background: var(--bg);
  color:      var(--text);
  font-family: 'DM Sans', sans-serif;
  margin: 0;
  min-height: 100vh;
}

.pods-dashboard {
  max-width: 1080px;
  margin: 0 auto;
  padding: 40px 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.pods-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.pods-header-left { display: flex; flex-direction: column; gap: 4px; }
.pods-title {
  font-size: 24px; font-weight: 600; color: var(--text);
  letter-spacing: -0.01em;
}
.pods-subtitle { font-size: 13px; color: var(--text-3); }

.pods-error {
  font-size: 12px; color: var(--red);
  padding: 10px 14px;
  background: rgba(248,113,113,0.08);
  border: 1px solid rgba(248,113,113,0.2);
  border-radius: 8px;
}

.pods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.pods-empty {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-3);
  background: var(--bg-2);
  border: 1px dashed var(--border);
  border-radius: 12px;
}
.pods-empty-title { font-size: 15px; color: var(--text-2); margin-bottom: 6px; }
.pods-empty-hint  { font-size: 12px; color: var(--text-3); }
`;

export default function PodsDashboard({ orgId, pods, loadError }: Props) {
  return (
    <div className="pods-dashboard">
      <style>{CSS}</style>

      <div className="pods-header">
        <div className="pods-header-left">
          <div className="pods-title">Your Pods</div>
          <div className="pods-subtitle">
            Pods are context bubbles. Sessions in a pod share vocabulary, speakers, and corrections.
          </div>
        </div>
        <NewPodButton />
      </div>

      {loadError && <div className="pods-error">{loadError}</div>}

      {pods.length === 0 ? (
        <div className="pods-empty">
          <div className="pods-empty-title">No pods yet</div>
          <div className="pods-empty-hint">
            One will be created automatically the first time you record a session.
            Or create one now with the button above.
          </div>
        </div>
      ) : (
        <div className="pods-grid">
          {pods.map(pod => (
            <PodCard key={pod.id} pod={pod} organizationId={orgId} />
          ))}
        </div>
      )}
    </div>
  );
}