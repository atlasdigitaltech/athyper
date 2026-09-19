import { notFound } from "next/navigation";
import { BusinessPartnerScopeConfiguration } from "@athyper/product-neon-business-partner";
import { isEntityId } from "@/lib/route-params";

export default async function BusinessPartnerScopeConfigurationPage({
  params,
  searchParams,
}: {
  readonly searchParams: Promise<Record<string,string|string[]|undefined>>;
  readonly params: Promise<{ readonly recordId: string }>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  const q=await searchParams;
  const company=typeof q.companyCodeId==="string"&&isEntityId(q.companyCodeId)?q.companyCodeId:undefined;
  const org=typeof q.operatingOrganizationId==="string"&&isEntityId(q.operatingOrganizationId)?q.operatingOrganizationId:undefined;
  return <BusinessPartnerScopeConfiguration businessPartnerId={recordId} initialCompanyCodeId={company} initialOrganizationId={org} initialRole={q.role==="customer"?"customer":"supplier"} initialKind={q.kind==="configure_company"?"configure_company":"assign_organization"} />;
}
