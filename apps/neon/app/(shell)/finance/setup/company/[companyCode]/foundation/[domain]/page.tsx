import { notFound, redirect } from "next/navigation";
import { FINANCE_SETUP_WORKSPACE, FoundationView, type FoundationDomainKey } from "@athyper/finance-workbench";
import { getNeonServerSession } from "@/lib/server/session";

const foundationContract = FINANCE_SETUP_WORKSPACE.domains.find((domain) => domain.code === "foundation");
const DOMAINS = new Set<FoundationDomainKey>(
  foundationContract?.sections?.map((section) => section.code as FoundationDomainKey) ?? [],
);

export default async function CompanyFoundationDomainRoute({ params }: {
  params: Promise<{ companyCode: string; domain: string }>;
}) {
  const { companyCode, domain } = await params;
  const decodedCompany = decodeURIComponent(companyCode);
  const session = await getNeonServerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${decodedCompany}/foundation/${domain}`)}`);
  if (!DOMAINS.has(domain as FoundationDomainKey)) notFound();
  return <FoundationView companyCode={decodedCompany} activeDomain={domain as FoundationDomainKey} />;
}
