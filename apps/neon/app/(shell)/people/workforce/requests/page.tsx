import type { Metadata } from "next";
import { WorkforceRequestList } from "@athyper/product-neon-workforce";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";

export const metadata: Metadata = { title: "Workforce requests" };

export default function WorkforceRequestsPage() {
  return (
    <NeonRouteEntitlement workspaceCode="ppl" moduleCode="workforce">
      <WorkforceRequestList />
    </NeonRouteEntitlement>
  );
}
