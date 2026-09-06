import { SupplierControls } from "@athyper/product-neon-business-partner";

export default async function SupplierControlsPage({
  params,
}: {
  readonly params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  return <SupplierControls businessPartnerId={recordId} />;
}
