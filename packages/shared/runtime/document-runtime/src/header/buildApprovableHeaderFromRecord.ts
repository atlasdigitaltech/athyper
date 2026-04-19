/**
 * @athyper/document-runtime — buildApprovableHeaderFromRecord
 *
 * Produces an ApprovableDocumentHeaderDTO from a generic entity record
 * and the compiled entity's display_config.document_header field map.
 *
 * This is the generic path used by EntityDetailPage when it detects
 * detail_renderer = "approvable".  Entity-specific mappers (e.g.
 * mapApInvoiceToHeader) remain the richer, preferred path for dedicated
 * document pages that pull from specialised API endpoints.
 *
 * Status intent mapping is kept simple here — just enough to colour-code
 * the badge without pulling in the full semantic-colors palette at build time.
 */
import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { ApprovableDocumentHeaderDTO } from "./types";

// ── Simple status → intent mapping ───────────────────────────────────────────

const STATUS_INTENT_MAP: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
  // Positive / terminal
  approved: "success",
  paid: "success",
  posted: "success",
  completed: "success",
  cleared: "success",
  active: "success",
  // In-flight
  pending: "warning",
  draft: "info",
  submitted: "info",
  in_review: "warning",
  partially_paid: "warning",
  partially_cleared: "warning",
  // Negative
  rejected: "error",
  cancelled: "error",
  void: "error",
  overdue: "error",
  // Default
  unknown: "neutral",
};

function statusToIntent(
  raw: unknown,
): "success" | "warning" | "error" | "info" | "neutral" {
  if (typeof raw !== "string") return "neutral";
  const key = raw.toLowerCase().replace(/[\s-]/g, "_");
  return STATUS_INTENT_MAP[key] ?? "neutral";
}

// ── Date / number formatters ──────────────────────────────────────────────────

const fmtDate = (iso: unknown): string | undefined => {
  if (!iso || typeof iso !== "string") return undefined;
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(iso);
  }
};

const fmtAmount = (val: unknown): string | undefined => {
  const n = typeof val === "number" ? val : Number(val);
  if (Number.isNaN(n)) return undefined;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

// ── Due meta helper ───────────────────────────────────────────────────────────

function calcDueMeta(
  dueDateIso: unknown,
): { label: string; intent: "info" | "warning" | "error" } | undefined {
  if (!dueDateIso || typeof dueDateIso !== "string") return undefined;
  const due = new Date(dueDateIso);
  if (isNaN(due.getTime())) return undefined;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - now.getTime()) / 86_400_000);

  if (diffDays < 0)
    return { label: `${Math.abs(diffDays)}d overdue`, intent: "error" };
  if (diffDays === 0) return { label: "Due today", intent: "warning" };
  if (diffDays <= 7)
    return { label: `Due in ${diffDays}d`, intent: "warning" };
  return { label: `Due in ${diffDays}d`, intent: "info" };
}

// ── Initials helper ───────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? "";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

// ── Main builder ──────────────────────────────────────────────────────────────

/**
 * Build an ApprovableDocumentHeaderDTO from a generic entity record.
 *
 * @param entity  Compiled entity descriptor — provides field map hints via
 *                display_config.document_header.
 * @param data    Raw record data as a key→value map.  Keys are entity field
 *                *names* (not column_names), matching the names in entity.fields.
 */
export function buildApprovableHeaderFromRecord(
  entity: CompiledEntity,
  data: Record<string, unknown>,
): ApprovableDocumentHeaderDTO {
  const dh = entity.display_config.document_header;
  const flags = entity.feature_flags ?? {};

  // ── Identity ────────────────────────────────────────────────────────────────
  const numberVal = dh?.number_field ? String(data[dh.number_field] ?? entity.entity_code) : entity.entity_code;
  const statusRaw = dh?.status_field ? data[dh.status_field] : undefined;
  const statusLabel = statusRaw ? String(statusRaw) : "Unknown";

  const dto: ApprovableDocumentHeaderDTO = {
    identity: {
      typeLabel: dh?.type_label ?? entity.entity_name.toUpperCase(),
      number: numberVal,
      statusLabel,
      statusIntent: statusToIntent(statusRaw),
    },
  };

  // ── Party ───────────────────────────────────────────────────────────────────
  const partyName = dh?.party_name_field
    ? data[dh.party_name_field]
    : dh?.party_id_field
      ? data[dh.party_id_field]
      : undefined;

  if (partyName && typeof partyName === "string") {
    dto.party = {
      id: dh?.party_id_field ? String(data[dh.party_id_field] ?? "") : "",
      name: partyName,
      initials: getInitials(partyName),
    };
  }

  // ── Money ───────────────────────────────────────────────────────────────────
  const currency = dh?.currency_field
    ? String(data[dh.currency_field] ?? "")
    : "";

  const totalFormatted = dh?.amount_field ? fmtAmount(data[dh.amount_field]) : undefined;

  if (totalFormatted) {
    dto.money = {
      totalLabel: dh?.total_label,
      currency,
      formatted: totalFormatted,
      subtotal: dh?.subtotal_field ? fmtAmount(data[dh.subtotal_field]) : undefined,
      tax: dh?.tax_field ? fmtAmount(data[dh.tax_field]) : undefined,
    };
  }

  // ── Dates ───────────────────────────────────────────────────────────────────
  const docDateFormatted = dh?.date_field ? fmtDate(data[dh.date_field]) : undefined;

  if (docDateFormatted) {
    const dueDateRaw = dh?.due_date_field ? data[dh.due_date_field] : undefined;
    dto.dates = {
      documentDateLabel: dh?.date_label,
      documentDate: docDateFormatted,
      dueDate: fmtDate(dueDateRaw),
      dueMeta: calcDueMeta(dueDateRaw),
    };
  }

  // ── Context counters ────────────────────────────────────────────────────────
  dto.context = {
    lineItems: flags.has_line_items ? 0 : undefined,
  };

  return dto;
}
