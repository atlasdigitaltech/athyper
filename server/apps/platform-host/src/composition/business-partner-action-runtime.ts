import type { BusinessPartnerRequestService, CreateBusinessPartnerRequestCommand } from "@athyper/server-contract-master-data";
import type { RecordQueryService } from "@athyper/server-contract-records";
import type { EntityAuthorizationRuntimeRegistration } from "@athyper/server-contract-metadata";
import type { EntityScopeAdapter } from "@athyper/server-service-records";

const variants = {
  request_supplier: ["new_partner"], add_role: ["add_supplier", "add_customer"],
  amend_partner: ["amend_partner"], assign_organization: ["assign_organization"],
  configure_company: ["configure_company"], change_bank: ["change_bank"],
  lifecycle: ["deactivate", "reactivate", "archive"],
} as const;

/** Header and section aliases delegate to the same governed case owner.
 * A variant cannot be used to submit a different class of mutation. */
export function createBusinessPartnerActionRuntimeRegistrations(
  requests: BusinessPartnerRequestService, records: RecordQueryService, scopes: EntityScopeAdapter,
): readonly EntityAuthorizationRuntimeRegistration[] {
  const entries: EntityAuthorizationRuntimeRegistration[] = Object.entries(variants).map(([key, kinds]) => {
    const scope = key === "configure_company" ? "organization-company.record.v1" : "organization.record.v1";
    return {
      entityCode: "business_partner", planeKey: "neon",
      operation: {key, permissionCode: key === "configure_company" ? "neon.relationship.bp_target.configure_company" : "neon.relationship.entity_case.create", scope, target: "proposed", effect: "write", discoveryOperation: "enter", requiresParentRead: key !== "request_supplier", requiresPreflight: true},
      handler: {key: `business_partner.${key}.v1`, invoke: async (command: CreateBusinessPartnerRequestCommand) => {
        if (command.context.planeKey !== "neon" || !(kinds as readonly string[]).includes(command.kind) || (key === "request_supplier" && command.requestedRole !== "supplier")) throw Error("BP_ACTION_RUNTIME_VARIANT_MISMATCH");
        if (key !== "request_supplier") {
          if (!command.targetBusinessPartnerId) throw Error("BP_ACTION_RUNTIME_PARENT_REQUIRED");
          const parent = await records.get({context: command.context, entityCode: "business_partner", recordId: command.targetBusinessPartnerId});
          if (!parent.data) throw Error("BP_ACTION_RUNTIME_PARENT_UNAVAILABLE");
        }
        return requests.create(command);
      }},
      resolver: {key: scope, resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
        if (input.entityCode !== "business_partner" || input.operationKey !== key) throw Error("BP_ACTION_RUNTIME_COORDINATE_MISMATCH");
        // Proposed organization/company ownership is validated by the database;
        // an existing BP assignment is not a prerequisite for its first request.
        return scopes.resolve({...input, entityCode: "entity_case", operationKey: "create", target: "proposed", resolver: scope});
      }},
      preflight: {key: `business_partner.${key}.preflight.v1`, check: (input: Parameters<EntityScopeAdapter["preflight"]>[0]) => {
        if (input.operationKey !== key) throw Error("BP_ACTION_RUNTIME_COORDINATE_MISMATCH");
        return scopes.preflight({...input, operationKey: "create"});
      }},
    };
  });
  entries.push({entityCode: "business_partner", planeKey: "neon",
    operation: {key: "navigate_review", permissionCode: "neon.relationship.entity_case.read", scope: "organization.record.v1", target: "collection", effect: "read", discoveryOperation: "enter", requiresParentRead: false, requiresPreflight: false},
    handler: {key: "business_partner.navigate_review.v1", invoke: requests.list.bind(requests)},
    resolver: {key: "organization.record.v1", resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
      if (input.entityCode !== "business_partner" || input.operationKey !== "navigate_review") throw Error("BP_ACTION_RUNTIME_COORDINATE_MISMATCH");
      return scopes.resolve({...input, entityCode: "entity_case", operationKey: "read", resolver: "organization.record.v1", target: "collection"});
    }},
  });
  return entries;
}
