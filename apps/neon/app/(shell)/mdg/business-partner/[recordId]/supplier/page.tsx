import { notFound } from "next/navigation";
import { isEntityId } from "@/lib/route-params";
import { SupplierControls } from "@athyper/product-neon-business-partner";

export default async function SupplierControlsPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ recordId: string }>;
  readonly searchParams: Promise<Record<string,string|string[]|undefined>>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  const query=await searchParams;
  const organization=query.operatingOrganizationId, company=query.companyCodeId;
  if (organization !== undefined && (typeof organization !== "string" || !isEntityId(organization))) notFound();
  if (company !== undefined && (typeof company !== "string" || !isEntityId(company) || !organization)) notFound();
  return <SupplierControls businessPartnerId={recordId} requestScope={typeof organization === "string" ? {operatingOrganizationId:organization,...(typeof company === "string" ? {companyCodeId:company} : {})} : undefined} />;
}
