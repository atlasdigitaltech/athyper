/**
 * buildDocumentHeaderModel
 *
 * Converts a generic CompiledEntity + record data into an EntityHeaderModel
 * (the new header contract). This is the Phase 5 VIEW adapter — it replaces
 * buildApprovableHeaderFromRecord + ApprovableDocumentHeaderDTO for all
 * approvable document detail pages.
 *
 * Pure function; no React, no side-effects.
 *
 * Design:
 *   - Uses display_config.document_header field map for identity/facts
 *   - StatusDimension[] → HeaderStatusDimension[] (from orchestrator)
 *   - ActionBundleItem[] → HeaderAction[] (placement mapped from group)
 *   - Progress: lifecycle kind with stage dates from audit fields
 *   - Resolved party/company names passed via opts (async resolved upstream)
 */

import type { CompiledEntity } from "@athyper/api-contracts/metadata";
import type { StatusDimension, ActionBundleItem } from "@athyper/api-contracts/documents";
import type {
  EntityHeaderModel,
  HeaderAction,
  HeaderStatusDimension,
  HeaderFact,
  HeaderProgressStage,
  HeaderAuditMeta,
} from "@athyper/entity-runtime/header";
import { statusToIntent, fmtDate, fmtDateTime, fmtAmountMaybe } from "@athyper/runtime-shared/core";

// ── Stage constants (standard AP/document lifecycle) ─────────────────────────

const LIFECYCLE_STAGES: Array<{ key: string; label: string }> = [
  { key: "draft",            label: "Draft" },
  { key: "pending_approval", label: "Submitted" },
  { key: "approved",         label: "Approved" },
  { key: "posted",           label: "Posted" },
  { key: "paid",             label: "Paid" },
];

function normaliseStageKey(s: string): string {
  const k = s.toLowerCase().replace(/[\s-]/g, "_");
  if (k === "fully_paid" || k === "partially_paid") return "paid";
  return k;
}

// ── Duration label ────────────────────────────────────────────────────────────

function calcDurationLabel(fromIso?: string, toIso?: string): string | undefined {
  if (!fromIso) return undefined;
  const from = new Date(fromIso);
  if (isNaN(from.getTime())) return undefined;
  const to = toIso ? new Date(toIso) : new Date();
  if (isNaN(to.getTime())) return undefined;
  const diffMs = to.getTime() - from.getTime();
  if (diffMs < 0) return undefined;
  const totalMins = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMins / 1_440);
  const hours = Math.floor((totalMins % 1_440) / 60);
  const mins = totalMins % 60;
  if (days  > 0) return hours > 0 ? `${days}d ${hours}h`  : `${days}d`;
  if (hours > 0) return mins  > 0 ? `${hours}h ${mins}m`  : `${hours}h`;
  return `${mins}m`;
}

// ── Action bundle mapping ─────────────────────────────────────────────────────

function mapActionBundle(bundle: ActionBundleItem[]): HeaderAction[] {
  return [...bundle]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item, idx): HeaderAction => {
      let placement: HeaderAction["placement"];
      if (item.is_destructive) {
        placement = "danger";
      } else if (item.group === "primary") {
        placement = "primary";
      } else if (item.group === "overflow") {
        placement = "overflow";
      } else {
        // working | output → secondary
        placement = "secondary";
      }

      return {
        id:             item.action_code,
        label:          item.label,
        placement,
        order:          idx,
        icon:           item.icon_key ?? undefined,
        disabled:       item.is_disabled,
        disabledReason: item.disabled_reason ?? undefined,
      };
    });
}

// ── StatusDimension → HeaderStatusDimension ───────────────────────────────────

function mapStatusDimensions(dims: StatusDimension[]): HeaderStatusDimension[] {
  return dims
    .filter((d) => d.dimension !== "lifecycle")
    .map((d): HeaderStatusDimension => ({
      id:     d.dimension,
      label:  d.label,
      value:  d.status_label,
      intent: d.intent,
    }));
}

// ── Options ───────────────────────────────────────────────────────────────────

export interface MapDocumentHeaderModelOpts {
  /** From orchestrator.statusDimensions — filters out lifecycle dimension automatically. */
  statusDimensions?: StatusDimension[];
  /** From orchestrator.actionBundle. When absent, falls back to empty actions. */
  actionBundle?: ActionBundleItem[];
  /** Resolved supplier/party display name (async). Shows "—" until resolved. */
  resolvedPartyName?: string;
  /** Resolved party code — shown as subValue on the supplier fact. */
  resolvedPartyCode?: string;
  /** Resolved company code record { code, name }. */
  resolvedCompanyCode?: { code: string; name: string };
  /**
   * Tab list for P5. Pass the fully-built tabs from the calling component.
   * Each tab's count/countPending is rendered natively by EntityTabBar.
   */
  tabs?: Array<{ id: string; label: string; count?: number; countPending?: boolean }>;
  /** Override description/subtitle for identity Row 2. Falls back to title_field. */
  description?: string;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Maps a CompiledEntity + raw record data into an EntityHeaderModel.
 *
 * Use in DocumentDetailPage (and other document detail pages) to produce
 * the model consumed by EntityHeader, replacing the old ApprovableDocumentHeaderDTO pattern.
 */
export function buildDocumentHeaderModel(
  entity: CompiledEntity,
  data: Record<string, unknown>,
  opts: MapDocumentHeaderModelOpts = {},
): EntityHeaderModel {
  const dh    = entity.display_config?.document_header;
  const flags = entity.feature_flags ?? {};

  // ── Identity ────────────────────────────────────────────────────────────────

  const rawStatus  = dh?.status_field ? data[dh.status_field] : data["status"];
  const statusStr  = rawStatus != null ? String(rawStatus) : "draft";
  const statusLabel = statusStr
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const numberVal  = dh?.number_field
    ? String(data[dh.number_field] ?? entity.entity_code)
    : entity.entity_code;

  const titleVal   = opts.description
    ?? (dh?.title_field && data[dh.title_field] ? String(data[dh.title_field]) : undefined);

  const typeLabel  = dh?.type_label ?? entity.entity_name.toUpperCase();
  const entityCode = entity.entity_code;

  // ── Facts ────────────────────────────────────────────────────────────────────

  const facts: HeaderFact[] = [];

  // Supplier / Party fact
  const partyDisplay = opts.resolvedPartyName ?? (
    dh?.party_name_field && typeof data[dh.party_name_field] === "string"
      ? String(data[dh.party_name_field])
      : undefined
  );
  if (partyDisplay) {
    facts.push({
      id:       "party",
      label:    "Supplier",
      value:    partyDisplay,
      subValue: opts.resolvedPartyCode,
    });
  }

  // Primary date fact
  const dateFieldVal = dh?.date_field ? data[dh.date_field] : undefined;
  if (dateFieldVal) {
    facts.push({
      id:    "date",
      label: dh?.date_label ?? "Date",
      value: fmtDate(dateFieldVal),
    });
  }

  // Company code fact
  const ccDisplay = opts.resolvedCompanyCode
    ? `${opts.resolvedCompanyCode.code} · ${opts.resolvedCompanyCode.name}`
    : undefined;
  if (ccDisplay) {
    facts.push({ id: "company_code", label: "Company Code", value: ccDisplay });
  }

  // Amount / total fact (xl emphasis)
  const amountVal = dh?.amount_field ? fmtAmountMaybe(data[dh.amount_field]) : undefined;
  if (amountVal) {
    const currency = dh?.currency_field ? String(data[dh.currency_field] ?? "") : "";
    const subtotal = dh?.subtotal_field ? fmtAmountMaybe(data[dh.subtotal_field]) : undefined;
    const tax      = dh?.tax_field      ? fmtAmountMaybe(data[dh.tax_field])      : undefined;
    const subValue = [
      subtotal ? `Subtotal ${subtotal}` : null,
      tax      ? `Tax ${tax}`           : null,
    ].filter(Boolean).join(" · ") || undefined;

    facts.push({
      id:       "total",
      label:    dh?.total_label ?? "Total",
      value:    amountVal,
      currency: currency || undefined,
      xl:       true,
      subValue,
    });
  }

  // ── Progress rail (lifecycle kind) ───────────────────────────────────────────

  const stageKey  = normaliseStageKey(statusStr);
  const stepIndex = LIFECYCLE_STAGES.findIndex((s) => s.key === stageKey);
  const effectiveIndex = stepIndex === -1 ? 0 : stepIndex;
  const currentKey = stepIndex === -1 ? "draft" : stageKey;

  const createdAtIso       = dh?.created_at_field       ? String(data[dh.created_at_field]       ?? "") : undefined;
  const statusChangedAtIso = dh?.status_changed_at_field ? String(data[dh.status_changed_at_field] ?? "") : undefined;

  const stages: HeaderProgressStage[] = LIFECYCLE_STAGES.map((stage, i): HeaderProgressStage => {
    const isPast    = i < effectiveIndex;
    const isCurrent = i === effectiveIndex;

    const reachedAt = isPast || isCurrent
      ? (i === 0 ? fmtDate(createdAtIso)
        : i === effectiveIndex ? fmtDate(statusChangedAtIso)
        : fmtDate(statusChangedAtIso))
      : undefined;

    const durationLabel = (() => {
      if (i > effectiveIndex) return undefined;
      if (i === 0) return calcDurationLabel(createdAtIso || undefined, effectiveIndex > 0 ? statusChangedAtIso || undefined : undefined);
      if (i === effectiveIndex) return calcDurationLabel(statusChangedAtIso || undefined);
      return undefined;
    })();

    return {
      key:   stage.key,
      label: stage.label,
      reachedAt,
      durationLabel,
    };
  });

  // ── Audit meta ──────────────────────────────────────────────────────────────

  let audit: HeaderAuditMeta | undefined;
  const createdAt   = dh?.created_at_field       && data[dh.created_at_field]       ? fmtDateTime(data[dh.created_at_field])       : undefined;
  const createdBy   = dh?.created_by_field       && data[dh.created_by_field]       ? String(data[dh.created_by_field])              : undefined;
  const updatedAt   = dh?.updated_at_field       && data[dh.updated_at_field]       ? fmtDateTime(data[dh.updated_at_field])       : undefined;
  const updatedBy   = dh?.updated_by_field       && data[dh.updated_by_field]       ? String(data[dh.updated_by_field])              : undefined;
  const statusChAt  = dh?.status_changed_at_field && data[dh.status_changed_at_field] ? fmtDateTime(data[dh.status_changed_at_field]) : undefined;
  const statusChBy  = dh?.status_changed_by_field && data[dh.status_changed_by_field] ? String(data[dh.status_changed_by_field])       : undefined;

  if (createdAt || updatedAt) {
    audit = { createdAt, createdBy, updatedAt, updatedBy, statusChangedAt: statusChAt, statusChangedBy: statusChBy };
  }

  // ── Assemble model ───────────────────────────────────────────────────────────

  const model: EntityHeaderModel = {
    identity: {
      typeLabel,
      typeHref:        `/app/${entityCode}`,
      typeTooltip:     `View all ${entity.entity_name.toLowerCase()}`,
      number:          numberVal,
      identifierAction: "copy",
      description:     titleVal,
      status:          {
        label:  statusLabel,
        intent: statusToIntent(rawStatus),
      },
    },

    actions: opts.actionBundle ? mapActionBundle(opts.actionBundle) : [],

    facts:   facts.length > 0 ? facts : undefined,

    statuses: opts.statusDimensions && opts.statusDimensions.length > 0
      ? mapStatusDimensions(opts.statusDimensions)
      : undefined,

    progress: flags["has_lifecycle"] !== false ? {
      kind:       "lifecycle",
      currentKey,
      stepIndex:  effectiveIndex,
      stages,
    } : undefined,

    tabs: opts.tabs,
    audit,
  };

  return model;
}

/** @deprecated Use buildDocumentHeaderModel. */
export { buildDocumentHeaderModel as mapDocumentHeaderModel };
