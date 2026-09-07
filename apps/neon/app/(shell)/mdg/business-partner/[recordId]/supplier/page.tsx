import { notFound } from "next/navigation";
import { isEntityId } from "@/lib/route-params";
import { SupplierControls } from "@athyper/product-neon-business-partner";

export default async function SupplierControlsPage({
  params,
}: {
  readonly params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  return <SupplierControls businessPartnerId={recordId} />;
}
