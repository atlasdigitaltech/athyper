import type { Metadata } from "next";
import { NewWorkforceRequest } from "@athyper/product-neon-workforce";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";

export const metadata: Metadata = { title: "New workforce request" };

export default function NewWorkforceRequestPage() {
  return (
    <NeonRouteEntitlement workspaceCode="ppl" moduleCode="workforce">
      <NewWorkforceRequest />
    </NeonRouteEntitlement>
  );
}
