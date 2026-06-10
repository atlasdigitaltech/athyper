import { RuntimeEditPage } from "@athyper/runtime-canvas";
import { getMetaEntityRecordDetail, normalizeRouteRecordId } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { PLANE_KEY } from "@/lib/plane";

export default async function PurchaseInvoiceEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recordId = normalizeRouteRecordId(id);
  const descriptor = await getMetaEntityRuntimeDescriptor("purchase_invoice");
  const detail = await getMetaEntityRecordDetail("purchase_invoice", recordId, descriptor);

  return (
    <RuntimeEditPage
      plane={PLANE_KEY}
      entity="purchase_invoice"
      id={recordId}
      descriptor={descriptor}
      record={detail.record}
      detailState={detail.state}
    />
  );
}
