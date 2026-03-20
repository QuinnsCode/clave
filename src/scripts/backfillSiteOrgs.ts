// src/scripts/backfillSiteOrgs.ts
//
// ONE-TIME MIGRATION SCRIPT — run once after deploying migration 0016.
//
// WHY THIS EXISTS:
// The Site model previously only had userId. We added organizationId in
// migration 0016 so the transcription plugin system can enforce usage at
// the org level. Existing site rows have organizationId = null and need
// to be backfilled.
//
// WHEN TO RUN:
// - Once, after pnpm migrate:prd for migration 0016
// - Safe to run multiple times (skips already-backfilled rows)
// - Run against production: pnpm backfill:site-orgs
//
// WHEN NOT TO RUN AGAIN:
// - New sites created after this migration are automatically stamped
//   with organizationId via the site creation flow
// - If you add a new user/org in future, this script is not needed —
//   the autoCreateOrgMiddleware handles it going forward
//
// FALLBACK:
// The transcribe route falls back to userId if organizationId is null,
// so nothing breaks if this script hasn't run yet — but usage tracking
// will be org-unaware until it does.

import { db, setupDb } from "@/db";
import { env } from "cloudflare:workers";

await setupDb(env);

const sites = await db.site.findMany({ where: { organizationId: null } });
console.log(`Found ${sites.length} sites to backfill`);

let backfilled = 0;
for (const site of sites) {
  const member = await db.member.findFirst({ where: { userId: site.userId } });
  if (member) {
    await db.site.update({
      where: { id: site.id },
      data: { organizationId: member.organizationId },
    });
    backfilled++;
  } else {
    console.warn(`No org membership found for userId ${site.userId} — skipping site ${site.id}`);
  }
}

console.log(`Backfilled ${backfilled}/${sites.length} sites`);