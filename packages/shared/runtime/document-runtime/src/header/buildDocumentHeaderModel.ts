/**
 * buildDocumentHeaderModel
 *
 * Converts a generic CompiledEntity + record data into an EntityHeaderModel
 * (the shared header contract) for all document detail pages.
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
} from "@athyper/entity-runtime/header";
import { statusToIntent, fmtDate, fmtMoneyNumber } from "@athyper/runtime-shared/core";

// ── Stage constants (standard AP/document lifecycle) ─────────────────────────

const DEFAULT_LIFECYCLE_STAGES: Array<{ key: string; label: string }> = [
  { key: "draft",            label: "Draft" },
  { key: "pending_approval", label: "Submitted" },
  { key: "approved",         label: "Approved" },
  { key: "posted",           label: "Posted" },
  { key: "paid",             label: "Paid" },
];

function readLifecycleStages(entity: CompiledEntity): Array<{ key: string; label: string }> {
  const raw =
    entity.display_config?.document_header?.lifecycle_stages ??
    entity.display_config?.lifecycle_stages;

  if (!Array.isArray(raw)) return DEFAULT_LIFECYCLE_STAGES;

  const stages = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const row = entry as Record<string, unknown>;
      const key = typeof row["key"] === "string" ? row["key"].trim() : "";
      const label = typeof row["label"] === "string" ? row["label"].trim() : "";
      return key && label ? { key, label } : null;
    })
    .filter((stage): stage is { key: string; label: string } => Boolean(stage));

  return stages.length > 0 ? stages : DEFAULT_LIFECYCLE_STAGES;
}

function normaliseStageKey(s: string): string {
  const k = s.toLowerCase().replace(/[\s-]/g, "_");
  if (k === "fully_paid" || k === "partially_paid") return "paid";
  return k;
}

function readFirstPresent(data: Record<string, unknown>, ...fieldNames: Array<string | undefined>): unknown {
  for (const fieldName of fieldNames) {
    if (!fieldName) continue;
    const value = data[fieldName];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function formatTimelineDate(value: unknown): string | undefined {
  const input = value instanceof Date ? value.toISOString() : value;
  const formatted = fmtDate(input);
  return formatted === "—" ? undefined : formatted;
}

function hasTimelineValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

// Auto paths can skip intermediate statuses without dedicated timestamp columns.
function fillSkippedCompletedStageDates(values: unknown[], effectiveIndex: number): unknown[] {
  return values.map((value, i) => {
    if (hasTimelineValue(value) || i >= effectiveIndex) return value;

    for (let j = i + 1; j <= effectiveIndex; j += 1) {
      const nextValue = values[j];
      if (hasTimelineValue(nextValue)) return nextValue;
    }

    return undefined;
  });
}

function timelineDateValueForStage(
  data: Record<string, unknown>,
  stageKey: string,
  isCurrent: boolean,
  statusChangedAtField?: string,
): unknown {
  const currentStatusField = isCurrent ? statusChangedAtField : undefined;
  const currentStatusFallback = isCurrent ? "status_changed_at" : undefined;

  switch (normaliseStageKey(stageKey)) {
    case "draft":
      return readFirstPresent(data, "created_at", "created_on");
    case "created":
    case "ready":
      return readFirstPresent(data, "ready_at", "prepared_at", currentStatusField, currentStatusFallback);
    case "pending_approval":
    case "submitted":
      return readFirstPresent(data, "submitted_at", "submission_at", currentStatusField, currentStatusFallback);
    case "approved":
      return readFirstPresent(data, "approved_at", currentStatusField, currentStatusFallback);
    case "posted":
      return readFirstPresent(data, "posted_at", currentStatusField, currentStatusFallback);
    case "paid":
      return readFirstPresent(data, "paid_at", "settled_at", currentStatusField, currentStatusFallback);
    case "reversed":
      return readFirstPresent(data, "reversed_at", currentStatusField, currentStatusFallback);
    case "rejected":
      return readFirstPresent(data, "rejected_at", currentStatusField, currentStatusFallback);
    default:
      return isCurrent ? readFirstPresent(data, currentStatusField, currentStatusFallback) : undefined;
  }
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
      } else if (item.group === "output") {
        placement = "overflow";
      } else {
        // working → secondary
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
  /** Decimal scale from shared.currency.minor_units for the document currency. */
  currencyMinorUnits?: number | null;
}

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Maps a CompiledEntity + raw record data into an EntityHeaderModel.
 *
 * Use in DocumentDetailPage (and other document detail pages) to produce
 * the model consumed by EntityHeader.
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

  const nameVal = dh?.name_field && data[dh.name_field]
    ? String(data[dh.name_field])
    : undefined;

  const typeLabel  = (dh?.type_label ?? entity.entity_name).replace(/_/g, " ").toUpperCase();
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
  const currency = dh?.currency_field ? String(data[dh.currency_field] ?? "") : "";
  const amountVal = dh?.amount_field
    ? fmtMoneyNumber(data[dh.amount_field], {
        currencyCode: currency,
        minorUnits: opts.currencyMinorUnits,
      })
    : undefined;
  if (amountVal) {
    const subtotal = dh?.subtotal_field
      ? fmtMoneyNumber(data[dh.subtotal_field], {
          currencyCode: currency,
          minorUnits: opts.currencyMinorUnits,
        })
      : undefined;
    const tax = dh?.tax_field
      ? fmtMoneyNumber(data[dh.tax_field], {
          currencyCode: currency,
          minorUnits: opts.currencyMinorUnits,
        })
      : undefined;
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

  const lifecycleStages = readLifecycleStages(entity);
  const stageKey  = normaliseStageKey(statusStr);
  const stepIndex = lifecycleStages.findIndex((s) => s.key === stageKey);
  const effectiveIndex = stepIndex === -1 ? 0 : stepIndex;
  const currentKey = stepIndex === -1 ? "draft" : stageKey;

  const createdAtValue       = readFirstPresent(data, dh?.created_at_field, "created_at");
  const statusChangedAtField = dh?.status_changed_at_field ?? "status_changed_at";
  const statusChangedAtValue = readFirstPresent(data, statusChangedAtField, "status_changed_at");
  const createdAtIso         = createdAtValue ? String(createdAtValue) : undefined;
  const statusChangedAtIso   = statusChangedAtValue ? String(statusChangedAtValue) : undefined;

  const rawStageReachedAtValues = lifecycleStages.map((stage, i): unknown => {
    const isPast    = i < effectiveIndex;
    const isCurrent = i === effectiveIndex;

    if (!isPast && !isCurrent) return undefined;
    if (i === 0) return createdAtValue;

    return timelineDateValueForStage(data, stage.key, isCurrent, statusChangedAtField);
  });
  const stageReachedAtValues = fillSkippedCompletedStageDates(rawStageReachedAtValues, effectiveIndex);

  const stages: HeaderProgressStage[] = lifecycleStages.map((stage, i): HeaderProgressStage => {
    const isPast    = i < effectiveIndex;
    const isCurrent = i === effectiveIndex;

    const reachedAtValue = isPast || isCurrent ? stageReachedAtValues[i] : undefined;
    const reachedAt = formatTimelineDate(reachedAtValue);

    const durationLabel = (() => {
      if (i > effectiveIndex) return undefined;
      if (i === 0) return calcDurationLabel(createdAtIso || undefined, effectiveIndex > 0 ? statusChangedAtIso || undefined : undefined);
      if (i === effectiveIndex) return calcDurationLabel(reachedAtValue ? String(reachedAtValue) : undefined);
      return undefined;
    })();

    return {
      key:   stage.key,
      label: stage.label,
      reachedAt,
      durationLabel,
    };
  });

  // ── Assemble model ───────────────────────────────────────────────────────────

  const model: EntityHeaderModel = {
    identity: {
      typeLabel,
      typeHref:        `/app/${entityCode}`,
      typeTooltip:     `View all ${entity.entity_name.toLowerCase()}`,
      name:             opts.resolvedPartyName ?? nameVal ?? numberVal,
      number:           numberVal,
      identifierAction: "copy",
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
  };

  return model;
}
