import { neonCatalogRoutes } from "./catalog-routes";
import { parseEntityApplicationPath } from "@athyper/contract-platform-entity-runtime";
import { isEntityId } from "./route-params";
import { isRecordEntityCode, recordAuthorizationPaths } from "@athyper/product-neon-entity-extensions/record-entities";
/** Catalog ownership is not actor authorization. */
export function resolveEntityRecordContext(entityCode: string, segments: readonly string[]) {
  if (!isRecordEntityCode(entityCode) || segments.length !== 1 || !isEntityId(segments[0]!)) return undefined;
  for (const workspace of neonCatalogRoutes) {
    for (const module of workspace.modules) {
      if (module.entities?.some(entity => entity.code === entityCode)) {
        return { entityCode, recordId: segments[0]!, workspaceCode: workspace.code, moduleCode: module.code };
      }
    }
  }
  return undefined;
}

export function entityRecordAuthorizationPath(pathname: string): string | undefined {
  const route = parseEntityApplicationPath(pathname);
  if (!route) return undefined;
  const record = resolveEntityRecordContext(route.entityCode, route.segments);
  return record ? `${recordAuthorizationPaths[record.entityCode]}/${record.recordId}` : undefined;
}
