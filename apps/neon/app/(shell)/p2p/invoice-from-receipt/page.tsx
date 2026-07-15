/**
 * /p2p/invoice-from-receipt?receiptId=<uuid>
 *
 * Invoice from Receipt prefill page. Closes the 3-way match loop:
 * the user picks receipt lines they want to bill + supplies the
 * supplier's invoice metadata. Lines are pre-filtered to the chosen
 * receipt by the new ?receiptId= filter on /api/p2p/open-receipt-lines.
 */

import { redirect } from "next/navigation";
import { PageFrame } from "@athyper/surface-kit";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import {
  InvoiceFromReceiptForm,
  type ReceiptHeaderDto,
  type ReceiptLineDto,
} from "./InvoiceFromReceiptForm";

interface OpenReceiptLineRow {
  receiptId:     string;
  receiptNumber: string;
  receiptDate:   string;
  lineId:        string;
  lineNumber:    number;
  poId:          string | null;
  poNumber:      string | null;
  poLineId:      string | null;
  poLineNumber:  number | null;
  itemId:        string | null;
  itemCode:      string | null;
  description:   string;
  baseUomCode:   string;
  acceptedQty:   number;
  rejectedQty:   number;
  unitCost:      number;
  currencyCode:  string;
}

export default async function InvoiceFromReceiptRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const receiptId = firstParam(params["receiptId"]);

  if (!receiptId) {
    return (
      <PageFrame eyebrow="P2P" title="Invoice from Receipt" description="Missing receiptId parameter.">
        <p className="text-sm text-muted-foreground">
          Open this page from a posted Receipt detail page so the receipt id is set.
        </p>
      </PageFrame>
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    redirect("/login?next=/p2p/invoice-from-receipt?receiptId=" + encodeURIComponent(receiptId));
  }

  const descriptor = await getMetaEntityRuntimeDescriptor("receipt");
  const receiptDetail = descriptor
    ? await getMetaEntityRecordDetail("receipt", receiptId, descriptor)
    : undefined;

  const receiptRecord = receiptDetail?.record;
  if (!receiptRecord) {
    return (
      <PageFrame eyebrow="P2P" title="Invoice from Receipt" description={`Receipt ${receiptId} not found.`}>
        <p className="text-sm text-muted-foreground">
          The receipt either does not exist or is not visible to your active organization.
        </p>
      </PageFrame>
    );
  }

  const recordData = (receiptRecord["data"] ?? receiptRecord) as Record<string, unknown>;
  const headerDto: ReceiptHeaderDto = {
    receiptId,
    receiptNumber: asString(recordData["receipt_number"]) ?? receiptId.slice(0, 8),
    status:        asString(recordData["status"])         ?? "—",
    documentDate:  asString(recordData["document_date"]),
    supplierName:  asString(recordData["supplier_name"]),
    currencyCode:  asString(recordData["currency_code"]) ?? "USD",
    commitmentId:  asString(recordData["commitment_id"]),
  };

  const headers   = buildRuntimeHeaders(session);
  const linesUrl  = buildRuntimeUrl(`/api/p2p/open-receipt-lines?receiptId=${encodeURIComponent(receiptId)}&limit=100`);
  let openLines: ReceiptLineDto[] = [];
  let linesError: string | null   = null;
  try {
    const linesResponse = await fetch(linesUrl, { headers, cache: "no-store" });
    if (!linesResponse.ok) {
      linesError = `Receipt line fetch failed: HTTP ${linesResponse.status}`;
    } else {
      const json = await linesResponse.json() as { items?: OpenReceiptLineRow[] };
      openLines = (json.items ?? []).map((row) => ({
        receiptLineId: row.lineId,
        lineNumber:    row.lineNumber,
        poNumber:      row.poNumber,
        poLineNumber:  row.poLineNumber,
        itemCode:      row.itemCode,
        description:   row.description,
        uomCode:       row.baseUomCode,
        acceptedQty:   row.acceptedQty,
        unitCost:      row.unitCost,
        currencyCode:  row.currencyCode,
      }));
    }
  } catch (err) {
    linesError = err instanceof Error ? err.message : String(err);
  }

  return (
    <PageFrame
      eyebrow={`Receipt · ${headerDto.receiptNumber}`}
      title="Create Invoice from Receipt"
      description={headerDto.supplierName ? `Supplier: ${headerDto.supplierName}` : undefined}
    >
      <InvoiceFromReceiptForm
        header={headerDto}
        lines={openLines}
        linesError={linesError}
      />
    </PageFrame>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof item === "string" ? item.trim() : "";
  return trimmed.length > 0 ? trimmed : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}
