import { businessPartnerInitialCaseSchema } from "./business-partner-initial-case-schema.js";

const companyOperationKeys = [
  "discover",
  "read",
  "create",
  "update",
  "validate",
  "submit",
  "decide",
  "materialize",
] as const;
const companyOperationBindings = () =>
  companyOperationKeys.map((operationKey) => ({
    operationKey,
    permissionCode: `neon.relationship.bp_company_setup_request.${operationKey === "discover" ? "read" : operationKey}`,
    scopeKind: "company_code",
  }));

export const companySetupCaseEntityCode =
  "master.business_partner_company_setup_request";
export const companySetupCaseInitialSchema = {
  ...businessPartnerInitialCaseSchema,
  required: [
    ...businessPartnerInitialCaseSchema.required,
    "companyCodeId",
    "operatingOrganizationId",
    "requestedRole",
    "currencyCode",
    "paymentTermId",
    "defaultAccountingProfileId",
  ],
};

/** Registered case identities only. Release keys are server-authored, not input metadata. */
export function businessPartnerCasePublicationIdentity(
  tenantId: string,
  publicationKey: string,
) {
  const suffix = tenantId.replaceAll("-", "");
  if (publicationKey === `metadata.entity.master_business_partner.${suffix}`)
    return {
      entityCode: "master.business_partner",
      operationScopeBindings: [],
    };
  if (
    publicationKey !==
    `metadata.entity.master_business_partner_company_setup_request.${suffix}`
  )
    throw new Error("CASE_CONTRACT_PUBLICATION_IDENTITY_UNREGISTERED");
  return {
    entityCode: companySetupCaseEntityCode,
    operationScopeBindings: companyOperationBindings(),
  };
}

interface CompanyOperationSource {
  readonly entityId: string;
  readonly releaseHash: string;
  readonly graph: Record<string, unknown>;
}
type CompanyPermission = {
  readonly id: string;
  readonly code: string;
  readonly kind: string;
  readonly scopeKinds: readonly string[];
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rows = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

/** Bind to immutable reviewed metadata operations and the current target catalog. */
export function compileCompanyCaseOperationBindings(
  source: CompanyOperationSource,
  catalog: readonly CompanyPermission[],
) {
  if (!uuid.test(source.entityId) || !/^[a-f0-9]{64}$/.test(source.releaseHash))
    throw new Error("COMPANY_CASE_OPERATION_SOURCE_INVALID");
  if (
    (source.graph["entity"] as Record<string, unknown> | undefined)?.[
      "entityCode"
    ] !== "business_partner_company_setup_request"
  )
    throw new Error("COMPANY_CASE_OPERATION_ENTITY_MISMATCH");
  const expectedBindings = companyOperationBindings();
  const operations = rows(source.graph["operations"]).filter(
    (r) => r["status"] !== "deprecated",
  );
  if (operations.length !== expectedBindings.length)
    throw new Error("COMPANY_CASE_OPERATIONS_INCOMPLETE");
  const bindings = expectedBindings.map((expected) => {
    const matches = operations.filter(
      (r) => r["operationKey"] === expected.operationKey,
    );
    if (matches.length !== 1)
      throw new Error("COMPANY_CASE_OPERATION_AMBIGUOUS");
    const operation = matches[0]!;
    if (
      !["discover", "read"].includes(expected.operationKey) &&
      operation["handlerKey"] !==
        `business_partner_company_setup_request.${expected.operationKey}.v1`
    )
      throw new Error("COMPANY_CASE_OPERATION_HANDLER_INVALID");
    const links = rows(source.graph["operationPermissions"]).filter(
      (r) =>
        r["entityOperationId"] === operation["id"] &&
        r["targetPlane"] === "neon" &&
        r["status"] !== "deprecated",
    );
    const scopes = rows(source.graph["operationScopeBindings"]).filter(
      (r) =>
        r["entityOperationId"] === operation["id"] &&
        r["targetPlane"] === "neon" &&
        r["status"] !== "deprecated",
    );
    const permissions = catalog.filter(
      (p) =>
        p.code === expected.permissionCode &&
        p.kind === "entity_operation" &&
        p.scopeKinds.includes("company_code"),
    );
    if (links.length !== 1 || scopes.length !== 1 || permissions.length !== 1)
      throw new Error("COMPANY_CASE_OPERATION_BINDING_UNRESOLVED");
    const link = links[0]!,
      scope = scopes[0]!,
      permission = permissions[0]!;
    const decisionMode =
      expected.operationKey === "discover" ? "collection" : "entity_resource";
    if (
      link["permissionCode"] !== expected.permissionCode ||
      link["permissionKind"] !== "entity_operation" ||
      scope["scopeKind"] !== "company_code" ||
      scope["coordinateSource"] !== "relation_resolver" ||
      scope["resolverKey"] !== "company.record.v1" ||
      scope["decisionMode"] !== decisionMode ||
      scope["missingValueBehavior"] !== "deny" ||
      scope["coordinateKey"] != null ||
      ![operation["id"], link["id"], scope["id"], permission.id].every(
        (v) => typeof v === "string" && uuid.test(v),
      )
    )
      throw new Error("COMPANY_CASE_OPERATION_BINDING_INVALID");
    return {
      bindingId: link["id"],
      scopeBindingId: scope["id"],
      sourceEntityOperationId: operation["id"],
      entityCode: companySetupCaseEntityCode,
      ...expected,
      permissionId: permission.id,
      permissionKind: "entity_operation",
      decisionMode,
      coordinateSource: "relation_resolver",
      coordinateKey: null,
      resolverKey: "company.record.v1",
    };
  });
  return {
    source: { entity_id: source.entityId, release_hash: source.releaseHash },
    operation_scope_bindings: bindings,
  };
}

export function assertCompanyCaseOperationBindings(
  descriptor: Record<string, unknown>,
  entityId: string,
) {
  const source = descriptor["source"] as Record<string, unknown> | undefined;
  const bindings = rows(descriptor["operation_scope_bindings"]);
  if (
    source?.["entity_id"] !== entityId ||
    typeof source["release_hash"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(source["release_hash"])
  )
    throw new Error("COMPANY_CASE_OPERATION_SOURCE_INVALID");
  const expected = companyOperationBindings();
  if (bindings.length !== expected.length)
    throw new Error("COMPANY_CASE_OPERATIONS_INCOMPLETE");
  for (const operation of expected) {
    const matches = bindings.filter(
      (b) => b["operationKey"] === operation.operationKey,
    );
    const b = matches[0];
    if (
      matches.length !== 1 ||
      !b ||
      b["permissionCode"] !== operation.permissionCode ||
      b["scopeKind"] !== "company_code" ||
      b["entityCode"] !== companySetupCaseEntityCode ||
      b["permissionKind"] !== "entity_operation" ||
      b["coordinateSource"] !== "relation_resolver" ||
      b["resolverKey"] !== "company.record.v1" ||
      b["coordinateKey"] !== null ||
      b["decisionMode"] !==
        (operation.operationKey === "discover"
          ? "collection"
          : "entity_resource") ||
      ![
        b["bindingId"],
        b["scopeBindingId"],
        b["sourceEntityOperationId"],
        b["permissionId"],
      ].every((v) => typeof v === "string" && uuid.test(v))
    )
      throw new Error("COMPANY_CASE_OPERATION_BINDING_INVALID");
  }
}
