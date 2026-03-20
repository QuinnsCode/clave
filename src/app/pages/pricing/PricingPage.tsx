// src/app/pages/pricing/PricingPage.tsx
import { AppContext } from "@/worker";
import { db } from "@/db";
import PricingContent from "./PricingContent";
import { getTranscriptionPlugin } from "@/lib/plugins/resolver";

export default async function PricingPage({ ctx }: { ctx: AppContext }) {
  let currentTier: "free" | "pro" | "creator" | "founder" = "free";

  if (ctx.user && ctx.organization) {
    const plugin = await getTranscriptionPlugin(db, ctx.organization.id);
    if (plugin.enabled && plugin.mode === "active") {
      currentTier = plugin.tier as any;
    }
  }

  return (
    <PricingContent
      currentTier={currentTier}
      isLoggedIn={!!ctx.user}
    />
  );
}