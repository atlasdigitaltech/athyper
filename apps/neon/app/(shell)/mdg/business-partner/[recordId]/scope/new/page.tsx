import { notFound } from "next/navigation";
import { BusinessPartnerScopeConfiguration } from "@athyper/product-neon-business-partner";
import { isEntityId } from "@/lib/route-params";

export default async function BusinessPartnerScopeConfigurationPage({
  params,
}: {
  readonly params: Promise<{ readonly recordId: string }>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  return <BusinessPartnerScopeConfiguration businessPartnerId={recordId} />;
}
