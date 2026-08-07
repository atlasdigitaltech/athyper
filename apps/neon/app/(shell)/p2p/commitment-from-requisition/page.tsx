/**
 * /p2p/commitment-from-requisition?requisitionId=<uuid>
 *
 * Prefill page that wraps the canonical runtime entity operation for
 * requisition endpoint. Closes the upstream end of the P2P chain (PR → PO
 * is still manual without this).
 *
 * The generic /app/purchase_order/new descriptor flow handles greenfield PO
 * creation; this route is for the "PO from Requisition" promoted flow
 * where the user picks an approved PR and the form pre-fills its lines +
 * the suggested supplier.
 *
 * Server side loads:
 *   - The chosen PR (purchase_requisition view-projected row) for the read-only summary
 *   - The PR's open lines via /api/p2p/open-requisition-lines?requisitionId=<id>
 *
 * Client side renders a line-selection grid + supplier picker + Submit. On
 * success the form navigates to /app/purchase_order/<commitmentId>.
 *
 * Sister flows (same pattern):
 *   - /p2p/receipt-from-commitment
 *   - /p2p/service-sheet-from-commitment
 *   - /p2p/invoice-from-receipt
 *   - /p2p/payment-from-invoice
 */

import { redirect } from "next/navigation";
import { PageFrame } from "@athyper/platform-surface-kit";
import { getNeonServerSession } from "@/lib/server/session";
import { buildRuntimeHeaders, buildRuntimeUrl } from "@/lib/server/runtime-headers";
import { getMetaEntityRecordDetail } from "@/lib/server/meta-entity-records";
import { getMetaEntityRuntimeDescriptor } from "@/lib/server/meta-entity-runtime";
import {
  CommitmentFromRequisitionForm,
  type RequisitionHeaderDto,
  type RequisitionLineDto,
} from "./CommitmentFromRequisitionForm";

interface OpenRequisitionLineRow {
  prId:                string;
  prNumber:            string;
  prStatus:            string;
  lineId:              string;
  lineNumber:          number;
  itemId:              string | null;
  itemCode:            string | null;
  description:         string;
  baseUomCode:         string;
  remainingQty:        number;
  estimatedUnitPrice:  number;
  currencyCode:        string;
  requiredByDate:      string | null;
  suggestedSupplierId: string | null;
}

export default async function CommitmentFromRequisitionRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requisitionId = firstParam(params["requisitionId"]);

  if (!requisitionId) {
    return (
      <PageFrame eyebrow="P2P" title="Create Purchase Order from Requisition" description="Missing requisitionId parameter.">
        <p className="text-sm text-muted-foreground">
          Open this page from a Purchase Requisition detail page (Create Purchase Order action) so the requisition id is set.
        </p>
      </PageFrame>
    );
  }

  const session = await getNeonServerSession();
  if (!session) {
    redirect("/login?next=/p2p/commitment-from-requisition?requisitionId=" + encodeURIComponent(requisitionId));
  }

  const descriptor = await getMetaEntityRuntimeDescriptor("purchase_requisition");
  const prDetail   = descriptor
    ? await getMetaEntityRecordDetail("purchase_requisition", requisitionId, descriptor)
    : undefined;

  const prRecord = prDetail?.record;
  if (!prRecord) {
    return (
      <PageFrame eyebrow="P2P" title="Create Purchase Order from Requisition" description={`Requisition ${requisitionId} not found.`}>
        <p className="text-sm text-muted-foreground">
          The PR either does not exist or is not visible to your active organization.
        </p>
      </PageFrame>
    );
  }

  const recordData  = (prRecord["data"] ?? prRecord) as Record<string, unknown>;
  const headerDto: RequisitionHeaderDto = {
    requisitionId,
    prNumber:            asString(recordData["requisition_number"]) ?? requisitionId.slice(0, 8),
    prStatus:            asString(recordData["status"]) ?? "—",
    requestedByName:     asString(recordData["requested_by_name"]),
    documentDate:        asString(recordData["document_date"]),
    requiredByDate:      asString(recordData["required_by_date"]),
    currencyCode:        asString(recordData["currency_code"]) ?? "USD",
    totalEstimated:      asNumber(recordData["total_estimated_amount"]),
    suggestedSupplierId: asString(recordData["suggested_supplier_id"]),
    suggestedSupplierName: asString(recordData["suggested_supplier_name"]),
  };

  // Fetch open PR lines via the line-source route (server-side BFF call).
  const headers   = buildRuntimeHeaders(session);
  const linesUrl  = buildRuntimeUrl(`/api/p2p/open-requisition-lines?requisitionId=${encodeURIComponent(requisitionId)}&limit=100`);
  let openLines: RequisitionLineDto[] = [];
  let linesError: string | null       = null;
  try {
    const linesResponse = await fetch(linesUrl, { headers, cache: "no-store" });
    if (!linesResponse.ok) {
      linesError = `Requisition line fetch failed: HTTP ${linesResponse.status}`;
    } else {
      const json = await linesResponse.json() as { items?: OpenRequisitionLineRow[] };
      openLines = (json.items ?? []).map((row) => ({
        requisitionLineId:   row.lineId,
        lineNumber:          row.lineNumber,
        itemCode:            row.itemCode,
        description:         row.description,
        uomCode:             row.baseUomCode,
        remainingQty:        row.remainingQty,
        estimatedUnitPrice:  row.estimatedUnitPrice,
        currencyCode:        row.currencyCode,
        requiredByDate:      row.requiredByDate,
        suggestedSupplierId: row.suggestedSupplierId,
      }));
      // Fall back to the first line's suggested supplier if the PR header
      // didn't carry one (older PRs predate the header-level field).
      if (!headerDto.suggestedSupplierId) {
        headerDto.suggestedSupplierId = openLines.find((l) => l.suggestedSupplierId)?.suggestedSupplierId ?? undefined;
      }
    }
  } catch (err) {
    linesError = err instanceof Error ? err.message : String(err);
  }

  return (
    <PageFrame
      eyebrow={`Purchase Requisition · ${headerDto.prNumber}`}
      title="Create Purchase Order from Requisition"
      description={headerDto.requestedByName ? `Requester: ${headerDto.requestedByName}` : undefined}
    >
      <CommitmentFromRequisitionForm
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
