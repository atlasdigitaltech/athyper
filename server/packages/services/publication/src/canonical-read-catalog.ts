import type { EntityAuthorizationRuntime } from "@athyper/server-contract-metadata";
import type { EntityAuthorizationPermission } from "./entity-authorization-compiler.js";

/** Source constraints are executable dependencies even when no source allow is
 * required. Pin their catalog definitions in the same reviewed catalog as targets.
 * Source scopes are not target grants and do not imply propagation. */
export function assertCanonicalReadSourceCatalog(
  runtime: EntityAuthorizationRuntime,
  catalog: readonly EntityAuthorizationPermission[],
): void {
  if (runtime.schemaVersion !== 2) return;
  for (const transition of runtime.canonicalReadAdmission.transitions) {
    const matches = catalog.filter(
      (p) => p.code === transition.sourcePermissionCode,
    );
    const source = matches[0];
    if (
      matches.length !== 1 ||
      !source ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        source.id,
      ) ||
      !["entity_operation", "capability"].includes(source.kind) ||
      !Array.isArray(source.scopeKinds) ||
      source.scopeKinds.length === 0 ||
      new Set(source.scopeKinds).size !== source.scopeKinds.length
    ) {
      throw new TypeError(
        `Canonical read source catalog unresolved: ${transition.operationKey}:${transition.sourcePermissionCode}`,
      );
    }
  }
}
