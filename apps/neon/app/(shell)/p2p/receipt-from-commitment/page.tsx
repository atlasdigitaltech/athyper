/**
 * /p2p/receipt-from-commitment?commitmentId=<uuid>
 *
 * Custom prefill page that wraps the canonical runtime entity operation for
 * commitment endpoint. The generic /app/receipt/new descriptor flow
 * handles manual receipt creation; this route is for the "Receipt from
 * Commitment" promoted flow where the user picks a PO and the form
 * pre-fills its lines.
 *
 * Server side loads:
 *   - The chosen PO (commitment view-projected row) for the read-only summary
 *   - The PO's open lines via /api/p2p/open-po-lines?commitmentId=<id>
 *
 * Client side renders a line-acceptance grid + Submit. On success the form
 * navigates to /app/receipt/<receiptId>.
 *
 * Sister flows when ready (same pattern):
 *   - /p2p/service-sheet-from-commitment
 *   - /p2p/invoice-from-receipt
 *   - /p2p/payment-from-invoice
 */

import { redirect } from "next/navigation";
import { PageFrame } from "@athyper/surface-kit";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import { ReceiptFromCommitmentForm, type CommitmentLineDto, type CommitmentHeaderDto } from "./ReceiptFromCommitmentForm";

interface OpenPoLineRow {
  poId:          string;
  poNumber:      string;
  lineId:        string;
  lineNumber:    number;
  description:   string;
  itemCode:      string | null;
  baseUomCode:   string;
  remainingQty:  number;
  unitPrice:     number;
  currencyCode:  string;
}

export default async function ReceiptFromCommitmentRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const commitmentId = firstParam(params["commitmentId"]);

  if (!commitmentId) {
    return (
      <PageFrame eyebrow="P2P" title="Receipt from Commitment" description="Missing commitmentId parameter.">
        <p className="text-sm text-muted-foreground">
          Open this page from a Purchase Order detail page (Create Receipt action) so the commitment id is set.
        </p>
      </PageFrame>
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    redirect("/login?next=/p2p/receipt-from-commitment?commitmentId=" + encodeURIComponent(commitmentId));
  }

  const descriptor = await getMetaEntityRuntimeDescriptor("purchase_order");
  const commitmentDetail = descriptor
    ? await getMetaEntityRecordDetail("purchase_order", commitmentId, descriptor)
    : undefined;

  const commitmentRecord = commitmentDetail?.record;
  if (!commitmentRecord) {
    return (
      <PageFrame eyebrow="P2P" title="Receipt from Commitment" description={`Commitment ${commitmentId} not found.`}>
        <p className="text-sm text-muted-foreground">
          The PO either does not exist or is not visible to your active organization.
        </p>
      </PageFrame>
    );
  }

  const recordData  = (commitmentRecord["data"] ?? commitmentRecord) as Record<string, unknown>;
  const headerDto: CommitmentHeaderDto = {
    commitmentId,
    poNumber:      asString(recordData["code"])       ?? commitmentId.slice(0, 8),
    poStatus:      asString(recordData["status"])     ?? "—",
    poType:        asString(recordData["order_type"]),
    supplierName:  asString(recordData["supplier_name"]),
    documentDate:  asString(recordData["document_date"]),
    currencyCode:  asString(recordData["currency_code"]) ?? "USD",
    totalAmount:   asNumber(recordData["total_amount"]),
  };

  // Fetch open commitment_lines via the line-source route (server-side BFF call).
  const headers   = buildRuntimeHeaders(session);
  const linesUrl  = buildRuntimeUrl(`/api/p2p/open-po-lines?commitmentId=${encodeURIComponent(commitmentId)}&limit=100`);
  let openLines: CommitmentLineDto[] = [];
  let linesError: string | null      = null;
  try {
    const linesResponse = await fetch(linesUrl, { headers, cache: "no-store" });
    if (!linesResponse.ok) {
      linesError = `Commitment line fetch failed: HTTP ${linesResponse.status}`;
    } else {
      const json = await linesResponse.json() as { items?: OpenPoLineRow[] };
      openLines = (json.items ?? []).map((row) => ({
        commitmentLineId: row.lineId,
        lineNumber:       row.lineNumber,
        itemCode:         row.itemCode,
        description:      row.description,
        uomCode:          row.baseUomCode,
        remainingQty:     row.remainingQty,
        unitPrice:        row.unitPrice,
        currencyCode:     row.currencyCode,
      }));
    }
  } catch (err) {
    linesError = err instanceof Error ? err.message : String(err);
  }

  return (
    <PageFrame
      eyebrow={`Purchase Order · ${headerDto.poNumber}`}
      title="Create Receipt from Commitment"
      description={headerDto.supplierName ? `Supplier: ${headerDto.supplierName}` : undefined}
    >
      <ReceiptFromCommitmentForm
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

function asNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
