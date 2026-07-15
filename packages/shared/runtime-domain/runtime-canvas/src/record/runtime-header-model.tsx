import { Clock, MessageSquare, Paperclip, Printer } from "lucide-react";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import type {
  EntityHeaderModel,
  HeaderAction,
  HeaderFact,
  HeaderStatusDimension,
  HeaderTab,
  PlatformPanelIcon,
} from "../header";
import type {
  MetaEntityHeaderAmountBase,
  MetaEntityOperation,
  MetaEntityRuntimeDescriptor,
  MetaEntityRuntimeHeaderStatus,
  MetaEntitySurface,
  ProcessRuntimeState,
  RuntimeRecordLike,
} from "@athyper/runtime-contracts";
import {
  resolveLifecycleRuntime,
  resolveRuntimeOperations,
} from "@athyper/runtime-contracts";
import type { RuntimeCanvasFlags } from "../surfaces/types";
import {
  readRuntimeRecordField,
  readRuntimeRecordText,
  type RuntimeRecordRow,
  fmtMoneyNumber,
  normaliseCurrencyCode,
  statusToIntent,
} from "@athyper/runtime-shared/core";
import { toNonBlankString } from "@athyper/runtime-shared/meta-entity";
import {
  operationIntent,
  isCanonicalAction,
  operationHref,
  currentModeHref,
  type RuntimeMode,
} from "../operation-utils";

export interface RuntimeRecordChromeModel {
  header: EntityHeaderModel;
  actionHrefs: Record<string, string>;
  tabHrefs: Record<string, string>;
  platformIcons?: PlatformPanelIcon[];
  platformIconHrefs: Record<string, string>;
}

const ACTION_PLACEMENT: Record<MetaEntityOperation["placement"], HeaderAction["placement"]> = {
  PRIMARY: "primary",
  TOOLBAR: "secondary",
  OVERFLOW: "overflow",
  CONTEXT: "overflow",
  COMMAND: "overflow",
};
export const PRINT_ACTION_ID = "__print";

export function buildRuntimeRecordChromeModel({
  contract,
  record,
  recordId,
  mode,
  processState,
  flags,
}: {
  contract: MetaEntityRuntimeDescriptor;
  record?: RuntimeRecordRow;
  recordId: string;
  mode: RuntimeMode;
  processState?: ProcessRuntimeState;
  flags?: RuntimeCanvasFlags;
}): RuntimeRecordChromeModel {
  const actionHrefs: Record<string, string> = {};
  const identity = resolveRuntimeIdentity(contract, record, recordId, processState);
  const facts = resolveHeaderFacts(contract, record, processState);
  const statuses = resolveHeaderStatuses(contract, record);
  const actions = resolveHeaderActions(contract, record, recordId, mode, actionHrefs, processState, flags);
  const tabs = resolveHeaderTabs(contract, record, processState, flags, mode);
  const { platformIcons, platformIconHrefs } = record
    ? resolvePlatformIcons(contract, recordId)
    : { platformIcons: undefined, platformIconHrefs: {} };

  return {
    header: {
      identity,
      actions,
      facts,
      statuses,
      tabs,
    },
    actionHrefs,
    tabHrefs: resolveTabHrefs(contract, recordId),
    platformIcons,
    platformIconHrefs,
  };
}

function resolveRuntimeIdentity(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  recordId: string,
  processState?: ProcessRuntimeState,
): EntityHeaderModel["identity"] {
  const identityConfig = contract.identity;
  const number = firstRecordText(contract, record, identityConfig?.primary?.field ? [identityConfig.primary.field] : []);
  const name = firstRecordText(contract, record, identityConfig?.secondary?.field ? [identityConfig.secondary.field] : []);
  const status = resolveStatus(contract, record, processState, identityConfig?.status);
  const classification = formatClassification(
    firstRecordText(contract, record, identityConfig?.classification?.field ? [identityConfig.classification.field] : []),
  );
  const resolvedNumber = number ?? recordId;

  return {
    typeLabel: contract.entityName,
    typeHref: currentModeHref(contract, "list"),
    number: resolvedNumber,
    name: name && name !== resolvedNumber ? name : undefined,
    classification,
    identifierAction: "copy",
    status,
    version: contract.capabilities.hasVersions && contract.source.versionNo ? `v${contract.source.versionNo}` : undefined,
  };
}

/**
 * Format a snake_case / kebab-case enum value as a title-cased label for
 * display in the identity bar's classification slot. Returns undefined when
 * the source value is missing or empty so the slot stays hidden.
 */
function formatClassification(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Maps the lifecycle_state.config.badge_variant vocabulary (as seeded in
// server/db/seed/platform/003_control/030_control_lifecycle_contract.sql) to the theme's
// SemanticIntent. Anything unrecognized falls through to null so the caller
// can defer to the string-classifier fallback.
function badgeVariantToIntent(variant: string | null | undefined): SemanticIntent | null {
  switch (variant) {
    case "success":   return "success";
    case "info":      return "info";
    case "warning":   return "warning";
    case "danger":    return "error";
    case "secondary": return "neutral";
    case "neutral":   return "neutral";
    default:          return null;
  }
}

function resolveStatus(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState?: ProcessRuntimeState,
  statusConfig?: MetaEntityRuntimeHeaderStatus,
): EntityHeaderModel["identity"]["status"] {
  const processStateFirst = statusConfig?.processStateFirst
    ?? statusConfig?.preferProcessState
    ?? statusConfig?.prefer_process_state
    ?? statusConfig?.process_state_first;
  const configuredStatus = statusConfig?.field
    ? firstRecordText(contract, record, [statusConfig.field])
    : undefined;
  const fallbackStatus = firstRecordText(contract, record, ["status", "lifecycle_state", "state"]);
  const processStatus = isClosedProcessState(processState)
    ? undefined
    : processState?.lifecycle?.currentState;

  const value = (processStateFirst || !statusConfig)
    ? (processStatus ?? configuredStatus ?? fallbackStatus)
    : (configuredStatus ?? processStatus ?? fallbackStatus);

  if (!value) return { label: "Ready", intent: "neutral" };

  // ── Descriptor-driven path (preferred) ─────────────────────────────────
  // control.lifecycle_state.config carries badge_variant + ui_color + icon
  // per state; lifecycle-mask.route.ts joins it onto each mask row and the
  // BFF threads it into contract.lifecycleStateMasks. When the seed exists
  // for this status, that data IS the source of truth — bypass the string
  // classifier entirely so the badge respects per-tenant overrides.
  const mask = contract.lifecycleStateMasks?.find((m) => m.recordStatus === value);
  if (mask?.presentation) {
    const dbIntent = badgeVariantToIntent(mask.presentation.badgeVariant);
    if (dbIntent) {
      return {
        label: mask.presentation.label ?? titleCase(value),
        intent: dbIntent,
      };
    }
  }

  // ── Fallback string classifier ─────────────────────────────────────────
  // Hit when lifecycle_state.config is unseeded (legacy entity), the mask
  // row is missing, or badge_variant carries an unknown token. Buckets
  // cover the union of lifecycle vocabularies across PI, PO, PR, JE,
  // payment, receipt and master-data entities so newer descriptors don't
  // need to seed config metadata to get sensible colors.
  const normalized = value.toLowerCase().replace(/[\s_-]+/g, "_");
  if ([
    "active", "approved", "complete", "completed", "enabled",
    "fully_paid", "matched", "fully_matched", "paid", "posted",
    "published", "reconciled", "success",
  ].includes(normalized)) {
    return { label: titleCase(value), intent: "success" };
  }
  if ([
    "awaiting_approval", "draft", "in_progress", "in_review",
    "open", "partially_paid", "pending", "pending_approval",
    "proforma", "review", "submitted",
  ].includes(normalized)) {
    return { label: titleCase(value), intent: "info" };
  }
  if ([
    "blocked", "disputed", "on_hold", "partially_matched",
    "requires_revision", "returned", "suspended", "warning",
  ].includes(normalized)) {
    return { label: titleCase(value), intent: "warning" };
  }
  if ([
    "cancelled", "canceled", "deleted", "denied", "error", "expired",
    "failed", "inactive", "match_exception", "payment_failed",
    "rejected", "reversed", "void", "voided",
  ].includes(normalized)) {
    return { label: titleCase(value), intent: "error" };
  }
  return { label: titleCase(value), intent: "neutral" };
}

function resolveHeaderFacts(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState?: ProcessRuntimeState,
): HeaderFact[] | undefined {
  const facts: HeaderFact[] = [];
  const amountFact = resolveHeadlineAmountFact(contract, record, processState);
  if (amountFact) facts.push(amountFact);

  const configuredFacts = contract.headerPresentation?.facts ?? [];
  for (const item of configuredFacts) {
    const field = readString(item, "field");
    if (!field) continue;
    const value = firstRecordText(contract, record, [field]);
    if (!value) continue;
    facts.push({
      id: `field:${field}`,
      label: readString(item, "label") ?? labelForField(contract, field),
      value,
      valueType: normalizeFactValueType(readString(item, "value_type") ?? readString(item, "valueType")),
    });
  }

  return facts.length > 0 ? facts : undefined;
}

function resolveHeadlineAmountFact(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState?: ProcessRuntimeState,
): HeaderFact | undefined {
  const amount = contract.headerPresentation?.amount;
  const headline = amount?.headline;
  const field = readString(headline, "field");
  if (!headline || !field) return undefined;

  const rawAmount = readRecordFieldValue(contract, record, field);
  const numericAmount = readNumericValue(rawAmount);
  const currency = resolveHeaderCurrency(contract, record, headline);
  const formatted = fmtMoneyNumber(rawAmount, { currencyCode: currency });
  if (!formatted) return undefined;

  const subValue = [
    resolveBaseAmountSubtext(contract, record, headline, numericAmount, currency),
    resolveSecondaryAmountSubtext(contract, record, processState, amount?.secondary),
  ].filter((item): item is string => Boolean(item)).join(" | ");

  return {
    id: `amount:${field}`,
    label: readString(headline, "label") ?? labelForField(contract, field),
    value: formatted,
    subValue: subValue || undefined,
    valueType: "amount",
    currency,
    xl: true,
  };
}

function resolveBaseAmountSubtext(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  headline: MetaEntityHeaderAmountBase,
  headlineAmount: number | undefined,
  headlineCurrency: string | undefined,
): string | undefined {
  const baseAmountConfig = readObject(headline["base_amount"] ?? headline["baseAmount"]);
  if (!baseAmountConfig) return undefined;

  const baseCurrencyField = readString(baseAmountConfig, "currency_field")
    ?? readString(baseAmountConfig, "currencyField")
    ?? readString(baseAmountConfig, "base_currency_field")
    ?? readString(baseAmountConfig, "baseCurrencyField");
  const baseCurrency = baseCurrencyField
    ? normaliseCurrencyCode(readRecordFieldValue(contract, record, baseCurrencyField))
    : undefined;
  if (!baseCurrency || baseCurrency === headlineCurrency) return undefined;

  const baseField = readString(baseAmountConfig, "field")
    ?? readString(baseAmountConfig, "base_amount_field")
    ?? readString(baseAmountConfig, "baseAmountField");
  const explicitBaseAmount = baseField
    ? readNumericValue(readRecordFieldValue(contract, record, baseField))
    : undefined;
  const exchangeRateField = readString(baseAmountConfig, "exchange_rate_field") ?? readString(baseAmountConfig, "exchangeRateField");
  const exchangeRate = exchangeRateField
    ? readNumericValue(readRecordFieldValue(contract, record, exchangeRateField))
    : undefined;
  const baseAmount = explicitBaseAmount
    ?? (headlineAmount !== undefined && exchangeRate !== undefined ? headlineAmount * exchangeRate : undefined);
  const formatted = fmtMoneyNumber(baseAmount, { currencyCode: baseCurrency });
  return formatted ? `Base ${baseCurrency} ${formatted}` : undefined;
}

function resolveSecondaryAmountSubtext(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState: ProcessRuntimeState | undefined,
  secondary: MetaEntityHeaderAmountBase | undefined,
): string | undefined {
  const field = readString(secondary, "field");
  if (!secondary || !field) return undefined;
  const rawValue = readRecordFieldValue(contract, record, field);
  const amount = readNumericValue(rawValue);
  if (amount === undefined) return undefined;
  const visibleWhen = readObject(secondary["visible_when"] ?? secondary["visibleWhen"]);
  if (visibleWhen && !matchesHeaderVisibility(contract, record, processState, visibleWhen, amount)) return undefined;
  const currency = resolveHeaderCurrency(contract, record, secondary);
  const formatted = fmtMoneyNumber(amount, { currencyCode: currency });
  if (!formatted) return undefined;
  const label = readString(secondary, "label") ?? labelForField(contract, field);
  return `${label} ${currency ? `${currency} ` : ""}${formatted}`;
}

function resolveHeaderStatuses(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
): HeaderStatusDimension[] | undefined {
  const badges = contract.headerPresentation?.status_badges ?? contract.headerPresentation?.statusBadges ?? [];
  const statuses: HeaderStatusDimension[] = [];

  for (const badge of badges) {
    const kind = readString(badge, "kind");
    if (kind === "match_pair") {
      const typeField = readString(badge, "type_field") ?? readString(badge, "typeField");
      const statusField = readString(badge, "status_field") ?? readString(badge, "statusField");
      const typeValue = typeField ? firstRecordText(contract, record, [typeField]) : undefined;
      const statusValue = statusField ? firstRecordText(contract, record, [statusField]) : undefined;
      const value = formatMatchPair(typeValue, statusValue, readString(badge, "format"));
      if (!value) continue;
      statuses.push({
        id: `status:${typeField ?? "type"}:${statusField ?? "status"}`,
        label: readString(badge, "label") ?? "Status",
        value,
        intent: statusToIntent(statusValue),
      });
      continue;
    }

    const field = readString(badge, "field");
    const value = field ? firstRecordText(contract, record, [field]) : undefined;
    if (!field || !value) continue;
    statuses.push({
      id: `status:${field}`,
      label: readString(badge, "label") ?? labelForField(contract, field),
      value: titleCase(value),
      intent: statusToIntent(value),
    });
  }

  return statuses.length > 0 ? statuses : undefined;
}

function resolveHeaderActions(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  recordId: string,
  mode: RuntimeMode,
  actionHrefs: Record<string, string>,
  processState?: ProcessRuntimeState,
  flags?: RuntimeCanvasFlags,
): HeaderAction[] {
  const actions: HeaderAction[] = [];
  const hasRecord = Boolean(record);

  // Hrefs for the canonical view/edit pair are populated in BOTH modes so the
  // DocumentChromeActionBar's View|Edit pill can always navigate either way.
  // The HeaderAction items below stay mode-conditional — the chrome's right-side
  // action bar should only show the *non-current* affordance, while the pill
  // lives in the actionLeadingSlot and shows both sides regardless.
  if (hasRecord && contract.capabilities.canEdit && !contract.capabilities.isReadOnly) {
    actionHrefs["__edit"] = resolveEditHref(contract, recordId);
    actionHrefs["__view"] = currentModeHref(contract, "detail", recordId);
  }

  if (mode === "detail" && hasRecord && contract.capabilities.canEdit && !contract.capabilities.isReadOnly) {
    const disabledReason = resolveEditDisabledReason(contract, record, processState);
    actions.push({
      id: "__edit",
      label: "Edit",
      placement: "primary",
      order: 10,
      disabled: Boolean(disabledReason),
      disabledReason,
    });
  }

  if (mode === "edit" && hasRecord) {
    actions.push({
      id: "__view",
      label: "View",
      placement: "secondary",
      order: 10,
    });
  }

  const resolvedOperations = resolveRuntimeOperations({
    descriptor: contract,
    record: record as RuntimeRecordLike | undefined,
    processState,
    mode,
    includeWorkflowTaskOperations: Boolean(flags?.workflowTaskActionsInHeader)
      || ((processState?.workflow?.userTaskActions?.length ?? 0) > 0),
    includeDisabled: true,
  });

  for (const resolved of resolvedOperations) {
    const operation = resolved.operation;
    if (isCanonicalAction(operation, mode)) continue;

    const id = `operation:${operation.key}`;
    actions.push({
      id,
      label: operation.label ?? operationLabel(operation),
      placement: resolveActionPlacement(operation),
      order: operation.order + 100,
      icon: operation.icon ?? undefined,
      disabled: !resolved.enabled,
      disabledReason: resolved.disabledReason?.message ?? operation.disabledReason,
      group: normalizeActionGroup(operation.actionGroup),
    });
    actionHrefs[id] = operationHref(contract, operation, mode, recordId);
  }

  return actions;
}

function supportsRecordPrint(contract: MetaEntityRuntimeDescriptor): boolean {
  const displayConfig = contract.extensions?.["displayConfig"];
  if (!isRecord(displayConfig) || !Object.hasOwn(displayConfig, "print_config")) return true;
  const printConfig = displayConfig["print_config"];
  return !isRecord(printConfig) || printConfig["enabled"] !== false;
}

function resolveHeaderTabs(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState?: ProcessRuntimeState,
  flags?: RuntimeCanvasFlags,
  mode?: RuntimeMode,
): HeaderTab[] {
  const tabs = contract.surfaces
    .filter((surface) => surface.enabled)
    .filter((surface) => surface.placement === "main" || surface.placement === "header")
    .filter((surface) => !isProcessSurface(surface))
    .map((surface): HeaderTab => ({
      id: surface.key,
      label: surface.kind === "fields" ? "Overview" : surface.label,
    }));

  const businessTabs = tabs.length > 0 ? tabs : [{ id: "fields", label: "Overview" }];
  const resolvedTabs = mode === "detail"
    ? [...businessTabs, ...resolveProcessTabs(contract, record, processState, flags)]
    : businessTabs;
  return applyHeaderTabPresentation(contract, record, processState, resolvedTabs);
}

function resolveTabHrefs(
  contract: MetaEntityRuntimeDescriptor,
  recordId: string,
): Record<string, string> {
  const hrefs: Record<string, string> = {};
  for (const surface of contract.surfaces) {
    if (isProcessSurface(surface) || PROCESS_TAB_IDS.has(surface.key)) continue;
    const href = surfaceHref(contract, surface, recordId);
    if (href) hrefs[surface.key] = href;
  }
  return hrefs;
}

function applyHeaderTabPresentation(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState: ProcessRuntimeState | undefined,
  tabs: HeaderTab[],
): HeaderTab[] {
  const config = contract.headerPresentation?.tabs;
  if (!config) return tabs;

  const visibilityRules = readObject(config["visibility_rules"] ?? config["visibilityRules"]);
  const visibleTabs = visibilityRules
    ? tabs.filter((tab) => {
        const rule = visibilityRules[tab.id] ?? visibilityRules[tabOrderKey(tab)];
        return !rule || matchesHeaderVisibility(contract, record, processState, asRecord(rule));
      })
    : tabs;

  const order = readArray(config["order"])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map(tabOrderToken);
  if (order.length === 0) return visibleTabs;

  const orderIndex = new Map(order.map((key, index) => [key, index] as const));
  return [...visibleTabs].sort((a, b) => {
    const aIndex = bestTabOrderIndex(a, orderIndex);
    const bIndex = bestTabOrderIndex(b, orderIndex);
    if (aIndex !== bIndex) return aIndex - bIndex;
    return tabs.indexOf(a) - tabs.indexOf(b);
  });
}

function resolvePlatformIcons(
  contract: MetaEntityRuntimeDescriptor,
  recordId: string,
): { platformIcons?: PlatformPanelIcon[]; platformIconHrefs: Record<string, string> } {
  const icons: PlatformPanelIcon[] = [];
  const hrefs: Record<string, string> = {};
  const surfacesByIcon = new Map<string, MetaEntitySurface>();

  for (const surface of contract.surfaces.filter((item) => item.enabled)) {
    const icon = platformIconForSurface(surface);
    if (!icon || surfacesByIcon.has(icon.id)) continue;
    surfacesByIcon.set(icon.id, surface);
  }

  if (supportsRecordPrint(contract)) {
    icons.push({ id: "print", label: "Print", icon: <Printer className="h-5 w-5" /> });
  }

  for (const iconId of ["comments", "attachments", "activity"] as const) {
    const surface = surfacesByIcon.get(iconId);
    if (!surface) continue;
    const icon = platformIconForSurface(surface);
    if (!icon) continue;
    icons.push(icon);

    const href = surfaceHref(contract, surface, recordId);
    if (href) hrefs[icon.id] = href;
  }

  return {
    platformIcons: icons.length > 0 ? icons : undefined,
    platformIconHrefs: hrefs,
  };
}

function platformIconForSurface(surface: MetaEntitySurface): PlatformPanelIcon | null {
  if (surface.kind === "comments") {
    return { id: "comments", label: surface.label, icon: <MessageSquare className="h-5 w-5" /> };
  }
  if (surface.kind === "attachments") {
    return { id: "attachments", label: surface.label, icon: <Paperclip className="h-5 w-5" /> };
  }
  if (surface.kind === "activity_log" || surface.kind === "audit_summary") {
    return { id: "activity", label: surface.label, icon: <Clock className="h-5 w-5" /> };
  }
  return null;
}

const PROCESS_TAB_IDS = new Set(["process", "approvals", "lifecycle", "versions", "audit"]);
const PROCESS_SURFACE_KINDS = new Set(["workflow", "versions", "compare", "lifecycle", "audit_trail"]);

function isProcessSurface(surface: MetaEntitySurface): boolean {
  return PROCESS_SURFACE_KINDS.has(surface.kind);
}

function resolveProcessTabs(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState: ProcessRuntimeState | undefined,
  flags?: RuntimeCanvasFlags,
): HeaderTab[] {
  if (flags?.disabledProcessTabs) return [];

  const tabs: HeaderTab[] = [];
  const metadata = readRuntimePresentation(record);
  const hasWorkflow = contract.capabilities.hasWorkflow
    || contract.workflow?.enabled === true
    || Boolean(processState?.workflow)
    || contract.surfaces.some((surface) => surface.enabled && surface.kind === "workflow");
  const approvalCount = readApprovalBadgeCount(processState, metadata);
  const versionCount = readVersionBadgeCount(contract, record, processState, metadata);
  const hasVersions = contract.capabilities.hasVersions
    || versionCount !== undefined
    || contract.surfaces.some((surface) => surface.enabled && surface.kind === "versions");
  // Lifecycle tab reads log.entity_lifecycle_log (state-transition history)
  // via the existing /versions endpoint. Show it whenever the record has
  // either workflow or versioning concepts — both imply a lifecycle exists.
  // Also honour an explicit `lifecycle` surface declaration so descriptors
  // can opt in independently when needed.
  const hasLifecycle = hasWorkflow
    || hasVersions
    || contract.surfaces.some((surface) => surface.enabled && surface.kind === "lifecycle");
  // Audit tab reads log.audit_log (column-level mutation history with
  // reason_code from Phase 3). Show wherever Lifecycle or Versions show —
  // any record that has either of those will accrue audit_log rows. An
  // explicit `audit_trail` surface declaration opts in standalone.
  const hasAudit = hasLifecycle
    || contract.surfaces.some((surface) => surface.enabled && surface.kind === "audit_trail");

  if (hasWorkflow) {
    tabs.push({
      id: "approvals",
      label: "Approvals",
      count: approvalCount && approvalCount > 0 ? approvalCount : undefined,
    });
  }

  if (hasLifecycle) {
    tabs.push({
      id: "lifecycle",
      label: "Lifecycle",
    });
  }

  if (hasVersions) {
    tabs.push({
      id: "versions",
      label: "Versions",
      count: versionCount && versionCount > 0 ? versionCount : undefined,
    });
  }

  if (hasAudit) {
    tabs.push({
      id: "audit",
      label: "Audit",
    });
  }

  return tabs;
}

function readApprovalBadgeCount(
  processState: ProcessRuntimeState | undefined,
  metadata: RuntimePresentation,
): number | undefined {
  const approvals = readObject(processState?.["approvals"]);
  return readNumber(approvals?.["myPendingCount"])
    ?? readNumber(approvals?.["pendingCount"])
    ?? processState?.workflow?.pendingTasks
    ?? (metadata.approvalActions.length > 0 ? metadata.approvalActions.length : undefined);
}

function readVersionBadgeCount(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState: ProcessRuntimeState | undefined,
  metadata: RuntimePresentation,
): number | undefined {
  const versions = readObject(processState?.["versions"]);
  return readNumber(versions?.["count"])
    ?? (Array.isArray(versions?.["items"]) ? versions["items"].length : undefined)
    ?? (metadata.versionCount > 0 ? metadata.versionCount : undefined)
    ?? (contract.capabilities.hasVersions && contract.source.versionNo ? contract.source.versionNo : undefined)
    ?? readNumericRecordValue(record, ["version", "row_version"]);
}

interface RuntimePresentation {
  approvalActions: string[];
  versionCount: number;
}

function readRuntimePresentation(record: RuntimeRecordRow | undefined): RuntimePresentation {
  const metadata = readRecordObject(record, "metadata");
  const uiPresentation = readObject(metadata?.["uiPresentation"]);
  return {
    approvalActions: readStringArray(uiPresentation?.["approvals"], "actions"),
    versionCount: readArray(uiPresentation?.["versions"]).length,
  };
}

function readRecordObject(record: RuntimeRecordRow | undefined, key: string): Record<string, unknown> | undefined {
  const data = isRecord(record?.data) ? record.data : {};
  return readObject(data[key] ?? record?.[key]);
}

function readNumericRecordValue(record: RuntimeRecordRow | undefined, keys: string[]): number | undefined {
  const data = isRecord(record?.data) ? record.data : {};
  for (const key of keys) {
    const value = data[key] ?? record?.[key];
    const numeric = readNumber(value);
    if (numeric !== undefined) return numeric;
  }
  return undefined;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readStringArray(source: unknown, key: string): string[] {
  const object = readObject(source);
  return readArray(object?.[key]).filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function readString(record: unknown, key: string): string | undefined {
  const value = isRecord(record) ? record[key] : undefined;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readRecordFieldValue(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  fieldName: string,
): unknown {
  const field = contract.fields.find((item) => item.name === fieldName || item.columnName === fieldName);
  return field
    ? readRuntimeRecordField(record, field.name, field.columnName)
    : readRuntimeRecordField(record, fieldName);
}

function resolveHeaderCurrency(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  config: MetaEntityHeaderAmountBase,
): string | undefined {
  const configuredCode = normaliseCurrencyCode(config["currency_code"]);
  if (configuredCode) return configuredCode;
  const currencyField = readString(config, "currency_field") ?? readString(config, "currencyField");
  return currencyField ? normaliseCurrencyCode(readRecordFieldValue(contract, record, currencyField)) : undefined;
}

function resolveRecordStatus(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState: ProcessRuntimeState | undefined,
): string | undefined {
  return (isClosedProcessState(processState) ? undefined : processState?.lifecycle?.currentState)
    ?? firstRecordText(contract, record, ["status", "lifecycle_state", "state"]);
}

function isClosedProcessState(processState: ProcessRuntimeState | undefined): boolean {
  const workflowStatus = normalizeStatusToken(processState?.workflow?.status);
  return workflowStatus === "closed"
    || workflowStatus === "complete"
    || workflowStatus === "completed"
    || workflowStatus === "done"
    || workflowStatus === "cancelled";
}

function matchesHeaderVisibility(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState: ProcessRuntimeState | undefined,
  rule: Record<string, unknown>,
  currentValue?: number,
): boolean {
  const statusList = readStringList(rule["status_in"] ?? rule["statusIn"]).map(normalizeStatusToken);
  if (statusList.length > 0) {
    const status = normalizeStatusToken(resolveRecordStatus(contract, record, processState));
    if (!status || !statusList.includes(status)) return false;
  }

  const threshold = readNumericValue(rule["field_gt"] ?? rule["fieldGt"]);
  if (threshold !== undefined) {
    const field = readString(rule, "field");
    const value = field
      ? readNumericValue(readRecordFieldValue(contract, record, field))
      : currentValue;
    if (value === undefined || value <= threshold) return false;
  }

  const fieldEquals = rule["field_equals"] ?? rule["fieldEquals"];
  if (Array.isArray(fieldEquals) && typeof fieldEquals[0] === "string") {
    const actual = readRecordFieldValue(contract, record, fieldEquals[0]);
    if (String(actual ?? "") !== String(fieldEquals[1] ?? "")) return false;
  }

  return true;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function normalizeStatusToken(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

function normalizeFactValueType(value: string | undefined): HeaderFact["valueType"] {
  if (value === "text" || value === "code" || value === "date" || value === "amount" || value === "enum") {
    return value;
  }
  return undefined;
}

function labelForField(contract: MetaEntityRuntimeDescriptor, fieldName: string): string {
  const field = contract.fields.find((item) => item.name === fieldName || item.columnName === fieldName);
  return field?.label ?? titleCase(fieldName);
}

function formatMatchPair(typeValue: string | undefined, statusValue: string | undefined, format?: string): string | undefined {
  const type = formatMatchType(typeValue);
  const status = statusValue ? titleCase(statusValue) : undefined;
  if (!type && !status) return undefined;
  if (format) {
    return format
      .replace(/\{type\}/g, type ?? "")
      .replace(/\{status\}/g, status ?? "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return [type, status].filter(Boolean).join(" - ");
}

function formatMatchType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const token = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (token === "two_way" || token === "2_way" || token === "2way") return "2-way";
  if (token === "three_way" || token === "3_way" || token === "3way") return "3-way";
  return titleCase(value);
}

function tabOrderToken(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function tabOrderKey(tab: HeaderTab): string {
  if (tab.id === "fields") return "details";
  if (tab.id.includes("document_identity_summary")) return "identity";
  if (tab.id.includes("document_identity_panel_v2")) return "identity";
  if (tab.id.includes("accounting") || tab.label.toLowerCase().includes("accounting")) return "accounting_distributions";
  if (tab.id.includes("component") || tab.label.toLowerCase().includes("component")) return "components";
  return tabOrderToken(tab.id);
}

function bestTabOrderIndex(tab: HeaderTab, orderIndex: Map<string, number>): number {
  const candidates = [
    tabOrderKey(tab),
    tabOrderToken(tab.id),
    tabOrderToken(tab.label),
  ];
  for (const candidate of candidates) {
    const index = orderIndex.get(candidate);
    if (index !== undefined) return index;
  }
  return Number.MAX_SAFE_INTEGER;
}

function surfaceHref(
  contract: MetaEntityRuntimeDescriptor,
  surface: MetaEntitySurface,
  recordId: string,
): string | undefined {
  if (surface.kind === "fields") return undefined;
  if (surface.placement === "subroute") {
    return `${currentModeHref(contract, "detail", recordId)}/${encodeURIComponent(surface.key)}`;
  }
  return `#${surface.key}`;
}

function firstRecordText(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  candidates: string[],
): string | undefined {
  for (const candidate of candidates) {
    const field = contract.fields.find((fieldItem) => (
      fieldItem.name === candidate || fieldItem.columnName === candidate
    ));
    const value = field ? readRuntimeRecordField(record, field.name, field.columnName) : readRuntimeRecordText(record, candidate);
    const text = toNonBlankString(value);
    if (text) return text;
  }
  return undefined;
}

function resolveEditHref(contract: MetaEntityRuntimeDescriptor, recordId: string): string {
  const editOperation = contract.operations.find((operation) => (
    operation.enabled
    && (operation.surface === "DETAIL" || operation.surface === "BOTH")
    && operationIntent(operation) === "edit"
  ));

  return editOperation
    ? operationHref(contract, editOperation, "detail", recordId)
    : currentModeHref(contract, "edit", recordId);
}

function resolveEditDisabledReason(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState?: ProcessRuntimeState,
): string | undefined {
  if (!contract.lifecycle?.enabled) return undefined;
  const lifecycle = resolveLifecycleRuntime({
    descriptor: contract,
    record: record as RuntimeRecordLike | undefined,
    processState,
  });
  return lifecycle.terminal ? "Record is in a terminal lifecycle state." : undefined;
}

function operationLabel(operation: MetaEntityOperation): string {
  const parts = operation.permissionCode.split(/[.:_/-]+/).filter(Boolean);
  return titleCase(parts.at(-1) ?? operation.permissionCode);
}

function resolveActionPlacement(operation: MetaEntityOperation): HeaderAction["placement"] {
  if (operation.intent === "danger" && (operation.placement === "OVERFLOW" || operation.placement === "CONTEXT")) {
    return "danger";
  }
  return ACTION_PLACEMENT[operation.placement] ?? "overflow";
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeActionGroup(
  group: string | null | undefined,
): "lifecycle" | "record" | "workflow_task" | undefined {
  if (group === "lifecycle") return "lifecycle";
  if (group === "record") return "record";
  if (group === "workflow_task") return "workflow_task";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
