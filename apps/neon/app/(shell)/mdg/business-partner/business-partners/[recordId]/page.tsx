import { notFound, redirect } from "next/navigation";
import { isEntityId } from "@/lib/route-params";

export default async function BusinessPartnerCatalogDetail({ params }: {
  readonly params: Promise<{ readonly recordId: string }>;
}): Promise<never> {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  redirect(`/mdg/business-partner/${encodeURIComponent(recordId)}`);
}
