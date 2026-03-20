// app/pages/admin/AdminUpgradePage.tsx
import { requireAdmin } from "@/lib/middleware/adminMiddleware";
import AdminUpgradeClient from "./AdminUpgradeClient";
import type { AppContext } from "@/worker";

export default async function AdminUpgradePage({
  ctx,
  request,
}: {
  ctx: AppContext;
  request: Request;
}) {
  const denied = requireAdmin(ctx, request);
  if (denied) return denied;

  return <AdminUpgradeClient adminEmail={ctx.user!.email!} />;
}