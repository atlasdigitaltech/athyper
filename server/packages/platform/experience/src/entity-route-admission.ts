import type { ExperienceCatalogRecord } from "./ports.js";
import { isCanonicalEntityCode } from "@athyper/contract-platform-entity-runtime";

export interface PublishedEntityRouteCandidate {
  readonly entityCode: string;
  readonly releaseId: string;
  readonly operations: Readonly<Partial<Record<"list" | "read", string>>>;
}
export interface EntityRouteAdmission {
  readonly entityCode: string;
  readonly releaseId: string;
  readonly operation: "list" | "read";
  readonly permissionCode: string;
  readonly workspaceCode: string;
  readonly moduleCode: string;
  readonly sharedInfrastructure?: boolean;
}
/** The signed operation permission binds navigation to its published catalog
 * module. Source-authoring module ownership is not runtime consumer entitlement.
 * This is navigation admission only; every data request retains authorization. */
export function admitEntityRoutes(candidates: readonly PublishedEntityRouteCandidate[], catalog: ExperienceCatalogRecord,
  permissions: readonly string[]): readonly EntityRouteAdmission[] {
  const allowed = new Set(permissions), result: EntityRouteAdmission[] = [];
  for (const candidate of candidates) {
    if (!isCanonicalEntityCode(candidate.entityCode) || !candidate.releaseId) continue;
    for (const operation of ["list", "read"] as const) {
      const permissionCode = candidate.operations[operation];
      if (!permissionCode || !allowed.has(permissionCode)) continue;
      const modules = new Set(catalog.permissions.filter(p => p.code === permissionCode).map(p => p.moduleId));
      if (modules.size !== 1) continue;
      for (const association of catalog.associations.filter(a => modules.has(a.moduleId))) {
        result.push({ entityCode: candidate.entityCode, releaseId: candidate.releaseId, operation, permissionCode,
          workspaceCode: association.workspaceCode, moduleCode: association.moduleCode,
          ...(association.workspaceSharedInfrastructure ? { sharedInfrastructure: true } : {}) });
      }
    }
  }
  return result;
}
