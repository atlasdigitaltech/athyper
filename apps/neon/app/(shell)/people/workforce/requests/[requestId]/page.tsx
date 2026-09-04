import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkforceRequestDetail } from "@athyper/product-neon-workforce";
import { NeonRouteEntitlement } from "@/lib/experience-runtime";
import { isEntityId } from "@/lib/route-params";

export const metadata: Metadata = { title: "Workforce request" };

export default async function WorkforceRequestPage({
  params,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
}) {
  const { requestId } = await params;
  if (!isEntityId(requestId)) notFound();
  return (
    <NeonRouteEntitlement workspaceCode="ppl" moduleCode="workforce">
      <WorkforceRequestDetail requestId={requestId} />
    </NeonRouteEntitlement>
  );
}
