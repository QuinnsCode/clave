// src/app/pages/qlave-test/QlaveTestPage.tsx
import { AppContext } from "@/worker";
import QlaveTestClient from "@/app/components/qlave-test/QlaveTestClient";

export default async function QlaveTestPage({ ctx }: { ctx: AppContext }) {
  return <QlaveTestClient />;
}