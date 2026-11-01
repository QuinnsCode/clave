// src/app/pages/pods/PodDetailPage.tsx
//
// Server component for /pods/:slug.
// Fetches pod + sessions server-side, renders PodDetailView.
// Same component as the modal but wrapped in a full page layout with nav.

import { AppContext } from "@/worker";
import { getPodWithDetailsService } from "@/lib/pods/podsService";
import { getPodSessionsService } from "@/lib/pods/podSessionsService";
import PodDetailView from "@/app/components/pods/PodDetailView";
import { Drum, ChevronLeft } from "lucide-react";

const CSS = `
:root {
  --bg:        #080810; --bg-2: #0d0d1a; --bg-3: #111120;
  --border:    rgba(255,255,255,0.06); --border-p: rgba(124,58,237,0.25);
  --text:      #ece8f8; --text-2: #918caa; --text-3: #4a4660;
  --purple:    #7c3aed; --purple-l: #a78bfa; --purple-d: #4c1d95;
  --purple-g:  rgba(124,58,237,0.28); --purple-g2: rgba(124,58,237,0.08);
  --green:     #22c55e; --red: #f87171;
  --mono:      'DM Mono', monospace;
}
body { background: var(--bg); color: var(--text); font-family: 'DM Sans', sans-serif; margin: 0; min-height: 100vh; }

.pdp-wrap { max-width: 680px; margin: 0 auto; padding: 32px 24px 80px; }

.pdp-nav {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 28px;
}
.pdp-back {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 13px; color: var(--text-3); text-decoration: none;
  padding: 5px 10px; border-radius: 7px; transition: all 0.15s;
}
.pdp-back:hover { background: var(--bg-3); color: var(--text); }
.pdp-pill {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 12px; border-radius: 100px;
  background: linear-gradient(135deg,#5b21b6,#7c3aed,#8b5cf6);
  font-size: 13px; font-weight: 600; color: #fff; text-decoration: none;
}

.pdp-not-found {
  text-align: center; padding: 60px 20px; color: var(--text-3);
}
.pdp-not-found h1 { font-size: 20px; color: var(--text-2); margin-bottom: 8px; }
`;

interface Props {
  ctx:    AppContext;
  params: { slug?: string };
}

export default async function PodDetailPage({ ctx, params }: Props) {
  if (!ctx.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }
  if (!ctx.organization) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  const slug = params.slug;
  if (!slug) {
    return new Response(null, { status: 302, headers: { Location: "/pods" } });
  }

  const orgId = ctx.organization.id;

  // Find pod by slug within org
  const pods = await import("@/lib/pods/podsService").then(m => m.listPodsService(orgId));
  const pod  = pods.find(p => p.slug === slug) ?? null;

  if (!pod) {
    return (
      <div className="pdp-wrap">
        <style>{CSS}</style>
        <div className="pdp-nav">
          <a href="/pods" className="pdp-back"><ChevronLeft size={13}/> Pods</a>
          <a href="/" className="pdp-pill"><span>q</span> qlave</a>
        </div>
        <div className="pdp-not-found">
          <h1>Pod not found</h1>
          <p>This pod may have been deleted or doesn't exist.</p>
          <a href="/pods" style={{ color: "var(--purple-l)", fontSize: 13, marginTop: 12, display: "inline-block" }}>
            ← Back to pods
          </a>
        </div>
      </div>
    );
  }

  // Load sessions server-side — passed as initialSessions to avoid client fetch on mount
  const initialSessions = await getPodSessionsService(pod.id, orgId);

  return (
    <div className="pdp-wrap">
      <style>{CSS}</style>

      <div className="pdp-nav">
        <a href="/pods" className="pdp-back"><ChevronLeft size={13}/> Pods</a>
        <a href="/" className="pdp-pill"><Drum size={13} strokeWidth={2.5}/> qlave</a>
      </div>

      <PodDetailView
        pod={pod}
        organizationId={orgId}
        initialSessions={initialSessions}
        onPodDeleted={() => {
          // Client-side navigation back to pods after delete
          // (PodDetailView handles this via window.location in the modal path;
          // on the page path the same callback fires)
        }}
      />
    </div>
  );
}