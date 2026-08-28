import { describe, expect, it, vi } from "vitest";
import { parseEntityListDescriptor, parseEntityListResult } from "@athyper/contract-platform-entity-list";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeResolver } from "@athyper/server-contract-records";
import { createEntityListService } from "../entity-list-service.js";
import { createInMemoryRecordPersistence } from "../in-memory-record-repository.js";
import { createRecordListExecutor } from "../query-service.js";

const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "business_partner", planeKey: "neon", releaseId: "release-7", releaseNo: 7, contractHash: "a".repeat(64), compiledHash: "b".repeat(64),
  storage: { schema: "master", object: "business_partner", idField: "partner_uuid", tenantField: "tenant_id", versionField: "row_version" },
  fields: [
    { key: "code", storagePath: "partner_code", type: "string", required: true, writableOn: [], filterable: true, sortable: true },
    { key: "name", storagePath: "display_name", type: "string", required: true, writableOn: [], searchable: true, sortable: true },
    { key: "tax_id", storagePath: "tax_identifier", type: "string", required: false, writableOn: [], readPermissionCode: "partner.tax.read", classification: "sensitive_pii" },
  ],
  operations: { read: { code: "read", permissionCode: "partner.read" } },
};
const context: VerifiedRequestContext = { planeKey: "neon", realmKey: "athyper", tenantId: "tenant-1", principalId: "principal-1", authEpoch: 3, profileHash: "profile", requestId: "request", permissions: { planeKey: "neon", tenantId: "tenant-1", principalId: "principal-1", principalFingerprint: "principal-fingerprint", profileHash: "profile", schemaHash: "schema", resolvedAt: 1, allowed: ["partner.read"], denied: [], planLocked: [], planeExcluded: [], entries: [], authorizationScopes: [] } };
const metadata: MetadataReader = { getEntityDescriptor: async () => descriptor };

describe("safe entity list service", () => {
  it("compiles only authorized public coordinates and normalizes storage identities server-side", async () => {
    const lists = createTestListService({ authorizer: allowReadOnly() });
    const compiled = parseEntityListDescriptor(await lists.descriptor(context, descriptor.entityCode));
    expect(compiled.entity.identityField).toBe("record_id");
    expect(compiled.fields.map((field) => field.key)).toEqual(["record_id", "code", "name"]);
    expect(JSON.stringify(compiled)).not.toContain("partner_uuid");
    expect(JSON.stringify(compiled)).not.toContain("master");
    expect(JSON.stringify(compiled)).not.toContain("tax_identifier");
    const page = parseEntityListResult(await lists.list({ context, entityCode: descriptor.entityCode, limit: 25 }));
    expect(page.rows[0]).toMatchObject({ id: "partner-1", version: 4, values: { record_id: "partner-1", code: "ACME", name: "Acme" } });
    expect(page.rows[0]?.values).not.toHaveProperty("tax_id");
  });

  it("returns context_required and refuses rows for a non-tenant-wide scope", async () => {
    const scope = { permissionCode: "partner.read", tenantWide: false, legalEntityIds: [], companyCodeIds: ["company-1"], operatingOrganizationIds: [], networkMembershipIds: [], visibility: "team" as const };
    const lists = createTestListService({ authorizer: { authorize: async ({ permissionCode, resource }) => permissionCode === "partner.read" ? resource ? { allowed: false, reason: "scope_coordinate_missing" } : { allowed: true, scope } : { allowed: false, reason: "missing_permission" } } });
    await expect(lists.descriptor(context, descriptor.entityCode)).resolves.toMatchObject({ scope: { status: "context_required" } });
    await expect(lists.list({ context, entityCode: descriptor.entityCode })).rejects.toMatchObject({ code: "RECORD_LIST_SCOPE_REQUIRED", statusCode: 409 });
  });

  it("compiles a ready descriptor only from a server-resolved explicit scope", async () => {
    const operatingOrganizationId = "33333333-3333-4333-8333-333333333333";
    const scope = { permissionCode: "partner.read", tenantWide: false, legalEntityIds: [], companyCodeIds: [], operatingOrganizationIds: [operatingOrganizationId], networkMembershipIds: [], visibility: "team" as const };
    const authorizer: Authorizer = { authorize: async ({ permissionCode, resource }) => permissionCode !== "partner.read" ? { allowed: false, reason: "missing_permission" } : !resource ? { allowed: true, scope } : resource["operatingOrganizationId"] === operatingOrganizationId ? { allowed: true, scope } : { allowed: false, reason: "scope_coordinate_missing" } };
    const collectionScopes: RecordCollectionScopeResolver = { resolve: async ({ coordinate }) => coordinate?.operatingOrganizationId === operatingOrganizationId ? { status: "ready", authorizationResource: { operatingOrganizationId }, constraints: [{ kind: "neon.business_partner.operating_organization.v1", operatingOrganizationId }], labels: [{ key: "operating_organization", label: "Operating organization", value: "PROC · Procurement" }], fingerprintMaterial: { operatingOrganizationId } } : { status: "context_required", labels: [{ key: "operating_organization", label: "Operating organization", value: "Selection required" }] } };
    const lists = createTestListService({ authorizer, collectionScopes, operatingOrganizationId });
    const coordinate = { operatingOrganizationId };
    const compiled = await lists.descriptor(context, descriptor.entityCode, coordinate);
    expect(compiled.scope).toMatchObject({ status: "ready", labels: [{ value: "PROC · Procurement" }] });
    const page = await lists.list({ context, entityCode: descriptor.entityCode, scopeCoordinate: coordinate });
    expect(page.scopeFingerprint).toBe(compiled.scope.fingerprint);
  });

  it("compiles intentional list presentation without exposing the storage identity by default", async () => {
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: descriptor.fields.map((field, index) => ({ ...field, filterable: true, list: { label: field.key === "code" ? "Business Partner Code" : field.key === "name" ? "Display Name" : "Tax ID", defaultVisible: field.key !== "tax_id", defaultOrder: index, ...(field.key === "code" ? { semanticRole: "identity" } : {}) } })),
      listPresentation: { identityField: "code", title: "Business Partners", description: "Scoped partners", defaultColumns: ["code", "name"], defaultSort: [{ field: "code", direction: "asc" }], defaultPageSize: 10, allowedPageSizes: [10, 25], supportedModes: ["table", "compact"] },
    };
    const lists = createTestListService({ metadata: { getEntityDescriptor: async () => presented }, descriptor: presented, authorizer: allowReadOnly() });
    const compiled = parseEntityListDescriptor(await lists.descriptor(context, presented.entityCode));
    expect(compiled.entity.identityField).toBe("code");
    expect(compiled.surface.title).toBe("Business Partners");
    expect(compiled.surface.defaultState.columns).toEqual(["code", "name"]);
    expect(compiled.surface.defaultState.sort).toEqual([{ field: "code", direction: "asc" }]);
    expect(compiled.fields.find((field) => field.key === "code")).toMatchObject({ label: "Business Partner Code", semanticRole: "identity" });
    expect(compiled.limits).toMatchObject({ defaultPageSize: 10, allowedPageSizes: [10, 25], maxSortLevels: 3 });
  });

  it("publishes bounded filter options without exposing arbitrary validation metadata", async () => {
    const withOptions: EntityRuntimeDescriptor = { ...descriptor, fields: [...descriptor.fields, { key: "status", storagePath: "status", type: "enum", required: true, writableOn: [], filterable: true, validation: { options: ["active", { value: "draft", label: "Draft record" }], internalRule: "must-not-leak" } }] };
    const lists = createTestListService({ metadata: { getEntityDescriptor: async () => withOptions }, descriptor: withOptions, authorizer: allowReadOnly() });
    const compiled = parseEntityListDescriptor(await lists.descriptor(context, withOptions.entityCode));
    expect(compiled.fields.find((field) => field.key === "status")?.filterOptions).toEqual([{ value: "active", label: "Active" }, { value: "draft", label: "Draft record" }]);
    expect(JSON.stringify(compiled)).not.toContain("must-not-leak");
  });

  it("enforces metadata-restricted operators at the server boundary", async () => {
    const restricted: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: descriptor.fields.map((field) => field.key === "code" ? { ...field, list: { filterOperators: ["contains"] } } : field),
    };
    const lists = createTestListService({ metadata: { getEntityDescriptor: async () => restricted }, descriptor: restricted, authorizer: allowReadOnly() });
    await expect(lists.list({ context, entityCode: restricted.entityCode, filters: [{ field: "code", operator: "eq", value: "ACME" }] })).rejects.toMatchObject({ code: "FILTER_OPERATOR_NOT_ALLOWED", statusCode: 400 });
  });

  it("projects only requested columns and returns server-authoritative group counts", async () => {
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: [...descriptor.fields, { key: "status", storagePath: "status", type: "enum", required: true, writableOn: [], filterable: true, sortable: true, list: { groupable: true } }],
      listPresentation: { schemaVersion: 1, identityField: "code", defaultState: { filters: [], sort: [{ field: "name", direction: "asc" }], columns: ["code", "name", "status"], density: "comfortable", mode: "table" }, supportedModes: ["table"], search: { minimumQueryLength: 1 }, limits: { defaultPageSize: 10, allowedPageSizes: [10], maxSortLevels: 2, countMode: "exact" } },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => presented }, descriptor: presented, authorizer: allowReadOnly(),
      rows: [
        { partner_uuid: "partner-1", tenant_id: context.tenantId, partner_code: "ACME", display_name: "Acme", status: "active", row_version: 1 },
        { partner_uuid: "partner-2", tenant_id: context.tenantId, partner_code: "BETA", display_name: "Beta", status: "active", row_version: 1 },
        { partner_uuid: "partner-3", tenant_id: context.tenantId, partner_code: "DRAFT", display_name: "Draft", status: "draft", row_version: 1 },
      ],
    });
    const page = parseEntityListResult(await lists.list({ context, entityCode: presented.entityCode, fields: ["code"], group: "status", sort: [{ field: "name", direction: "asc" }] }));
    expect(page.rows.map((row) => row.values)).toEqual([{ record_id: "partner-1", code: "ACME", status: "active" }, { record_id: "partner-2", code: "BETA", status: "active" }, { record_id: "partner-3", code: "DRAFT", status: "draft" }]);
    expect(page.rows[0]?.values).not.toHaveProperty("name");
    expect(page.groups).toEqual([{ value: "active", label: "active", count: 2 }, { value: "draft", label: "draft", count: 1 }]);
  });

  it("binds field authorization to tenant, entity, operation, and field coordinates", async () => {
    const authorize = vi.fn<Authorizer["authorize"]>(async ({ permissionCode }) => permissionCode === "partner.read" ? { allowed: true } : { allowed: false, reason: "missing_permission" });
    const lists = createTestListService({ authorizer: { authorize } });

    await lists.descriptor(context, descriptor.entityCode);

    expect(authorize).toHaveBeenCalledWith(expect.objectContaining({
      permissionCode: "partner.tax.read",
      resource: {
        tenantId: context.tenantId,
        entityCode: descriptor.entityCode,
        operationKey: "read",
        resourceCode: descriptor.entityCode,
        field: "tax_id",
      },
    }));
  });

  it("rejects browser queries beyond the descriptor multi-sort limit", async () => {
    const lists = createTestListService({ authorizer: allowReadOnly() });
    await expect(lists.list({ context, entityCode: descriptor.entityCode, sort: [
      { field: "code", direction: "asc" },
      { field: "name", direction: "asc" },
      { field: "code", direction: "desc" },
      { field: "name", direction: "desc" },
    ] })).rejects.toMatchObject({ code: "TOO_MANY_SORT_FIELDS", statusCode: 400 });
  });

  it("executes record authorization only once for a list request", async () => {
    const authorize = vi.fn<Authorizer["authorize"]>(async ({ permissionCode }) => permissionCode === "partner.read" ? { allowed: true } : { allowed: false, reason: "missing_permission" });
    const lists = createTestListService({ authorizer: { authorize } });

    await lists.list({ context, entityCode: descriptor.entityCode });

    expect(authorize.mock.calls.filter(([request]) => request.permissionCode === "partner.read")).toHaveLength(1);
  });
});

function allowReadOnly(): Authorizer { return { authorize: async ({ permissionCode }) => permissionCode === "partner.read" ? { allowed: true } : { allowed: false, reason: "missing_permission" } }; }

function createTestListService(options: {
  readonly authorizer: Authorizer;
  readonly metadata?: MetadataReader;
  readonly descriptor?: EntityRuntimeDescriptor;
  readonly collectionScopes?: RecordCollectionScopeResolver;
  readonly operatingOrganizationId?: string;
  readonly rows?: readonly Readonly<Record<string, unknown>>[];
}) {
  const runtimeDescriptor = options.descriptor ?? descriptor;
  const metadataReader = options.metadata ?? metadata;
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(runtimeDescriptor, context.tenantId, options.rows ?? [{
    partner_uuid: "partner-1",
    tenant_id: context.tenantId,
    partner_code: "ACME",
    display_name: "Acme",
    row_version: 4,
    tax_identifier: "must-not-leak",
    ...(options.operatingOrganizationId ? { __operatingOrganizationIds: [options.operatingOrganizationId] } : {}),
  }]);
  const listExecutor = createRecordListExecutor({
    metadata: metadataReader,
    authorizer: options.authorizer,
    repository: persistence.repository,
    transactions: persistence.transactions,
    ...(options.collectionScopes ? { collectionScopes: options.collectionScopes } : {}),
  });
  return createEntityListService({
    metadata: metadataReader,
    authorizer: options.authorizer,
    listExecutor,
    ...(options.collectionScopes ? { collectionScopes: options.collectionScopes } : {}),
  });
}
