import { Clock, MessageSquare, Paperclip, Printer } from "lucide-react";
import type {
  EntityHeaderModel,
  HeaderAction,
  HeaderTab,
  PlatformPanelIcon,
} from "../header";
import type {
  MetaEntityOperation,
  MetaEntityRuntimeDescriptor,
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
  const actions = resolveHeaderActions(contract, record, recordId, mode, actionHrefs, processState, flags);
  const tabs = resolveHeaderTabs(contract, record, processState, flags, mode);
  const { platformIcons, platformIconHrefs } = record
    ? resolvePlatformIcons(contract, recordId, mode)
    : { platformIcons: undefined, platformIconHrefs: {} };

  return {
    header: {
      identity,
      actions,
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
  const name = firstRecordText(contract, record, ["name", "display_name", "title"]);
  const number = firstRecordText(contract, record, ["code", "document_no", "number", "external_code"])
    ?? recordId;
  const status = resolveStatus(contract, record, processState);

  return {
    typeLabel: contract.entityName,
    typeHref: currentModeHref(contract, "list"),
    number,
    name: name && name !== number ? name : undefined,
    identifierAction: "copy",
    status,
    version: contract.capabilities.hasVersions && contract.source.versionNo ? `v${contract.source.versionNo}` : undefined,
  };
}

function resolveStatus(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  processState?: ProcessRuntimeState,
): EntityHeaderModel["identity"]["status"] {
  const value = processState?.lifecycle?.currentState
    ?? firstRecordText(contract, record, ["status", "lifecycle_state", "state"]);
  if (!value) return { label: "Ready", intent: "neutral" };

  const normalized = value.toLowerCase().replace(/[\s_-]+/g, "_");
  if (["active", "posted", "approved", "complete", "completed", "success", "enabled"].includes(normalized)) {
    return { label: titleCase(value), intent: "success" };
  }
  if (["draft", "pending", "in_review", "review", "open"].includes(normalized)) {
    return { label: titleCase(value), intent: "info" };
  }
  if (["blocked", "on_hold", "warning", "suspended"].includes(normalized)) {
    return { label: titleCase(value), intent: "warning" };
  }
  if (["inactive", "failed", "error", "rejected", "void", "deleted"].includes(normalized)) {
    return { label: titleCase(value), intent: "error" };
  }
  return { label: titleCase(value), intent: "neutral" };
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
    actionHrefs["__edit"] = resolveEditHref(contract, recordId);
  }

  if (mode === "edit" && hasRecord) {
    actions.push({
      id: "__view",
      label: "View",
      placement: "secondary",
      order: 10,
    });
    actionHrefs["__view"] = currentModeHref(contract, "detail", recordId);
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

function supportsRecordPrint(contract: MetaEntityRuntimeDescriptor, mode: RuntimeMode): boolean {
  if (mode !== "detail") return false;
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
  return mode === "detail"
    ? [...businessTabs, ...resolveProcessTabs(contract, record, processState, flags)]
    : businessTabs;
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

function resolvePlatformIcons(
  contract: MetaEntityRuntimeDescriptor,
  recordId: string,
  mode: RuntimeMode,
): { platformIcons?: PlatformPanelIcon[]; platformIconHrefs: Record<string, string> } {
  const icons: PlatformPanelIcon[] = [];
  const hrefs: Record<string, string> = {};
  const surfacesByIcon = new Map<string, MetaEntitySurface>();

  for (const surface of contract.surfaces.filter((item) => item.enabled)) {
    const icon = platformIconForSurface(surface);
    if (!icon || surfacesByIcon.has(icon.id)) continue;
    surfacesByIcon.set(icon.id, surface);
  }

  if (supportsRecordPrint(contract, mode)) {
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
  if (surface.kind === "activity_log" || surface.kind === "audit_summary" || surface.kind === "audit_trail") {
    return { id: "activity", label: surface.label, icon: <Clock className="h-5 w-5" /> };
  }
  return null;
}

const PROCESS_TAB_IDS = new Set(["process", "versions"]);
const PROCESS_SURFACE_KINDS = new Set(["workflow", "versions", "compare", "lifecycle"]);

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

  if (hasWorkflow) {
    tabs.push({
      id: "process",
      label: "Process",
      count: approvalCount && approvalCount > 0 ? approvalCount : undefined,
    });
  }

  if (hasVersions) {
    tabs.push({
      id: "versions",
      label: "Versions",
      count: versionCount && versionCount > 0 ? versionCount : undefined,
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
): "lifecycle" | "record" | undefined {
  if (group === "lifecycle") return "lifecycle";
  if (group === "record") return "record";
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
