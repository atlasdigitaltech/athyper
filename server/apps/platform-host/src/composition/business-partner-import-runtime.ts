import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { BusinessPartnerRequestService } from "@athyper/server-contract-master-data";
import type { EntityScopeAdapter } from "@athyper/server-service-records";
import { createBusinessPartnerGovernedImport, MasterDataError } from "@athyper/server-service-master-data";

/** Real deployment adapters for the proposed import owner. This factory does not
 * install an HTTP route or select the unreviewed handler for publication. */
export function createBusinessPartnerImportRuntime(options: {
  readonly requests: BusinessPartnerRequestService;
  readonly authorizer: Authorizer;
  readonly scopes: EntityScopeAdapter;
  readonly refreshContext: (context: VerifiedRequestContext) => Promise<VerifiedRequestContext>;
}) {
  return createBusinessPartnerGovernedImport({
    requests: options.requests, refreshContext: options.refreshContext,
    async authorizeGateway(context) {
      const decision = await options.authorizer.authorize({context,
        permissionCode: "neon.relationship.bp_target.import",
        resource: {tenantId: context.tenantId, entityCode: "business_partner", operationKey: "import", authorizationTarget: "proposed"},
      });
      if (!decision.allowed) throw new MasterDataError(403, "BP_GOVERNED_IMPORT_FORBIDDEN", "Governed import is not authorized");
    },
    async resolveRow(context, row) {
      const coordinates = {operatingOrganizationId: row.operatingOrganizationId, ...(row.companyCodeId ? {companyCodeId: row.companyCodeId} : {})};
      const scope = await options.scopes.resolve({context, entityCode: "entity_case", operationKey: "create", phase: "execute", target: "proposed", resolver: row.companyCodeId ? "organization-company.record.v1" : "organization.record.v1", coordinates});
      if (scope.state !== "resolved" || Object.entries(coordinates).some(([k,v]) => Reflect.get(scope.coordinates, k) !== v)) throw new MasterDataError(403, "BP_GOVERNED_IMPORT_SCOPE_INVALID", "Import organization/company is unavailable");
      // The gateway never substitutes for each proposed row's case-create grant.
      const decision = await options.authorizer.authorize({context, permissionCode: "neon.relationship.entity_case.create", resource: {tenantId: context.tenantId, entityCode: "entity_case", operationKey: "create", authorizationTarget: "proposed", ...scope.coordinates}});
      if (!decision.allowed) throw new MasterDataError(403, "BP_GOVERNED_IMPORT_ROW_FORBIDDEN", "Import row creation is not authorized");
    },
  });
}
