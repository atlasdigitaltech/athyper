import type { BusinessPartner360Service } from "@athyper/server-contract-master-data";
import type { EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import type { EntityAccessInput, EntityScopeAdapter } from "@athyper/server-service-records";

/** Same restricted-value owners as HTTP; no raw repository or unprotected value
 * handler. Workflow readiness never consumes a purpose/replay claim. */
export function createBusinessPartnerRevealRuntimeRegistrations(
  service: BusinessPartner360Service, scopes: EntityScopeAdapter,
): readonly EntityAuthorizationRuntimeRegistration[] {
  if (!service.preflightReveal) throw Error("BP_REVEAL_PREFLIGHT_UNAVAILABLE");
  return (["bank", "tax"] as const).map(kind => {
    const key = `${kind}_reveal`;
    return {
      entityCode: "business_partner", planeKey: "neon",
      operation: {key, permissionCode: `neon.relationship.bp_target.${key}`, scope: "tenant.record.v1", target: "existing", effect: "reveal", discoveryOperation: "enter", requiresParentRead: true, requiresPreflight: true},
      handler: {key: `business_partner.${key}.v1`, invoke: (command: Parameters<BusinessPartner360Service["revealBankAccount"]>[0] | Parameters<BusinessPartner360Service["revealTaxRegistration"]>[0]) => {
        if (command.context.planeKey !== "neon") throw Error("BP_REVEAL_RUNTIME_COORDINATE_MISMATCH");
        if (kind === "bank" && "bankAccountLinkId" in command && !("taxRegistrationId" in command)) return service.revealBankAccount(command);
        if (kind === "tax" && "taxRegistrationId" in command && !("bankAccountLinkId" in command)) return service.revealTaxRegistration(command);
        throw Error("BP_REVEAL_RUNTIME_COORDINATE_MISMATCH");
      }},
      resolver: {key: "tenant.record.v1", resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
        if (input.entityCode !== "business_partner" || input.operationKey !== key) throw Error("BP_REVEAL_RUNTIME_COORDINATE_MISMATCH");
        return scopes.resolve({...input, resolver: "tenant.record.v1", target: "existing"});
      }},
      preflight: {key: `business_partner.${key}.preflight.v1`, check: (input: EntityAccessInput) => {
        if (input.context.planeKey !== "neon" || input.operationKey !== key || !input.recordId) throw Error("BP_REVEAL_RUNTIME_COORDINATE_MISMATCH");
        return service.preflightReveal!({context: input.context, businessPartnerId: input.recordId, kind, historical: input.historical});
      }},
    };
  });
}
