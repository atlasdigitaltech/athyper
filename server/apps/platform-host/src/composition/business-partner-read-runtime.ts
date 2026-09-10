import type { BusinessPartner360Service, BusinessPartner360PageQuery, BusinessPartner360SectionCode } from "@athyper/server-contract-master-data";
import type { RecordQueryService } from "@athyper/server-contract-records";
import type { EntityAuthorizationRuntimeRegistration, EntityAuthorizationOperationV1 } from "@athyper/server-contract-metadata";
import type { EntityScopeAdapter, EntityListService } from "@athyper/server-service-records";

// Owning provider coordinates are code, never copied from a publication candidate.
const sections = {
  identity_read: "identity", contacts_read: "contacts", addresses_read: "addresses",
  identifier_read: "identifiers-tax", tax_read: "identifiers-tax", bank_read: "banking",
  qualification_read: "qualifications-certificates", certificate_read: "qualifications-certificates",
  credit_read: "credit", requests_read: "requests", activity_read: "activity", network_read: "network",
  comments_read: "comments", attachments_read: "attachments",
  supplier_company_read: "supplier-company", customer_company_read: "customer-company",
} as const satisfies Record<string, BusinessPartner360SectionCode>;
const companyOperations = new Set(["credit_read", "network_read", "supplier_company_read", "customer_company_read"]);

/** Register the same services used by HTTP, preserving their nested projection,
 * independently owned child checks and fresh authorization. No raw repositories. */
export function createBusinessPartnerReadRuntimeRegistrations(
  records: Pick<EntityListService, "list" | "record" | "applicationDescriptor">,
  providers: BusinessPartner360Service,
  scopes: EntityScopeAdapter,
): readonly EntityAuthorizationRuntimeRegistration[] {
  const registration = (operation: EntityAuthorizationOperationV1, invoke: EntityAuthorizationRuntimeRegistration["handler"]["invoke"]): EntityAuthorizationRuntimeRegistration => ({
    entityCode: "business_partner", planeKey: "neon", operation,
    handler: { key: `business_partner.${operation.key}.v1`, invoke },
    resolver: { key: operation.scope, resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
      if (input.entityCode !== "business_partner" || input.operationKey !== operation.key) throw Error("BP_READ_RUNTIME_COORDINATE_MISMATCH");
      return scopes.resolve({ ...input, resolver: operation.scope, target: operation.target });
    } },
  });
  const entries: EntityAuthorizationRuntimeRegistration[] = Object.entries(sections).map(([key, sectionCode]) => registration({
    key, permissionCode: `neon.relationship.bp_target.${key}`,
    scope: companyOperations.has(key) ? "organization-company.record.v1" : "tenant.record.v1",
    target: "existing", effect: "read", requiresParentRead: true, requiresPreflight: false,
    ...(["comments_read", "attachments_read"].includes(key) ? {} : { discoveryOperation: "enter" }),
  }, (query: BusinessPartner360PageQuery) => {
    if (query.context.planeKey !== "neon") throw Error("BP_READ_RUNTIME_PLANE_MISMATCH");
    // Spread first: a supplied sectionCode cannot redirect this operation.
    return providers.section({ ...query, sectionCode });
  }));
  for (const key of ["enter", "discover", "navigate_manage", "navigate_overview"])
    entries.push(registration({ key, permissionCode: `neon.relationship.bp_target.${key}`, scope: "tenant.record.v1", target: "collection", effect: "read", requiresParentRead: false, requiresPreflight: false },
      (query: Parameters<RecordQueryService["list"]>[0]) => {
        if (query.context.planeKey !== "neon" || query.entityCode !== "business_partner") throw Error("BP_READ_RUNTIME_COORDINATE_MISMATCH");
        return key === "enter" ? records.applicationDescriptor(query.context, query.entityCode, query.scopeCoordinate) : records.list(query);
      }));
  entries.push(registration({ key: "read", permissionCode: "neon.relationship.bp_target.read", scope: "tenant.record.v1", target: "existing", effect: "read", requiresParentRead: false, requiresPreflight: false },
    (query: Parameters<RecordQueryService["get"]>[0]) => {
      if (query.context.planeKey !== "neon" || query.entityCode !== "business_partner") throw Error("BP_READ_RUNTIME_COORDINATE_MISMATCH");
      return records.record(query.context, query.entityCode, query.recordId);
    }));
  return entries;
}
