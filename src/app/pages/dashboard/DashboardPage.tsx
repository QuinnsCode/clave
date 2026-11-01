// src/app/pages/dashboard/DashboardPage.tsx
import { AppContext } from "@/worker";
import DashboardClient from "@/app/components/DashboardClient/DashboardClient";
import { loadDashboardData } from "@/lib/dashboard/loadDashboardData";

export default async function DashboardPage({ ctx }: { ctx: AppContext }) {
  if (!ctx.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }

  // orgId is ctx.organization?.id (the real BetterAuth org UUID) with fallback
  // to ctx.user.id for users without an org. New sessions store chunks under
  // orgId in R2. Old sessions store under userId. getSessionRecording tries
  // both paths so all sessions show up correctly.
  const tenantId = ctx.organization?.id ?? ctx.user.id;


  const data = await loadDashboardData(ctx.user.id, tenantId);

  return (
    <DashboardClient
      user={{ id: ctx.user.id, name: ctx.user.name ?? null, email: ctx.user.email ?? null }}
      site={data.site}
      orgId={tenantId}
      recentSessions={data.recentSessions}
      artifactsBySession={data.artifactsBySession}
      monthly={data.monthly}
      transcriptionPlugin={data.plugin}
      recordingPlugin={data.recordingPlugin}
      maxPeers={data.maxPeers}
      loadError={data.errors.plugins ? "Some features unavailable — refresh to retry" : null}
    />
  );
}