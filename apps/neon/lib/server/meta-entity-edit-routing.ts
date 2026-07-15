import type { MetaEntityRuntimeDescriptor } from "@athyper/runtime-contracts";

export type MetaEntityEditRouteDecision =
  | { kind: "classic"; renderer: "master" | "simple" }
  | { kind: "document"; descriptor: MetaEntityRuntimeDescriptor }
  | { kind: "configuration_error"; reason: "DOCUMENT_EDIT_RUNTIME_MISSING" }
  | { kind: "reject"; reason: "ENTITY_NOT_FOUND" | "ENTITY_READ_ONLY" };

export function resolveMetaEntityEditRoute(
  descriptor: MetaEntityRuntimeDescriptor | undefined,
): MetaEntityEditRouteDecision {
  if (!descriptor) return { kind: "reject", reason: "ENTITY_NOT_FOUND" };
  if (descriptor.renderer === "document") {
    return descriptor.editRuntime
      ? { kind: "document", descriptor }
      : { kind: "configuration_error", reason: "DOCUMENT_EDIT_RUNTIME_MISSING" };
  }
  if (descriptor.renderer === "ledger" || descriptor.capabilities.isReadOnly) {
    return { kind: "reject", reason: "ENTITY_READ_ONLY" };
  }
  return { kind: "classic", renderer: descriptor.renderer };
}
