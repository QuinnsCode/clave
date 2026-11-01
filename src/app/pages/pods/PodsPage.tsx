// src/app/pages/pods/PodsPage.tsx
//
// Route handler for /pods. Mirrors DashboardPage shape:
//   - auth via ctx
//   - data via service loader
//   - hand off to a layout component
//
// Pure server component. No "use client". The interactive bits live in
// leaf components (PodCard, NewPodButton, DeletePodModal) inside the
// dashboard layout.

import { AppContext } from "@/worker";
import { loadPodsData } from "@/lib/pods/loadPodsData";
import PodsDashboard from "@/app/components/pods/PodsDashboard";

export default async function PodsPage({ ctx }: { ctx: AppContext }) {
  if (!ctx.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }
  if (!ctx.organization) {
    return new Response(null, { status: 302, headers: { Location: "/" } });
  }

  const data = await loadPodsData(ctx.organization.id);

  return (
    <PodsDashboard
      orgId={ctx.organization.id}
      pods={data.pods}
      loadError={data.errors.pods}
    />
  );
}