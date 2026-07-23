import { redirect } from "next/navigation";
import { getNeonServerSession } from "@/lib/server/session";

export default async function CompanyFoundationRoute({ params }: {
  params: Promise<{ companyCode: string }>;
}) {
  const { companyCode } = await params;
  const decoded = decodeURIComponent(companyCode);
  const session = await getNeonServerSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(`/finance/setup/company/${decoded}/foundation`)}`);
  redirect(`/finance/setup/company/${encodeURIComponent(decoded)}/foundation/organization`);
}
