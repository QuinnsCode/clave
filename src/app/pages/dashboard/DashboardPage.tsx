// src/app/pages/dashboard/DashboardPage.tsx
import { AppContext } from "@/worker";
import DashboardClient from "@/app/components/DashboardClient/DashboardClient";
import { loadDashboardData } from "@/lib/dashboard/loadDashboardData";

export default async function DashboardPage({ ctx }: { ctx: AppContext }) {
  if (!ctx.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }

  const data = await loadDashboardData(ctx.user.id, ctx.organization?.id ?? null);

  return (
    <DashboardClient
      user={{ id: ctx.user.id, name: ctx.user.name ?? null, email: ctx.user.email ?? null }}
      site={data.site}
      orgId={ctx.organization?.id ?? null}
      recentSessions={data.recentSessions}
      monthly={data.monthly}
      transcriptionPlugin={data.plugin}
      recordingPlugin={data.recordingPlugin}
      maxPeers={data.maxPeers}
      loadError={data.errors.plugins ? "Some features unavailable — refresh to retry" : null}
    />
  );
}