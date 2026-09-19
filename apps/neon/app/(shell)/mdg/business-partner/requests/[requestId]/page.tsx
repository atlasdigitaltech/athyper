import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessPartnerRequestDetail } from "@athyper/product-neon-business-partner";
import { isEntityId } from "@/lib/route-params";
export const metadata: Metadata = { title: "Business Partner request" };
export default async function BusinessPartnerRequestPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly requestId: string }>;
  readonly searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const { requestId } = await params;
  if (!isEntityId(requestId)) notFound();
  const query=await searchParams;
  const pin=(key:string)=>query[key]===undefined?undefined:typeof query[key]==="string"?query[key]:"invalid";
  return <BusinessPartnerRequestDetail requestId={requestId} notificationPins={{attemptId:pin("attemptId"),workItemId:pin("workItemId"),documentJobId:pin("documentJobId")}} />;
}
