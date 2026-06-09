import type { MetaEntityOperation, MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";

export type RuntimeMode = "list" | "detail" | "new" | "edit";

export function operationIntent(operation: MetaEntityOperation): "create" | "edit" | "other" {
  const tokens = new Set(
    [
      operation.permissionCode,
      operation.label ?? "",
      operation.handlerTarget ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );

  if (tokens.has("create") || tokens.has("new") || tokens.has("add") || tokens.has("insert")) return "create";
  if (tokens.has("edit") || tokens.has("update") || tokens.has("write") || tokens.has("save") || tokens.has("patch")) return "edit";
  return "other";
}

export function operationAppliesToMode(
  operation: MetaEntityOperation,
  mode: RuntimeMode,
  hasRecord: boolean,
): boolean {
  if (!operation.enabled || operation.surface === "HIDDEN" || operation.surface === "PALETTE_ONLY") return false;
  if (operation.isRecordRequired && !hasRecord) return false;
  if (mode === "list") return !operation.isRecordRequired && (operation.surface === "LIST" || operation.surface === "BOTH");
  if (mode === "detail" || mode === "edit") return hasRecord && (operation.surface === "DETAIL" || operation.surface === "BOTH");
  return false;
}

export function isCanonicalAction(operation: MetaEntityOperation, mode: RuntimeMode): boolean {
  const intent = operationIntent(operation);
  return (mode === "list" && intent === "create") || ((mode === "detail" || mode === "edit") && intent === "edit");
}

export function operationHref(
  contract: MetaEntityRuntimeDescriptor,
  operation: MetaEntityOperation,
  mode: RuntimeMode,
  recordId?: string,
): string {
  if (operation.handlerType === "NAVIGATE" && operation.handlerTarget) {
    return operation.handlerTarget.replace(/\{id\}/g, encodeURIComponent(recordId ?? ""));
  }
  return currentModeHref(contract, mode, recordId);
}

export function currentModeHref(
  contract: MetaEntityRuntimeDescriptor,
  mode: RuntimeMode,
  recordId?: string,
): string {
  if (mode === "new") return `/app/${contract.routeSlug}/new`;
  if (mode === "edit" && recordId) return `/app/${contract.routeSlug}/${encodeURIComponent(recordId)}/edit`;
  if (mode === "detail" && recordId) return `/app/${contract.routeSlug}/${encodeURIComponent(recordId)}`;
  return `/app/${contract.routeSlug}`;
}
