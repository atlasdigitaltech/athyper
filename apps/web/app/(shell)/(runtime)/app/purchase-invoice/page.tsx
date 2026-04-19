import { redirect } from "next/navigation";

/**
 * Purchase Invoice list — /app/purchase-invoice
 *
 * Purchase invoices are managed through the AP workbench (/finance/ap)
 * which provides status filters, aging, and payment workflows.
 * Redirect there instead of using the generic EntityListPage,
 * which requires compiled metadata not yet available for this entity.
 */
export default function PurchaseInvoiceListRoute() {
  redirect("/finance/ap");
}
