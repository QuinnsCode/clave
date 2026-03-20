// @/app/pages/test/TestPage.tsx
import { AppContext } from "@/worker";
import CostCalculator from "@/app/components/testing/CostCalculator";

export default async function TestPage({ ctx }: { ctx: AppContext }) {
  return <CostCalculator />;
}