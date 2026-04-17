/**
 * Purchase Invoice detail — /app/purchase-invoice/[id]
 *
 * Specific route that shadows the generic [entity]/[id] page for invoices.
 * Renders ApprovableDocumentShell with the rich financial header instead of
 * the generic EntityDetailPage card + field grid.
 *
 * [id] = database UUID of the purchase_invoice record.
 *        Resolved to the AP invoice via /api/finance/ap/invoices/:id
 */
import { PurchaseInvoiceDetailPage } from "./_components/PurchaseInvoiceDetailPage";

export default async function PurchaseInvoiceDetailRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseInvoiceDetailPage invoiceId={id} />;
}
