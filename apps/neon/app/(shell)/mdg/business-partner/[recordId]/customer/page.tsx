import { notFound } from "next/navigation";
import { CustomerControls } from "@athyper/product-neon-business-partner";
import { isEntityId } from "@/lib/route-params";

export default async function CustomerControlsPage({
  params,
}: {
  readonly params: Promise<{ readonly recordId: string }>;
}) {
  const { recordId } = await params;
  if (!isEntityId(recordId)) notFound();
  return <CustomerControls businessPartnerId={recordId} />;
}
