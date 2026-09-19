import type { EffectiveOperationBinding } from "@athyper/server-contract-auth";
import type { LocalGraphProjection } from "@athyper/server-foundation";

/** Replaces bindings, not grants. Removing an operation from a preview cannot
 * fall through to an older published binding for the same entity. */
export function overlayLocalGraphBindings(
  published: readonly EffectiveOperationBinding[],
  previews: readonly LocalGraphProjection[],
): readonly EffectiveOperationBinding[] {
  const replaced = new Set(previews.map((preview) => preview.entityCode));
  const bindings = published.filter(
    (binding) => !replaced.has(binding.entityCode),
  );
  for (const preview of previews) {
    const descriptor = preview.projection["descriptor"] as
      { operations?: Record<string, { permissionCode?: string }> } | undefined;
    const rows = preview.projection["operationBindings"];
    if (!descriptor?.operations || !Array.isArray(rows))
      throw Error("GRAPH_PREVIEW_BINDINGS_REQUIRED");
    const seen = new Set<string>();
    for (const row of rows) {
      if (
        !row ||
        row.entityCode !== preview.entityCode ||
        typeof row.operationKey !== "string" ||
        seen.has(row.operationKey) ||
        typeof row.permissionCode !== "string" ||
        descriptor.operations[row.operationKey]?.permissionCode !==
          row.permissionCode ||
        typeof row.decisionMode !== "string" ||
        !Array.isArray(row.requiredScopeKinds) ||
        !row.requiredScopeKinds.length ||
        row.requiredScopeKinds.some((kind: unknown) => typeof kind !== "string")
      )
        throw Error("GRAPH_PREVIEW_BINDING_INVALID");
      seen.add(row.operationKey);
      bindings.push(
        Object.freeze({
          entityCode: row.entityCode,
          operationKey: row.operationKey,
          permissionCode: row.permissionCode,
          decisionMode: row.decisionMode,
          requiredScopeKinds: Object.freeze([...row.requiredScopeKinds]),
        }),
      );
    }
    if (seen.size !== Object.keys(descriptor.operations).length)
      throw Error("GRAPH_PREVIEW_BINDING_COVERAGE_REQUIRED");
  }
  return bindings;
}
