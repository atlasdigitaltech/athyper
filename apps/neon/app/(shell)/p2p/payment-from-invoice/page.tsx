/**
 * /p2p/payment-from-invoice?seedInvoiceId=<uuid>
 *
 * Payment from Invoice prefill page. Multi-select grid of open invoices
 * for ONE supplier (resolved from the seed invoice). User checks the
 * invoices to pay, enters allocation amounts (+ optional deductions),
 * submits one payment_entry that allocates against all chosen invoices.
 *
 * Backed by /api/p2p/open-invoices?seedInvoiceId=<id> which returns the
 * remaining-to-pay for each invoice (payable - already_allocated).
 */

import { redirect } from "next/navigation";
import { PageFrame } from "@athyper/platform-surface-kit";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import {
  PaymentFromInvoiceForm,
  type OpenInvoiceDto,
} from "./PaymentFromInvoiceForm";

interface OpenInvoiceRow {
  invoiceId:             string;
  invoiceNumber:         string;
  supplierId:            string;
  supplierCode:          string | null;
  supplierInvoiceNumber: string | null;
  documentDate:          string;
  status:                string;
  currencyCode:          string;
  totalAmount:           number;
  payableAmount:         number;
  alreadyAllocated:      number;
  remainingAmount:       number;
}

export default async function PaymentFromInvoiceRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const seedInvoiceId = firstParam(params["seedInvoiceId"]);

  if (!seedInvoiceId) {
    return (
      <PageFrame eyebrow="P2P" title="Payment from Invoice" description="Missing seedInvoiceId parameter.">
        <p className="text-sm text-muted-foreground">
          Open this page from a Purchase Invoice detail page so the seed invoice id is set; the supplier is
          resolved automatically and all open invoices for that supplier appear in the grid.
        </p>
      </PageFrame>
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    redirect("/login?next=/p2p/payment-from-invoice?seedInvoiceId=" + encodeURIComponent(seedInvoiceId));
  }

  const headers   = buildRuntimeHeaders(session);
  const invUrl    = buildRuntimeUrl(`/api/p2p/open-invoices?seedInvoiceId=${encodeURIComponent(seedInvoiceId)}&limit=100`);
  let openInvoices: OpenInvoiceDto[] = [];
  let invError: string | null        = null;
  let supplierCode: string | null    = null;
  try {
    const r = await fetch(invUrl, { headers, cache: "no-store" });
    if (!r.ok) {
      invError = `Open-invoices fetch failed: HTTP ${r.status}`;
    } else {
      const json = await r.json() as { items?: OpenInvoiceRow[] };
      const rows = json.items ?? [];
      openInvoices = rows.map((row) => ({
        invoiceId:             row.invoiceId,
        invoiceNumber:         row.invoiceNumber,
        supplierInvoiceNumber: row.supplierInvoiceNumber,
        documentDate:          row.documentDate,
        status:                row.status,
        currencyCode:          row.currencyCode,
        payableAmount:         row.payableAmount,
        alreadyAllocated:      row.alreadyAllocated,
        remainingAmount:       row.remainingAmount,
      }));
      supplierCode = rows[0]?.supplierCode ?? null;
    }
  } catch (err) {
    invError = err instanceof Error ? err.message : String(err);
  }

  return (
    <PageFrame
      eyebrow="Accounts Payable"
      title="Pay Invoices"
      description={supplierCode ? `Supplier: ${supplierCode}` : "Selection scoped to the seed invoice's supplier."}
    >
      <PaymentFromInvoiceForm
        seedInvoiceId={seedInvoiceId}
        invoices={openInvoices}
        invoicesError={invError}
      />
    </PageFrame>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof item === "string" ? item.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}
