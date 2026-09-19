import type { BusinessPartnerEligibilityService, CreateBusinessPartnerQualificationCommand } from "@athyper/server-contract-master-data";
import type { EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import type { EntityAccessInput, EntityScopeAdapter } from "@athyper/server-service-records";

export function qualificationPreflight(service: BusinessPartnerEligibilityService, input: EntityAccessInput) {
  const company = input.operationKey === "qualification_company";
  if (!["qualification", "qualification_company"].includes(input.operationKey) || input.context.planeKey !== "neon")
    throw Error("BP_QUALIFICATION_RUNTIME_COORDINATE_MISMATCH");
  if (!service.preflightQualification || !input.recordId || !input.coordinates?.operatingOrganizationId ||
    company !== Boolean(input.coordinates.companyCodeId)) return Promise.resolve("not_applicable" as const);
  return service.preflightQualification({context: input.context, businessPartnerId: input.recordId,
    operatingOrganizationId: input.coordinates.operatingOrganizationId,
    ...(company ? {companyCodeId: input.coordinates.companyCodeId} : {}), historical: input.historical});
}
/** Creation only. Existing-child decisions deliberately have a separate, still
 * unselected operation; they can never enter this proposed-resource handler. */
export function createBusinessPartnerQualificationRuntimeRegistrations(service: BusinessPartnerEligibilityService, scopes: EntityScopeAdapter): readonly EntityAuthorizationRuntimeRegistration[] {
  if (!service.preflightQualification) throw Error("BP_QUALIFICATION_PREFLIGHT_UNAVAILABLE");
  return ([false, true] as const).map(company => {
    const key = company ? "qualification_company" : "qualification";
    const resolver = company ? "organization-company.record.v1" : "organization.record.v1";
    return {entityCode: "business_partner", planeKey: "neon",
      operation: {key, permissionCode: company ? "neon.relationship.bp_target.qualification_company" : "neon.supplier.qualification.admin",
        scope: resolver, target: "proposed", effect: "write", discoveryOperation: "enter", requiresParentRead: false, requiresPreflight: true},
      handler: {key: `business_partner.${key}.v1`, invoke: (command: CreateBusinessPartnerQualificationCommand) => {
        if (command.context.planeKey !== "neon" || !command.businessPartnerId || !command.operatingOrganizationId ||
          company !== Boolean(command.companyCodeId) || "qualificationId" in command)
          throw Error("BP_QUALIFICATION_RUNTIME_COORDINATE_MISMATCH");
        return service.createQualification(command);
      }},
      resolver: {key: resolver, resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
        if (input.entityCode !== "business_partner" || input.operationKey !== key) throw Error("BP_QUALIFICATION_RUNTIME_COORDINATE_MISMATCH");
        return scopes.resolve({...input, resolver, target: "proposed"});
      }},
      preflight: {key: `business_partner.${key}.preflight.v1`, check: (input: EntityAccessInput) => {
        if (input.operationKey !== key) throw Error("BP_QUALIFICATION_RUNTIME_COORDINATE_MISMATCH");
        return qualificationPreflight(service, input);
      }},
    };
  });
}
