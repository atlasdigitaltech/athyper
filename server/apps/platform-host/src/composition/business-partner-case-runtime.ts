import type { BusinessPartnerRequestService } from "@athyper/server-contract-master-data";
import { parseEntityAuthorizationProfile, type EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import type { EntityScopeAdapter } from "@athyper/server-service-records";

const methods = { create: "create", read: "list", update: "patch", validate: "validate", submit: "submit", decide: "decide", materialize: "apply" } as const;

/** These semantics come from the owning service, never the authored candidate. */
export function createBusinessPartnerCaseRuntimeRegistrations(
  service: BusinessPartnerRequestService,
  scopes: EntityScopeAdapter,
): readonly EntityAuthorizationRuntimeRegistration[] {
  return Object.entries(methods).map(([key, method]) => {
    const operationKey = `case_${key}`;
    const target = key === "create" ? "proposed" : key === "read" ? "collection" : "existing";
    return {
      entityCode: "business_partner", planeKey: "neon",
      operation: { key: operationKey, permissionCode: `neon.relationship.entity_case.${key}`,
        scope: "organization.record.v1", target, effect: key === "read" ? "read" : "write",
        discoveryOperation: "enter", requiresParentRead: false, requiresPreflight: key !== "read" },
      handler: { key: `business_partner.${operationKey}.v1`, invoke: service[method].bind(service) },
      resolver: { key: "organization.record.v1", resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
        if (input.operationKey !== operationKey || input.entityCode !== "business_partner") throw Error("CASE_RUNTIME_COORDINATE_MISMATCH");
        return scopes.resolve({ ...input, entityCode: "entity_case", operationKey: key, resolver: "organization.record.v1", target });
      } },
      ...(key === "read" ? {} : { preflight: { key: `business_partner.${operationKey}.preflight.v1`, check: (input: Parameters<EntityScopeAdapter["preflight"]>[0]) => {
        if (input.operationKey !== operationKey) throw Error("CASE_RUNTIME_OPERATION_MISMATCH");
        return scopes.preflight({ ...input, operationKey: key });
      } } }),
    } satisfies EntityAuthorizationRuntimeRegistration;
  });
}

/** Even a supplied compiler registry cannot weaken the owning case boundary. */
export function assertBusinessPartnerCaseRuntimeSemantics(raw: unknown): void {
  const profile = parseEntityAuthorizationProfile(raw);
  if (profile.entityCode !== "business_partner" || profile.planeKey !== "neon") return;
  for (const [key] of Object.entries(methods)) {
    const operation = profile.operations.find(o => o.key === `case_${key}`);
    if (!operation) continue;
    const target = key === "create" ? "proposed" : key === "read" ? "collection" : "existing";
    if (operation.target !== target || operation.scope !== "organization.record.v1" ||
      operation.permissionCode !== `neon.relationship.entity_case.${key}` || operation.requiresParentRead ||
      operation.effect !== (key === "read" ? "read" : "write") || operation.requiresPreflight !== (key !== "read"))
      throw Error(`BP_CASE_RUNTIME_SEMANTICS_MISMATCH:${operation.key}`);
  }
}
