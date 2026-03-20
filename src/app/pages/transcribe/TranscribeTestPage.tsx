// @/app/pages/transcribe/TranscribeTestPage.tsx

import { AppContext } from "@/worker";
import TranscribeTestPageClient from "./TranscribeTestPageClient";
import { getOrCreateSite } from "@/lib/qlave/siteService";

export default async function TranscribeTestPage({ ctx }: { ctx: AppContext }) {
  if (!ctx.user) {
    return new Response(null, { status: 302, headers: { Location: "/user/login" } });
  }

  const site = await getOrCreateSite(ctx.user.id);

  return <TranscribeTestPageClient siteKey={site.siteKey} />;
}