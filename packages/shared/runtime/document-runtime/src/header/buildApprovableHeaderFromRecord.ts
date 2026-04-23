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
import type { ApprovableAudit, ApprovableDocumentHeaderDTO, ProgressStage, SlaStatus } from "./types";
import { statusToIntent } from "../_shared/status";

// ── Label formatter ───────────────────────────────────────────────────────────

function formatLabel(code: string): string {
  return code.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Stage key normaliser — maps DB status codes to progress rail stage keys ──

function toStageKey(statusKey: string): string {
  if (statusKey === "fully_paid" || statusKey === "partially_paid") return "paid";
  return statusKey;
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

// ── Duration + SLA helpers ────────────────────────────────────────────────────

/**
 * Returns a compact human-readable duration between two ISO timestamps.
 * If toIso is omitted, uses now().
 * Examples: "45m", "2h 30m", "3d 4h"
 */
function calcDurationLabel(fromIso: unknown, toIso?: unknown): string | undefined {
  if (!fromIso || typeof fromIso !== "string") return undefined;
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return undefined;
  const to = toIso && typeof toIso === "string" ? new Date(toIso) : new Date();
  if (isNaN(to.getTime())) return undefined;
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 0) return undefined;
  const totalMinutes = Math.floor(diffMs / 60_000);
  const days  = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const mins  = totalMinutes % 60;
  if (days  > 0) return hours > 0 ? `${days}d ${hours}h`  : `${days}d`;
  if (hours > 0) return mins  > 0 ? `${hours}h ${mins}m`  : `${hours}h`;
  return `${mins}m`;
}

/**
 * Derives SLA compliance status given elapsed hours and the target SLA hours.
 * For completed stages, pass the actual elapsed; isActive=false.
 */
function deriveSlaStatus(
  elapsedHours: number,
  targetHours: number,
  isActive: boolean,
): SlaStatus {
  const ratio = elapsedHours / targetHours;
  if (!isActive) return ratio <= 1 ? "completed_ok" : "completed_late";
  if (ratio > 1)    return "breached";
  if (ratio >= 0.75) return "at_risk";
  return "on_track";
}

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

// ── Progress rail constants ───────────────────────────────────────────────────

const APPROVABLE_STAGES: ProgressStage[] = [
  { key: "draft",            label: "Draft" },
  { key: "pending_approval", label: "Submitted" },
  { key: "approved",         label: "Approved" },
  { key: "posted",           label: "Posted" },
  { key: "paid",             label: "Paid" },
];

const NEXT_ACTION_COPY: Record<string, string> = {
  draft:            "Submit for approval — it will be routed to your approver",
  pending_approval: "Awaiting review from Finance Manager",
  approved:         "Ready to post — create accounting entries",
  posted:           "Mark as paid when settlement is confirmed",
  paid:             "Invoice is settled — no further action needed",
};

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
  const statusLabel = statusRaw ? formatLabel(String(statusRaw)) : "Unknown";

  const titleVal = dh?.title_field && data[dh.title_field]
    ? String(data[dh.title_field])
    : undefined;

  const dto: ApprovableDocumentHeaderDTO = {
    identity: {
      typeLabel: dh?.type_label ?? entity.entity_name.toUpperCase(),
      number: numberVal,
      title: titleVal,
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

  // ── Audit trail ─────────────────────────────────────────────────────────────
  const auditOut: ApprovableAudit = {};
  if (dh?.created_at_field    && data[dh.created_at_field])
    auditOut.createdAt       = fmtDate(data[dh.created_at_field]) ?? String(data[dh.created_at_field]);
  if (dh?.created_by_field    && data[dh.created_by_field])
    auditOut.createdBy       = String(data[dh.created_by_field]);
  if (dh?.updated_at_field    && data[dh.updated_at_field])
    auditOut.updatedAt       = fmtDate(data[dh.updated_at_field]) ?? String(data[dh.updated_at_field]);
  if (dh?.updated_by_field    && data[dh.updated_by_field])
    auditOut.updatedBy       = String(data[dh.updated_by_field]);
  if (dh?.status_changed_at_field && data[dh.status_changed_at_field])
    auditOut.statusChangedAt = fmtDate(data[dh.status_changed_at_field]) ?? String(data[dh.status_changed_at_field]);
  if (dh?.status_changed_by_field && data[dh.status_changed_by_field])
    auditOut.statusChangedBy = String(data[dh.status_changed_by_field]);
  if (Object.keys(auditOut).length > 0) dto.audit = auditOut;

  // ── Context counters ────────────────────────────────────────────────────────
  dto.context = {
    lineItems: flags.has_line_items ? 0 : undefined,
  };

  // ── Progress rail ───────────────────────────────────────────────────────────
  const statusKey = typeof statusRaw === "string"
    ? statusRaw.toLowerCase().replace(/[\s-]/g, "_")
    : "draft";
  const stageKey = toStageKey(statusKey);
  const stepIndex = APPROVABLE_STAGES.findIndex((s) => s.key === stageKey);
  const effectiveIndex = stepIndex === -1 ? 0 : stepIndex;
  const currentKey = stepIndex === -1 ? "draft" : stageKey;

  // ── Per-stage timestamps (raw ISO for duration math) ──────────────────────
  const createdAtIso       = dh?.created_at_field         ? (data[dh.created_at_field]         as string | undefined) : undefined;
  const statusChangedAtIso = dh?.status_changed_at_field  ? (data[dh.status_changed_at_field]  as string | undefined) : undefined;

  const createdAtFormatted       = createdAtIso       ? fmtDate(createdAtIso)       : undefined;
  const statusChangedAtFormatted = statusChangedAtIso ? fmtDate(statusChangedAtIso) : undefined;

  function stageReachedAt(i: number): string | undefined {
    if (i > effectiveIndex)   return undefined;
    if (i === 0)              return createdAtFormatted ?? docDateFormatted;
    if (i === effectiveIndex) return statusChangedAtFormatted ?? docDateFormatted;
    return statusChangedAtFormatted ?? docDateFormatted;
  }

  // ── Duration + SLA per stage ───────────────────────────────────────────────
  // Draft:         created_at  → status_changed_at  (or now if still draft)
  // Current stage: status_changed_at → now()
  // Past stages between Draft and current: best-effort (status_changed_at used as boundary)
  // Future stages: no duration

  function stageDurationLabel(i: number): string | undefined {
    if (i > effectiveIndex) return undefined;
    if (i === 0) {
      // Draft: from created_at to status_changed_at (or now if still draft)
      return calcDurationLabel(createdAtIso, effectiveIndex > 0 ? statusChangedAtIso : undefined);
    }
    if (i === effectiveIndex) {
      // Current active stage: from status_changed_at to now
      return calcDurationLabel(statusChangedAtIso);
    }
    // Intermediate completed stages — elapsed within same status_changed_at window
    return undefined;
  }

  // SLA target hours per stage — seeded as 24 h for standard AP.
  // Extracted from entity feature_flags if available; falls back to 24 h default.
  const defaultSlaHours: number = (flags["sla_target_hours"] as number | undefined) ?? 24;

  function stageSlaStatus(i: number, durationLbl: string | undefined): SlaStatus | undefined {
    if (!durationLbl || i > effectiveIndex) return undefined;
    const rawMs = (() => {
      if (i === 0) {
        const from = createdAtIso ? new Date(createdAtIso).getTime() : NaN;
        const to   = effectiveIndex > 0 && statusChangedAtIso
          ? new Date(statusChangedAtIso).getTime()
          : Date.now();
        return isNaN(from) ? NaN : to - from;
      }
      if (i === effectiveIndex) {
        const from = statusChangedAtIso ? new Date(statusChangedAtIso).getTime() : NaN;
        return isNaN(from) ? NaN : Date.now() - from;
      }
      return NaN;
    })();
    if (isNaN(rawMs)) return undefined;
    const elapsedHours = rawMs / 3_600_000;
    const isActive     = i === effectiveIndex;
    return deriveSlaStatus(elapsedHours, defaultSlaHours, isActive);
  }

  dto.progressRail = {
    stages: APPROVABLE_STAGES.map((stage, i) => {
      const durationLabel = stageDurationLabel(i);
      return {
        ...stage,
        reachedAt:      stageReachedAt(i),
        targetAt:       stage.key === "paid" && i > effectiveIndex && dto.dates?.dueDate
          ? dto.dates.dueDate : undefined,
        durationLabel,
        slaTargetHours: i <= effectiveIndex ? defaultSlaHours : undefined,
        slaStatus:      stageSlaStatus(i, durationLabel),
      };
    }),
    currentKey,
    stepIndex: effectiveIndex,
    nextActionCopy: NEXT_ACTION_COPY[currentKey],
  };

  if (NEXT_ACTION_COPY[currentKey]) {
    dto.nextStep = { label: "Next", copy: NEXT_ACTION_COPY[currentKey]! };
  }

  return dto;
}
