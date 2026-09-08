import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BusinessPartnerRecord } from "@athyper/product-neon-business-partner";
import { isEntityId } from "@/lib/route-params";
export const metadata: Metadata = { title: "Business Partner" };
export default async function BusinessPartnerDetailPage({
  params,
}: {
  readonly params: Promise<{ readonly recordId: string }>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  return <BusinessPartnerRecord businessPartnerId={recordId} />;
}
