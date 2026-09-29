import { parseEntityAuthorizationProfile, type EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import type { RecordQueryService, RecordMutationService } from "@athyper/server-contract-records";
import type { EntityScopeAdapter } from "@athyper/server-service-records";

/**
 * The sole host builder for Entity Framework authorization registrations.
 * Operation semantics, handler keys and scope resolution are host-owned; metadata
 * selects only from this published callable inventory. This is deliberately not a
 * backend scope adapter, which would recursively authorize its own queries.
 */
export function createEntityAuthorizationRegistrations(queries: RecordQueryService, rawProfile: unknown, mutations?: RecordMutationService): readonly EntityAuthorizationRuntimeRegistration[] {
  const profile = parseEntityAuthorizationProfile(rawProfile);
  if (profile.ownership !== "tenant.record.v1" || profile.directory.population !== "tenant"
    || profile.directory.operation !== "list" || profile.recordReadOperation !== "read") return [];
  const resolve: EntityScopeAdapter["resolve"] = async input => {
    if (input.context.planeKey !== profile.planeKey || input.entityCode !== profile.entityCode
      || !input.context.tenantId || input.resolver !== "tenant.record.v1") return { state: "invalid" };
    if (input.target === "existing" && ["read", ...(mutations ? ["patch"] : [])].includes(input.operationKey) && input.recordId) {
      const result = await queries.get({ context: input.context, entityCode: input.entityCode, recordId: input.recordId });
      return result.data ? { state: "resolved", coordinates: {} } : { state: "invalid" };
    }
    if ((input.target === "collection" && input.operationKey === "list") || (input.target === "proposed" && input.operationKey === "create" && mutations)) {
      await queries.list({ context: input.context, entityCode: input.entityCode, limit: 1 });
      return { state: "resolved", coordinates: {} };
    }
    return { state: "invalid" };
  };
  return (["list", "read", ...(mutations ? ["create", "patch"] as const : [])] as const).filter(key => profile.operations.some(operation => operation.key === key)).map(key => ({
    entityCode: profile.entityCode, planeKey: profile.planeKey,
    operation: { key, permissionCode: profile.operations.find(operation => operation.key === key)!.permissionCode, scope: "tenant.record.v1", target: key === "list" ? "collection" : key === "create" ? "proposed" : "existing", effect: key === "list" || key === "read" ? "read" : "write", requiresParentRead: false, requiresPreflight: false },
    handler: { key: `entity.record.${key}.v1`, invoke: key === "list" ? queries.list.bind(queries) : key === "read" ? queries.get.bind(queries) : key === "create" ? mutations!.create.bind(mutations) : mutations!.patch.bind(mutations) },
    resolver: { key: "tenant.record.v1", resolve },
  }));
}
