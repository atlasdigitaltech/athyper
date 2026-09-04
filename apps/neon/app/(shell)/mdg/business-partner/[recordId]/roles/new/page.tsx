import { notFound } from "next/navigation";
import { BusinessPartnerRoleExtension } from "@athyper/product-neon-business-partner";
import { isEntityId } from "@/lib/route-params";

export default async function BusinessPartnerRoleExtensionPage({
  params,
}: {
  readonly params: Promise<{ readonly recordId: string }>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  return <BusinessPartnerRoleExtension businessPartnerId={recordId} />;
}
