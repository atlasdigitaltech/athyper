import type {
  BusinessPartner360Service,
  BusinessPartner360PageQuery,
  BusinessPartner360SectionCode,
} from "@athyper/server-contract-master-data";
import { BUSINESS_PARTNER_360_PERMISSIONS as P } from "@athyper/server-contract-master-data";
import type { RecordQueryService } from "@athyper/server-contract-records";
import type {
  EntityAuthorizationRuntimeRegistration,
  EntityAuthorizationOperationV1,
} from "@athyper/server-contract-metadata";
import type {
  EntityScopeAdapter,
  EntityListService,
} from "@athyper/server-service-records";

// Owning provider coordinates are code, never copied from a publication candidate.
const sections = {
  identity_read: "identity",
  contacts_read: "contacts",
  addresses_read: "addresses",
  identifier_read: "identifiers-tax",
  tax_read: "identifiers-tax",
  bank_read: "banking",
  qualification_read: "qualifications-certificates",
  certificate_read: "qualifications-certificates",
  credit_read: "credit",
  requests_read: "requests",
  activity_read: "activity",
  network_read: "network",
  comments_read: "comments",
  attachments_read: "attachments",
  supplier_company_read: "supplier-company",
  customer_company_read: "customer-company",
} as const satisfies Record<string, BusinessPartner360SectionCode>;
// Authorization ownership is distinct from the provider's required data context.
// Company/credit providers still require and validate company context; their
// canonical permissions are granted on operating organizations, not company_code.
const organizationOperations = new Set([
  "credit_read",
  "supplier_company_read",
  "customer_company_read",
  "requests_read",
  "activity_read",
]);
const sectionPermissions: Record<keyof typeof sections, string> = {
  identity_read: P.identity,
  contacts_read: P.contact,
  addresses_read: P.address,
  identifier_read: P.identifierMasked,
  tax_read: P.taxMasked,
  bank_read: P.bankMasked,
  qualification_read: P.qualification,
  certificate_read: P.certificate,
  credit_read: P.credit,
  requests_read: P.request,
  activity_read: P.activity,
  network_read: P.network,
  comments_read: P.comment,
  attachments_read: P.attachment,
  supplier_company_read: P.record,
  customer_company_read: P.record,
};

/** Publisher and callable registrations share this owning contract. Never infer
 * permissions or scope from a candidate merely to make qualification pass. */
export function businessPartnerReadOperationContracts(): readonly EntityAuthorizationOperationV1[] {
  return [
    ...Object.keys(sections).map<EntityAuthorizationOperationV1>((key) => ({
      key,
      permissionCode: sectionPermissions[key as keyof typeof sections],
      scope: organizationOperations.has(key)
        ? "organization.record.v1"
        : "tenant.record.v1",
      target: "existing" as const,
      effect: "read" as const,
      requiresParentRead: true,
      requiresPreflight: false,
      ...(["comments_read", "attachments_read"].includes(key)
        ? {}
        : { discoveryOperation: "enter" }),
    })),
    ...[
      "enter",
      "discover",
      "navigate_manage",
      "navigate_overview",
    ].map<EntityAuthorizationOperationV1>((key) => ({
      key,
      permissionCode: P.record,
      scope: "tenant.record.v1",
      target: "collection" as const,
      effect: "read" as const,
      requiresParentRead: false,
      requiresPreflight: false,
    })),
    {
      key: "read",
      permissionCode: P.record,
      scope: "tenant.record.v1",
      target: "existing",
      effect: "read",
      requiresParentRead: false,
      requiresPreflight: false,
    },
  ];
}

/** Register the same services used by HTTP, preserving their nested projection,
 * independently owned child checks and fresh authorization. No raw repositories. */
export function createBusinessPartnerReadRuntimeRegistrations(
  records: Pick<EntityListService, "list" | "record" | "applicationDescriptor">,
  providers: BusinessPartner360Service,
  scopes: EntityScopeAdapter,
  applicationDescriptor?: Pick<
    EntityListService,
    "applicationDescriptor"
  >["applicationDescriptor"],
): readonly EntityAuthorizationRuntimeRegistration[] {
  const contracts = new Map(
    businessPartnerReadOperationContracts().map((operation) => [
      operation.key,
      operation,
    ]),
  );
  const registration = (
    operation: EntityAuthorizationOperationV1,
    invoke: EntityAuthorizationRuntimeRegistration["handler"]["invoke"],
  ): EntityAuthorizationRuntimeRegistration => ({
    entityCode: "business_partner",
    planeKey: "neon",
    operation,
    handler: { key: `business_partner.${operation.key}.v1`, invoke },
    resolver: {
      key: operation.scope,
      resolve: (input: Parameters<EntityScopeAdapter["resolve"]>[0]) => {
        if (
          input.entityCode !== "business_partner" ||
          input.operationKey !== operation.key
        )
          throw Error("BP_READ_RUNTIME_COORDINATE_MISMATCH");
        return scopes.resolve({
          ...input,
          resolver: operation.scope,
          target: operation.target,
        });
      },
    },
  });
  const entries: EntityAuthorizationRuntimeRegistration[] = Object.entries(
    sections,
  ).map(([key, sectionCode]) =>
    registration(contracts.get(key)!, (query: BusinessPartner360PageQuery) => {
      if (query.context.planeKey !== "neon")
        throw Error("BP_READ_RUNTIME_PLANE_MISMATCH");
      // Spread first: a supplied sectionCode cannot redirect this operation.
      return providers.section({ ...query, sectionCode });
    }),
  );
  for (const key of [
    "enter",
    "discover",
    "navigate_manage",
    "navigate_overview",
  ])
    entries.push(
      registration(
        contracts.get(key)!,
        (query: Parameters<RecordQueryService["list"]>[0]) => {
          if (
            query.context.planeKey !== "neon" ||
            query.entityCode !== "business_partner"
          )
            throw Error("BP_READ_RUNTIME_COORDINATE_MISMATCH");
          return key === "enter"
            ? (
                applicationDescriptor ??
                records.applicationDescriptor.bind(records)
              )(query.context, query.entityCode, query.scopeCoordinate)
            : records.list(query);
        },
      ),
    );
  entries.push(
    registration(
      contracts.get("read")!,
      (query: Parameters<RecordQueryService["get"]>[0]) => {
        if (
          query.context.planeKey !== "neon" ||
          query.entityCode !== "business_partner"
        )
          throw Error("BP_READ_RUNTIME_COORDINATE_MISMATCH");
        return records.record(query.context, query.entityCode, query.recordId);
      },
    ),
  );
  return entries;
}
