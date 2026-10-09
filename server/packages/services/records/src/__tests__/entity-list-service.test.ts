import { describe, expect, it, vi } from "vitest";
import {
  parseEntityListDescriptor,
  parseEntityListResult,
} from "@athyper/contract-platform-entity-list";
import { parseEntityRecordPresentation } from "@athyper/contract-platform-entity-runtime";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import type { RecordCollectionScopeResolver } from "@athyper/server-contract-records";
import { createEntityListService } from "../entity-list-service.js";
import { createInMemoryRecordPersistence } from "../in-memory-record-repository.js";
import {
  createRecordListExecutor,
  createRecordQueryService,
} from "../query-service.js";

const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "business_partner",
  planeKey: "neon",
  releaseId: "release-7",
  releaseNo: 7,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: {
    schema: "master",
    object: "business_partner",
    idField: "partner_uuid",
    tenantField: "tenant_id",
    versionField: "row_version",
  },
  fields: [
    {
      key: "code",
      storagePath: "partner_code",
      type: "string",
      required: true,
      writableOn: [],
      filterable: true,
      sortable: true,
    },
    {
      key: "name",
      storagePath: "display_name",
      type: "string",
      required: true,
      writableOn: [],
      searchable: true,
      sortable: true,
    },
    {
      key: "tax_id",
      storagePath: "tax_identifier",
      type: "string",
      required: false,
      writableOn: [],
      readPermissionCode: "partner.tax.read",
      classification: "sensitive_pii",
    },
  ],
  operations: { read: { code: "read", permissionCode: "partner.read" } },
};
const context: VerifiedRequestContext = {
  planeKey: "neon",
  realmKey: "athyper",
  tenantId: "tenant-1",
  principalId: "principal-1",
  authEpoch: 3,
  profileHash: "profile",
  requestId: "request",
  permissions: {
    planeKey: "neon",
    tenantId: "tenant-1",
    principalId: "principal-1",
    principalFingerprint: "principal-fingerprint",
    profileHash: "profile",
    schemaHash: "schema",
    resolvedAt: 1,
    allowed: ["partner.read"],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
};
const metadata: MetadataReader = {
  getEntityDescriptor: async () => descriptor,
};

describe("safe entity list service", () => {
  it("compiles only authorized public coordinates and normalizes storage identities server-side", async () => {
    const lists = createTestListService({ authorizer: allowReadOnly() });
    const compiled = parseEntityListDescriptor(
      await lists.descriptor(context, descriptor.entityCode),
    );
    expect(compiled.entity.identityField).toBe("code");
    expect(compiled.fields.map((field) => field.key)).toEqual(["code", "name"]);
    expect(JSON.stringify(compiled)).not.toContain("partner_uuid");
    expect(JSON.stringify(compiled)).not.toContain("master");
    expect(JSON.stringify(compiled)).not.toContain("tax_identifier");
    const page = parseEntityListResult(
      await lists.list({
        context,
        entityCode: descriptor.entityCode,
        limit: 25,
      }),
    );
    expect(page.rows[0]).toMatchObject({
      id: "partner-1",
      version: 4,
      values: { code: "ACME", name: "Acme" },
    });
    expect(page.rows[0]?.values).not.toHaveProperty("tax_id");
  });

  it("returns context_required and refuses rows for a non-tenant-wide scope", async () => {
    const scope = {
      permissionCode: "partner.read",
      tenantWide: false,
      legalEntityIds: [],
      companyCodeIds: ["company-1"],
      operatingOrganizationIds: [],
      networkMembershipIds: [],
      visibility: "team" as const,
    };
    const lists = createTestListService({
      authorizer: {
        authorize: async ({ permissionCode, resource }) =>
          permissionCode === "partner.read"
            ? resource
              ? { allowed: false, reason: "scope_coordinate_missing" }
              : { allowed: true, scope }
            : { allowed: false, reason: "missing_permission" },
      },
    });
    await expect(
      lists.descriptor(context, descriptor.entityCode),
    ).resolves.toMatchObject({ scope: { status: "context_required" } });
    await expect(
      lists.list({ context, entityCode: descriptor.entityCode }),
    ).rejects.toMatchObject({
      code: "RECORD_LIST_SCOPE_REQUIRED",
      statusCode: 409,
    });
  });

  it("compiles a ready descriptor only from a server-resolved explicit scope", async () => {
    const operatingOrganizationId = "33333333-3333-4333-8333-333333333333";
    const scope = {
      permissionCode: "partner.read",
      tenantWide: false,
      legalEntityIds: [],
      companyCodeIds: [],
      operatingOrganizationIds: [operatingOrganizationId],
      networkMembershipIds: [],
      visibility: "team" as const,
    };
    const authorizer: Authorizer = {
      authorize: async ({ permissionCode, resource }) =>
        permissionCode !== "partner.read"
          ? { allowed: false, reason: "missing_permission" }
          : !resource
            ? { allowed: true, scope }
            : resource["operatingOrganizationId"] === operatingOrganizationId
              ? { allowed: true, scope }
              : { allowed: false, reason: "scope_coordinate_missing" },
    };
    const collectionScopes: RecordCollectionScopeResolver = {
      resolve: async ({ coordinate }) =>
        coordinate?.operatingOrganizationId === operatingOrganizationId
          ? {
              status: "ready",
              authorizationResource: { operatingOrganizationId },
              constraints: [
                {
                  kind: "neon.business_partner.operating_organization.v1",
                  operatingOrganizationId,
                },
              ],
              labels: [
                {
                  key: "operating_organization",
                  label: "Operating organization",
                  value: "PROC · Procurement",
                },
              ],
              fingerprintMaterial: { operatingOrganizationId },
            }
          : {
              status: "context_required",
              labels: [
                {
                  key: "operating_organization",
                  label: "Operating organization",
                  value: "Selection required",
                },
              ],
            },
    };
    const lists = createTestListService({
      authorizer,
      collectionScopes,
      operatingOrganizationId,
    });
    const coordinate = { operatingOrganizationId };
    const compiled = await lists.descriptor(
      context,
      descriptor.entityCode,
      coordinate,
    );
    expect(compiled.scope).toMatchObject({
      status: "ready",
      labels: [{ value: "PROC · Procurement" }],
    });
    const page = await lists.list({
      context,
      entityCode: descriptor.entityCode,
      scopeCoordinate: coordinate,
    });
    expect(page.scopeFingerprint).toBe(compiled.scope.fingerprint);
  });

  it("compiles intentional list presentation without exposing the storage identity by default", async () => {
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      detailRouteTemplate: "/mdg/business-partner/:recordId",
      fields: descriptor.fields.map((field, index) => ({
        ...field,
        filterable: true,
        list: {
          label:
            field.key === "code"
              ? "Business Partner Code"
              : field.key === "name"
                ? "Display Name"
                : "Tax ID",
          defaultVisible: field.key !== "tax_id",
          defaultOrder: index,
          ...(field.key === "code" ? { semanticRole: "identity" } : {}),
        },
      })),
      listPresentation: {
        identityField: "code",
        title: "Business Partners",
        description: "Scoped partners",
        defaultColumns: ["code", "name"],
        defaultSort: [{ field: "code", direction: "asc" }],
        defaultPageSize: 10,
        allowedPageSizes: [10, 25],
        supportedModes: ["table", "compact"],
      },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => presented },
      descriptor: presented,
      authorizer: allowReadOnly(),
    });
    const compiled = parseEntityListDescriptor(
      await lists.descriptor(context, presented.entityCode),
    );
    expect(compiled.entity.identityField).toBe("code");
    expect(compiled.entity.detailRouteTemplate).toBe(
      "/mdg/business-partner/:recordId",
    );
    expect(compiled.surface.title).toBe("Business Partners");
    expect(compiled.surface.defaultState.columns).toEqual(["code", "name"]);
    expect(compiled.surface.defaultState.sort).toEqual([
      { field: "code", direction: "asc" },
    ]);
    expect(compiled.fields.find((field) => field.key === "code")).toMatchObject(
      { label: "Business Partner Code", semanticRole: "identity" },
    );
    expect(compiled.limits).toMatchObject({
      defaultPageSize: 10,
      allowedPageSizes: [10, 25],
      maxSortLevels: 3,
    });
  });

  it("reports declared modes it cannot render instead of silently dropping them", async () => {
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      listPresentation: {
        identityField: "code",
        title: "Business Partners",
        defaultColumns: ["code", "name"],
        supportedModes: ["table", "board", "compact", "dashboard"],
      },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => presented },
      descriptor: presented,
      authorizer: allowReadOnly(),
    });
    const compiled = parseEntityListDescriptor(
      await lists.descriptor(context, presented.entityCode),
    );
    expect(compiled.surface.supportedModes).toEqual(["table", "compact"]);
    expect(compiled.surface.unavailableModes).toEqual([
      { mode: "board", code: "LIST_MODE_UNSUPPORTED" },
      { mode: "dashboard", code: "LIST_MODE_UNSUPPORTED" },
    ]);
  });

  it("offers Board with its lanes and card content when the lane field is usable", async () => {
    const boardDescriptor = (
      countMode: "exact" | "approximate",
    ): EntityRuntimeDescriptor => ({
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: "stage",
          storagePath: "stage",
          type: "enum",
          required: false,
          writableOn: [],
          filterable: true,
          sortable: true,
          // A groupable enum publishes its choices: grouping is bounded by
          // the choice list (Tree blueprint section 2.1).
          validation: { options: ["open", "won"] },
          list: { groupable: true },
        },
      ],
      listPresentation: {
        identityField: "code",
        title: "Business Partners",
        defaultColumns: ["code", "name", "stage"],
        supportedModes: ["table", "compact", "board"],
        limits: {
          defaultPageSize: 10,
          allowedPageSizes: [10],
          maxSortLevels: 2,
          countMode,
        },
        board: {
          laneFields: [
            {
              field: "stage",
              choices: [
                { value: "open", label: "Open", tone: "warning", position: 1 },
                { value: "won", label: "Won", tone: "success", position: 2 },
              ],
              lanes: [
                {
                  key: "open",
                  label: "Open",
                  values: ["open"],
                  tone: "warning",
                  collapsed: false,
                  terminal: false,
                },
                {
                  key: "won",
                  label: "Won",
                  values: ["won"],
                  tone: "success",
                  collapsed: false,
                  terminal: true,
                },
              ],
            },
          ],
        },
        cardContent: { fields: [{ field: "name" }, { field: "tax_id" }] },
      },
    });
    const exact = boardDescriptor("exact");
    const compiled = parseEntityListDescriptor(
      await createTestListService({
        metadata: { getEntityDescriptor: async () => exact },
        descriptor: exact,
        authorizer: allowReadOnly(),
      }).descriptor(context, exact.entityCode),
    );
    expect(compiled.surface.supportedModes).toEqual([
      "table",
      "compact",
      "board",
    ]);
    expect(compiled.surface.unavailableModes).toBeUndefined();
    expect(
      compiled.surface.board?.laneFields.map((item) => [
        item.field,
        item.noValueLane,
        item.lanes.map((lane) => lane.key),
      ]),
    ).toEqual([["stage", true, ["open", "won"]]]);
    // tax_id is not readable for this viewer, so card content never widens to it.
    expect(compiled.surface.cardContent).toEqual({
      fields: [{ field: "name" }],
    });

    const approximate = boardDescriptor("approximate");
    const limited = parseEntityListDescriptor(
      await createTestListService({
        metadata: { getEntityDescriptor: async () => approximate },
        descriptor: approximate,
        authorizer: allowReadOnly(),
      }).descriptor(context, approximate.entityCode),
    );
    expect(limited.surface.supportedModes).toEqual(["table", "compact"]);
    expect(limited.surface.unavailableModes).toEqual([
      { mode: "board", code: "LIST_BOARD_COUNTS_UNAVAILABLE" },
    ]);
    expect(limited.surface.board).toBeUndefined();
  });

  it("offers Calendar when a date field is usable and reports why when it is not", async () => {
    const calendarDescriptor = (
      startFilterable: boolean,
    ): EntityRuntimeDescriptor => ({
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: "due_on",
          storagePath: "due_on",
          type: "date",
          required: false,
          writableOn: [],
          filterable: startFilterable,
          sortable: true,
        },
      ],
      listPresentation: {
        identityField: "code",
        title: "Business Partners",
        defaultColumns: ["code", "name", "due_on"],
        supportedModes: ["table", "calendar"],
        calendar: { defaultView: "agenda", dateFields: [{ start: "due_on" }] },
      },
    });
    const usable = calendarDescriptor(true);
    const compiled = parseEntityListDescriptor(
      await createTestListService({
        metadata: { getEntityDescriptor: async () => usable },
        descriptor: usable,
        authorizer: allowReadOnly(),
      }).descriptor(context, usable.entityCode),
    );
    expect(compiled.surface.supportedModes).toEqual(["table", "calendar"]);
    expect(compiled.surface.calendar).toEqual({
      defaultView: "agenda",
      dateFields: [
        { start: "due_on", label: "Due On", kind: "date", unscheduled: true },
      ],
    });
    const blocked = calendarDescriptor(false);
    const limited = parseEntityListDescriptor(
      await createTestListService({
        metadata: { getEntityDescriptor: async () => blocked },
        descriptor: blocked,
        authorizer: allowReadOnly(),
      }).descriptor(context, blocked.entityCode),
    );
    expect(limited.surface.supportedModes).toEqual(["table"]);
    expect(limited.surface.unavailableModes).toEqual([
      { mode: "calendar", code: "LIST_CALENDAR_DATE_FIELD_UNAVAILABLE" },
    ]);
    expect(limited.surface.calendar).toBeUndefined();
  });

  it("omits unavailable modes when every declared mode is renderable", async () => {
    const lists = createTestListService({ authorizer: allowReadOnly() });
    const compiled = parseEntityListDescriptor(
      await lists.descriptor(context, descriptor.entityCode),
    );
    expect(compiled.surface).not.toHaveProperty("unavailableModes");
  });

  it("derives the record-card title role from the published record title and passes card priority", async () => {
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: descriptor.fields.map((field) => ({
        ...field,
        ...(field.key === "code"
          ? { list: { cardPriority: "primary" as const } }
          : {}),
        ...(field.key === "tax_id"
          ? {
              list: {
                semanticRole: "tax_reference",
                cardPriority: "hidden" as const,
              },
            }
          : {}),
      })),
      listPresentation: {
        identityField: "code",
        title: "Business Partners",
        defaultColumns: ["code", "name"],
        supportedModes: ["table", "compact"],
      },
      recordPresentation: parseEntityRecordPresentation({
        schemaVersion: 1,
        titleField: "name",
        sections: [
          { key: "overview", label: "Overview", fields: ["code", "name"] },
        ],
      }),
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => presented },
      descriptor: presented,
      authorizer: allowReadOnly(),
    });
    const compiled = parseEntityListDescriptor(
      await lists.descriptor(context, presented.entityCode),
    );
    expect(compiled.fields.find((field) => field.key === "name")).toMatchObject(
      { semanticRole: "title" },
    );
    expect(compiled.fields.find((field) => field.key === "code")).toMatchObject(
      { cardPriority: "primary" },
    );
    expect(
      compiled.fields.find((field) => field.key === "code"),
    ).not.toHaveProperty("semanticRole");
    // An identity that is also the record title keeps its identity slot only.
    const identityTitled = {
      ...presented,
      recordPresentation: parseEntityRecordPresentation({
        schemaVersion: 1,
        titleField: "code",
        sections: [{ key: "overview", label: "Overview", fields: ["code"] }],
      }),
    };
    const identityLists = createTestListService({
      metadata: { getEntityDescriptor: async () => identityTitled },
      descriptor: identityTitled,
      authorizer: allowReadOnly(),
    });
    const identityCompiled = parseEntityListDescriptor(
      await identityLists.descriptor(context, presented.entityCode),
    );
    expect(
      identityCompiled.fields.some((field) => field.semanticRole === "title"),
    ).toBe(false);
  });

  it("publishes bounded filter options without exposing arbitrary validation metadata", async () => {
    const withOptions: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: "status",
          storagePath: "status",
          type: "enum",
          required: true,
          writableOn: [],
          filterable: true,
          validation: {
            options: ["active", { value: "draft", label: "Draft record" }],
            internalRule: "must-not-leak",
          },
        },
      ],
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => withOptions },
      descriptor: withOptions,
      authorizer: allowReadOnly(),
    });
    const compiled = parseEntityListDescriptor(
      await lists.descriptor(context, withOptions.entityCode),
    );
    expect(
      compiled.fields.find((field) => field.key === "status")?.filterOptions,
    ).toEqual([
      { value: "active", label: "Active" },
      { value: "draft", label: "Draft record" },
    ]);
    expect(JSON.stringify(compiled)).not.toContain("must-not-leak");
  });

  it("enforces metadata-restricted operators at the server boundary", async () => {
    const restricted: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: descriptor.fields.map((field) =>
        field.key === "code"
          ? { ...field, list: { filterOperators: ["contains"] } }
          : field,
      ),
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => restricted },
      descriptor: restricted,
      authorizer: allowReadOnly(),
    });
    await expect(
      lists.list({
        context,
        entityCode: restricted.entityCode,
        filters: [{ field: "code", operator: "eq", value: "ACME" }],
      }),
    ).rejects.toMatchObject({
      code: "FILTER_OPERATOR_NOT_ALLOWED",
      statusCode: 400,
    });
  });

  it("projects only requested columns and returns server-authoritative group counts", async () => {
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: "status",
          storagePath: "status",
          type: "enum",
          required: true,
          writableOn: [],
          filterable: true,
          sortable: true,
          list: { groupable: true },
        },
      ],
      listPresentation: {
        schemaVersion: 1,
        identityField: "code",
        defaultState: {
          filters: [],
          sort: [{ field: "name", direction: "asc" }],
          columns: ["code", "name", "status"],
          density: "comfortable",
          mode: "table",
        },
        supportedModes: ["table"],
        search: { minimumQueryLength: 1 },
        limits: {
          defaultPageSize: 10,
          allowedPageSizes: [10],
          maxSortLevels: 2,
          countMode: "exact",
        },
      },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => presented },
      descriptor: presented,
      authorizer: allowReadOnly(),
      rows: [
        {
          partner_uuid: "partner-1",
          tenant_id: context.tenantId,
          partner_code: "ACME",
          display_name: "Acme",
          status: "active",
          row_version: 1,
        },
        {
          partner_uuid: "partner-2",
          tenant_id: context.tenantId,
          partner_code: "BETA",
          display_name: "Beta",
          status: "active",
          row_version: 1,
        },
        {
          partner_uuid: "partner-3",
          tenant_id: context.tenantId,
          partner_code: "DRAFT",
          display_name: "Draft",
          status: "draft",
          row_version: 1,
        },
      ],
    });
    const page = parseEntityListResult(
      await lists.list({
        context,
        entityCode: presented.entityCode,
        fields: ["code"],
        group: "status",
        sort: [{ field: "name", direction: "asc" }],
        countMode: "exact",
      }),
    );
    expect(page.rows.map((row) => row.values)).toEqual([
      { code: "ACME", status: "active" },
      { code: "BETA", status: "active" },
      { code: "DRAFT", status: "draft" },
    ]);
    expect(page.rows[0]?.values).not.toHaveProperty("name");
    expect(page.groups).toEqual([
      { value: "active", label: "active", count: 2 },
      { value: "draft", label: "draft", count: 1 },
    ]);
    // Group counts follow the count-mode rule: none without exact counts.
    const uncounted = parseEntityListResult(
      await lists.list({
        context,
        entityCode: presented.entityCode,
        fields: ["code"],
        group: "status",
        sort: [{ field: "name", direction: "asc" }],
      }),
    );
    expect(uncounted.groups).toBeUndefined();
  });

  it("emits tree row fields only on hierarchy responses (Tree blueprint section 5.3)", async () => {
    const tree: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: "parent",
          storagePath: "parent_uuid",
          type: "reference",
          required: false,
          writableOn: [],
          filterable: true,
        },
      ],
      hierarchy: { parentField: "parent", maxDepth: 5 },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => tree },
      descriptor: tree,
      authorizer: allowReadOnly(),
      rows: [
        { partner_uuid: "p-1", tenant_id: context.tenantId, partner_code: "1000", display_name: "Root", parent_uuid: null, row_version: 1 },
        { partner_uuid: "p-2", tenant_id: context.tenantId, partner_code: "1100", display_name: "Child", parent_uuid: "p-1", row_version: 1 },
        { partner_uuid: "p-3", tenant_id: context.tenantId, partner_code: "1200", display_name: "Orphan", parent_uuid: "p-hidden", row_version: 1 },
      ],
    });
    const request = { context, entityCode: tree.entityCode, sort: [{ field: "code", direction: "asc" as const }] };
    const flat = await lists.list(request);
    expect(flat.rows).toHaveLength(3);
    for (const row of flat.rows) {
      expect(row).not.toHaveProperty("hasChildren");
      expect(row).not.toHaveProperty("parentOutsideView");
    }
    const roots = await lists.list({ ...request, filters: [{ field: "parent", operator: "is_null" }], hierarchy: "nodes" });
    expect(roots.rows.map((row) => [row.values["code"], row.hasChildren, "parentOutsideView" in row])).toEqual([["1000", true, false]]);
    const orphans = await lists.list({ ...request, hierarchy: "orphans" });
    expect(orphans.rows.map((row) => [row.values["code"], row.hasChildren, row.parentOutsideView])).toEqual([["1200", false, true]]);
 
    for (const row of [...flat.rows, ...roots.rows, ...orphans.rows]) expect(row).not.toHaveProperty("treeRole");
    for (const page of [flat, roots, orphans]) {
      expect(page).not.toHaveProperty("matchesTruncated");
      expect(page).not.toHaveProperty("matchesBeyondDepth");
    }
    // Matches (B2): a search or filter of their own is required.
    await expect(lists.list({ ...request, hierarchy: "matches" })).rejects.toMatchObject({ code: "LIST_TREE_MATCHES_UNCONSTRAINED" });
    await expect(lists.list({ ...request, filters: [{ field: "parent", operator: "is_null" }], hierarchy: "matches" })).rejects.toMatchObject({ code: "LIST_TREE_MATCHES_UNCONSTRAINED" });
    const matches = parseEntityListResult(await lists.list({ ...request, filters: [{ field: "code", operator: "eq", value: "1100" }], hierarchy: "matches" }));
    expect(matches.rows.map((row) => [row.values["code"], row.treeRole, row.hasChildren])).toEqual([["1100", "match", false], ["1000", "context", true]]);
    expect(matches.pagination.hasNext).toBe(false);
    expect(matches.pagination.pageSize).toBe(1);
    const outside = await lists.list({ ...request, filters: [{ field: "code", operator: "eq", value: "1200" }], hierarchy: "matches" });
    expect(outside.rows.map((row) => [row.values["code"], row.parentOutsideView])).toEqual([["1200", true]]);
  });

  it("browses a scoped hierarchy one owner at a time (Tree blueprint T1)", async () => {
    const scoped: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        { key: "parent", storagePath: "parent_uuid", type: "reference", required: false, writableOn: [], filterable: true },
        { key: "chart", storagePath: "chart_uuid", type: "reference", required: true, writableOn: [], filterable: true },
      ],
      hierarchy: { parentField: "parent", scopeField: "chart", maxDepth: 5 },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => scoped },
      descriptor: scoped,
      authorizer: allowReadOnly(),
      rows: [
        { partner_uuid: "a-1", tenant_id: context.tenantId, partner_code: "1000", display_name: "Assets A", parent_uuid: null, chart_uuid: "chart-a", row_version: 1 },
        { partner_uuid: "b-1", tenant_id: context.tenantId, partner_code: "1000", display_name: "Assets B", parent_uuid: null, chart_uuid: "chart-b", row_version: 1 },
      ],
    });
    const request = { context, entityCode: scoped.entityCode, sort: [{ field: "code", direction: "asc" as const }], hierarchy: "nodes" as const };
    const roots = { field: "parent", operator: "is_null" as const };
    for (const filters of [[roots], [roots, { field: "chart", operator: "in" as const, value: ["chart-a", "chart-b"] }], [roots, { field: "chart", operator: "eq" as const, value: "chart-a" }, { field: "chart", operator: "eq" as const, value: "chart-b" }]])
      await expect(lists.list({ ...request, filters })).rejects.toMatchObject({ code: "LIST_TREE_SCOPE_REQUIRED" });
    const chartA = await lists.list({ ...request, filters: [roots, { field: "chart", operator: "eq", value: "chart-a" }] });
    expect(chartA.rows.map((row) => row.values["name"] ?? row.values["code"])).toHaveLength(1);
    // A flat list needs no scope.
    expect((await lists.list({ context, entityCode: scoped.entityCode })).rows).toHaveLength(2);
  });

  it("offers a field for grouping only when it is bounded by class", async () => {
    const field = (key: string, type: string, extra: Record<string, unknown> = {}) => ({
      key, storagePath: key, type, required: false, writableOn: [], filterable: true, list: { groupable: true }, ...extra,
    });
    const many = Array.from({ length: 51 }, (_, index) => `v${index}`);
    const presented = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        field("flag", "boolean"),
        field("stage", "enum", { validation: { options: ["open", "won"] } }),
        field("bucket", "enum", { validation: { options: many } }),
        field("loose", "enum"),
        field("note", "string"),
        field("due", "date"),
        field("hidden", "enum", { validation: { options: ["a"] }, list: { groupable: false } }),
      ],
    } as EntityRuntimeDescriptor;
    const compiled = parseEntityListDescriptor(
      await createTestListService({ metadata: { getEntityDescriptor: async () => presented }, descriptor: presented, authorizer: allowReadOnly() })
        .descriptor(context, presented.entityCode),
    );
    const groupable = Object.fromEntries(compiled.fields.map((item) => [item.key, item.groupable]));
    // A boolean, or a choice list of at most 50 entries; nothing unbounded.
    expect(groupable).toMatchObject({ flag: true, stage: true, bucket: false, loose: false, note: false, due: false, hidden: false });
  });

  it("never labels a reference group with its raw value", async () => {
    const ownerId = "7f3c2e1d-4b5a-4c6d-8e9f-000000000001";
    const presented: EntityRuntimeDescriptor = {
      ...descriptor,
      fields: [
        ...descriptor.fields,
        {
          key: "owner",
          storagePath: "owner_id",
          type: "reference",
          required: false,
          writableOn: [],
          filterable: true,
          list: { groupable: true },
        },
      ],
      listPresentation: {
        schemaVersion: 1,
        identityField: "code",
        defaultState: { filters: [], sort: [{ field: "name", direction: "asc" }], columns: ["code", "name"], density: "comfortable", mode: "table" },
        supportedModes: ["table"],
        search: { minimumQueryLength: 1 },
        limits: { defaultPageSize: 10, allowedPageSizes: [10], maxSortLevels: 2, countMode: "exact" },
      },
    };
    const lists = createTestListService({
      metadata: { getEntityDescriptor: async () => presented },
      descriptor: presented,
      authorizer: allowReadOnly(),
      rows: [{ partner_uuid: "partner-1", tenant_id: context.tenantId, partner_code: "ACME", display_name: "Acme", owner_id: ownerId, row_version: 1 }],
    });
    const page = parseEntityListResult(
      await lists.list({ context, entityCode: presented.entityCode, fields: ["code"], group: "owner", sort: [{ field: "name", direction: "asc" }], countMode: "exact" }),
    );
    // The target is not resolvable in this fixture, so no label is admitted:
    // the heading falls back to a neutral mark, never the raw ID.
    expect(page.groups?.map((group) => group.label)).toEqual(["—"]);
    expect(JSON.stringify(page.groups?.map((group) => group.label))).not.toContain(ownerId);
  });

  it("binds field authorization to tenant, entity, operation, and field coordinates", async () => {
    const authorize = vi.fn<Authorizer["authorize"]>(
      async ({ permissionCode }) =>
        permissionCode === "partner.read"
          ? { allowed: true }
          : { allowed: false, reason: "missing_permission" },
    );
    const lists = createTestListService({ authorizer: { authorize } });

    await lists.descriptor(context, descriptor.entityCode);

    expect(authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: "partner.tax.read",
        resource: {
          tenantId: context.tenantId,
          entityCode: descriptor.entityCode,
          operationKey: "read",
          resourceCode: descriptor.entityCode,
          field: "tax_id",
        },
      }),
    );
  });

  it("rejects browser queries beyond the descriptor multi-sort limit", async () => {
    const lists = createTestListService({ authorizer: allowReadOnly() });
    await expect(
      lists.list({
        context,
        entityCode: descriptor.entityCode,
        sort: [
          { field: "code", direction: "asc" },
          { field: "name", direction: "asc" },
          { field: "code", direction: "desc" },
          { field: "name", direction: "desc" },
        ],
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_SORT_FIELDS", statusCode: 400 });
  });

  it("executes record authorization only once for a list request", async () => {
    const authorize = vi.fn<Authorizer["authorize"]>(
      async ({ permissionCode }) =>
        permissionCode === "partner.read"
          ? { allowed: true }
          : { allowed: false, reason: "missing_permission" },
    );
    const lists = createTestListService({ authorizer: { authorize } });

    await lists.list({ context, entityCode: descriptor.entityCode });

    expect(
      authorize.mock.calls.filter(
        ([request]) => request.permissionCode === "partner.read",
      ),
    ).toHaveLength(1);
  });
});

function allowReadOnly(): Authorizer {
  return {
    authorize: async ({ permissionCode }) =>
      permissionCode === "partner.read"
        ? { allowed: true }
        : { allowed: false, reason: "missing_permission" },
  };
}

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
  persistence.seed(
    runtimeDescriptor,
    context.tenantId,
    options.rows ?? [
      {
        partner_uuid: "partner-1",
        tenant_id: context.tenantId,
        partner_code: "ACME",
        display_name: "Acme",
        row_version: 4,
        tax_identifier: "must-not-leak",
        ...(options.operatingOrganizationId
          ? { __operatingOrganizationIds: [options.operatingOrganizationId] }
          : {}),
      },
    ],
  );
  const listExecutor = createRecordListExecutor({
    metadata: metadataReader,
    authorizer: options.authorizer,
    repository: persistence.repository,
    transactions: persistence.transactions,
    ...(options.collectionScopes
      ? { collectionScopes: options.collectionScopes }
      : {}),
  });
  return createEntityListService({
    metadata: metadataReader,
    authorizer: options.authorizer,
    listExecutor,
    ...(options.collectionScopes
      ? { collectionScopes: options.collectionScopes }
      : {}),
  });
}

it("filters record header bindings and checks record identity before offering edit", async () => {
  const calls: unknown[] = [];
  const recordDescriptor: EntityRuntimeDescriptor = {
    ...descriptor,
    operations: {
      ...descriptor.operations,
      patch: { code: "patch", permissionCode: "partner.patch" },
    },
    recordPresentation: {
      schemaVersion: 1,
      titleField: "name",
      codeField: "tax_id",
      subtitleFields: ["tax_id"],
      contextFields: ["tax_id"],
      badges: [],
      sections: [
        {
          key: "overview",
          label: "Overview",
          fields: ["name", "tax_id"],
          placement: "direct",
        },
      ],
      actions: [
        {
          key: "edit",
          label: "Edit partner",
          operationKey: "patch",
          placement: "primary",
        },
      ],
    },
  };
  const get = vi.fn(async () => ({
    data: { partner_uuid: "partner-1", name: "Acme" },
  }));
  const lists = createEntityListService({
    metadata: { getEntityDescriptor: async () => recordDescriptor },
    listExecutor: {} as never,
    queries: { get } as never,
    authorizer: {
      authorize: async (input) => {
        calls.push(input);
        return input.permissionCode === "partner.tax.read"
          ? { allowed: false, reason: "missing_permission" }
          : { allowed: true };
      },
    },
  });
  const detail = await lists.detailDescriptor(
    context,
    "business_partner",
    "partner-1",
  );
  expect(get).toHaveBeenCalledWith({
    context,
    entityCode: "business_partner",
    recordId: "partner-1",
  });
  expect(calls).toContainEqual(
    expect.objectContaining({
      permissionCode: "partner.patch",
      resource: expect.objectContaining({ recordId: "partner-1" }),
    }),
  );
  expect(detail.presentation).toMatchObject({
    titleField: "name",
    subtitleFields: [],
    contextFields: [],
    sections: [{ fields: ["name"] }],
  });
  expect(detail.presentation?.codeField).toBeUndefined();
  expect(detail.presentation?.actions[0]?.label).toBe("Edit partner");
});

it("projects collaboration only after the requested record is admitted", async () => {
  const collaboration = vi.fn(async () => ["comments"] as const);
  const get = vi.fn(async () => ({
    data: { partner_uuid: "partner-1", name: "Acme" } as Record<
      string,
      unknown
    > | null,
  }));
  const lists = createEntityListService({
    metadata: { getEntityDescriptor: async () => descriptor },
    listExecutor: {} as never,
    queries: { get } as never,
    authorizer: allowReadOnly(),
    collaboration,
  });
  expect(
    (await lists.detailDescriptor(context, descriptor.entityCode, "partner-1"))
      .collaboration,
  ).toEqual(["comments"]);
  expect(collaboration).toHaveBeenCalledWith({
    context,
    entityCode: descriptor.entityCode,
    recordId: "partner-1",
  });
  collaboration.mockClear();
  expect(
    (await lists.detailDescriptor(context, descriptor.entityCode))
      .collaboration,
  ).toEqual([]);
  expect(collaboration).not.toHaveBeenCalled();
  get.mockResolvedValue({ data: null });
  await expect(
    lists.detailDescriptor(context, descriptor.entityCode, "missing"),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(collaboration).not.toHaveBeenCalled();
});

it("starts independent detail hooks together and waits for both", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const collaboration = vi.fn(async () => {
    await gate;
    return ["comments"] as const;
  });
  const summary = vi.fn(async () => {
    release();
    return undefined;
  });
  const lists = createEntityListService({
    metadata: { getEntityDescriptor: async () => descriptor },
    listExecutor: {} as never,
    queries: {
      get: async () => ({ data: { partner_uuid: "record", name: "Example" } }),
    } as never,
    authorizer: allowReadOnly(),
    collaboration,
    summary,
  });
  expect(
    (await lists.detailDescriptor(context, descriptor.entityCode, "record"))
      .collaboration,
  ).toEqual(["comments"]);
  expect(collaboration).toHaveBeenCalledOnce();
  expect(summary).toHaveBeenCalledOnce();
});

it("does not invoke either detail hook before record admission and propagates hook failure", async () => {
  const collaboration = vi.fn(async () => [] as const);
  const summary = vi.fn(async () => {
    throw new Error("summary unavailable");
  });
  const get = vi.fn(async () => ({
    data: null as Record<string, unknown> | null,
  }));
  const lists = createEntityListService({
    metadata: { getEntityDescriptor: async () => descriptor },
    listExecutor: {} as never,
    queries: { get } as never,
    authorizer: allowReadOnly(),
    collaboration,
    summary,
  });
  await lists.detailDescriptor(context, descriptor.entityCode);
  await expect(
    lists.detailDescriptor(context, descriptor.entityCode, "missing"),
  ).rejects.toMatchObject({ statusCode: 404 });
  expect(collaboration).not.toHaveBeenCalled();
  expect(summary).not.toHaveBeenCalled();
  get.mockResolvedValue({ data: { partner_uuid: "record", name: "Example" } });
  await expect(
    lists.detailDescriptor(context, descriptor.entityCode, "record"),
  ).rejects.toThrow("summary unavailable");
});

it("resolves country choices only for authorized fields and removes text operators", async () => {
  const country = {
    key: "country",
    storagePath: "country_code",
    type: "string" as const,
    required: false,
    writableOn: [] as const,
    filterable: true,
    list: { semanticRole: "country_code" },
  };
  const published = {
    ...descriptor,
    fields: [
      ...descriptor.fields,
      country,
      {
        ...country,
        key: "private_country",
        readPermissionCode: "partner.tax.read",
      },
    ],
    listPresentation: {
      filterPresentation: {
        quickFields: [
          { field: "country", defaultOperator: "contains" as const },
        ],
      },
    },
  };
  const filterChoices = vi.fn(
    async (
      _context: VerifiedRequestContext,
      fields: readonly { key: string }[],
    ) => {
      expect(fields.map((field) => field.key)).not.toContain("private_country");
      return {
        country: [
          { value: "MY", label: "Malaysia" },
          { value: "SG", label: "Singapore" },
        ],
      };
    },
  );
  const persistence = createInMemoryRecordPersistence();
  const lists = createEntityListService({
    metadata: { getEntityDescriptor: async () => published },
    authorizer: allowReadOnly(),
    filterChoices,
    listExecutor: createRecordListExecutor({
      metadata: { getEntityDescriptor: async () => published },
      authorizer: allowReadOnly(),
      repository: persistence.repository,
      transactions: persistence.transactions,
    }),
  });
  await lists.descriptor(context, descriptor.entityCode);
  expect(filterChoices).not.toHaveBeenCalled();
  const compiled = parseEntityListDescriptor(
    await lists.descriptor(
      context,
      descriptor.entityCode,
      undefined,
      "country",
    ),
  );
  expect(
    compiled.fields.find((field) => field.key === "country"),
  ).toMatchObject({
    valueKind: "reference",
    filterOptions: [
      { value: "MY", label: "Malaysia" },
      { value: "SG", label: "Singapore" },
    ],
    filterOperators: ["eq", "ne", "in", "is_null", "is_not_null"],
  });
  expect(
    compiled.surface.filterPresentation.quickFields[0]?.defaultOperator,
  ).toBe("eq");
  expect(filterChoices).toHaveBeenCalledOnce();
});

it("direct record reads enforce directory membership and retain record authorization", async () => {
  const execute = vi.fn(async () => ({ result: { data: [] } })),
    get = vi.fn();
  const options = {
    metadata: {
      getEntityDescriptor: async () => ({
        ...descriptor,
        directoryScope: {
          schemaVersion: 1 as const,
          mode: "organization" as const,
        },
      }),
    },
    authorizer: allowReadOnly(),
    repository: { get } as never,
    transactions: {} as never,
  };
  const service = createRecordQueryService(options, { execute } as never);
  await expect(
    service.get({
      context,
      entityCode: descriptor.entityCode,
      recordId: "partner-1",
    }),
  ).resolves.toEqual({ data: null });
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ recordIds: ["partner-1"], limit: 1 }),
  );
  expect(get).not.toHaveBeenCalled();
  execute.mockClear();
  const denied = createRecordQueryService(
    {
      ...options,
      authorizer: {
        authorize: async () => ({ allowed: false as const, reason: "denied" }),
      },
    },
    { execute } as never,
  );
  await expect(
    denied.get({
      context,
      entityCode: descriptor.entityCode,
      recordId: "partner-1",
    }),
  ).rejects.toMatchObject({ statusCode: 403 });
  expect(execute).not.toHaveBeenCalled();
});

it("opens and searches a tenant directory with organization-scoped permission evidence and no filters", async () => {
  const published: EntityRuntimeDescriptor = {
    ...descriptor,
    directoryScope: { schemaVersion: 1, mode: "tenant" },
  };
  const scope = {
    permissionCode: "partner.read",
    tenantWide: false,
    legalEntityIds: [],
    companyCodeIds: [],
    operatingOrganizationIds: ["org-1"],
    networkMembershipIds: [],
    visibility: "team" as const,
  };
  const lists = createTestListService({
    descriptor: published,
    metadata: { getEntityDescriptor: async () => published },
    authorizer: {
      authorize: async ({ permissionCode, resource }) =>
        permissionCode !== "partner.read"
          ? { allowed: false, reason: "missing_permission" }
          : resource
            ? { allowed: false, reason: "scope_not_contained" }
            : { allowed: true, scope },
    },
  });
  await expect(
    lists.descriptor(context, published.entityCode),
  ).resolves.toMatchObject({ scope: { status: "ready" } });
  const page = await lists.list({
    context,
    entityCode: published.entityCode,
    search: "Acme",
  });
  expect(page.rows).toHaveLength(1);
  expect(page.rows[0]?.values).not.toHaveProperty("tax_id");
});

it.each([
  ["4", 4],
  [4, 4],
  ["9007199254740993", undefined],
  ["4.5", undefined],
  ["", undefined],
])(
  "preserves safe PostgreSQL version %j across list and record surfaces",
  async (raw, expected) => {
    const row = {
      partner_uuid: "partner-1",
      tenant_id: context.tenantId,
      partner_code: "ACME",
      display_name: "Acme",
      row_version: raw,
    };
    const lists = createTestListService({
      authorizer: allowReadOnly(),
      rows: [row],
    });
    expect(
      (await lists.list({ context, entityCode: descriptor.entityCode })).rows[0]
        ?.version,
    ).toBe(expected);
    const records = createEntityListService({
      metadata,
      authorizer: allowReadOnly(),
      listExecutor: {} as never,
      queries: { get: async () => ({ data: row }) } as never,
    });
    expect(
      (await records.record(context, descriptor.entityCode, "partner-1"))
        .version,
    ).toBe(expected);
  },
);

it("omits server-owned create inputs and retains authorized published field grouping", async () => {
  const form: EntityRuntimeDescriptor = {
    ...descriptor,
    fields: descriptor.fields.map((field) => ({
      ...field,
      writableOn: field.key === "name" ? ["create", "patch"] : [],
    })),
    operations: {
      ...descriptor.operations,
      create: { code: "create", permissionCode: "partner.create" },
    },
    recordPresentation: parseEntityRecordPresentation({
      schemaVersion: 1,
      titleField: "name",
      sections: [{ key: "names", label: "Names", fields: ["name", "tax_id"] }],
      actions: [],
    }),
  };
  const service = createTestListService({
    descriptor: form,
    metadata: { getEntityDescriptor: async () => form },
    authorizer: {
      authorize: async ({ permissionCode }) =>
        permissionCode === "partner.tax.read"
          ? { allowed: false, reason: "missing_permission" }
          : { allowed: true },
    },
  });
  const result = await service.formDescriptor(
    context,
    form.entityCode,
    "create",
  );
  expect(result.fields.map((field) => field.key)).toEqual(["name"]);
  expect(result.sections).toEqual([
    { key: "names", label: "Names", fields: ["name"] },
  ]);
  expect(JSON.stringify(result)).not.toContain("tax_id");
});

it("projects explicit form inputs, help and action labels only after field authorization", async () => {
  const { parseEntityFormPresentation } =
    await import("@athyper/contract-platform-entity-runtime");
  const mode = {
    sections: [{ key: "names", label: "Names", fields: ["name", "tax_id"] }],
    submitLabel: "Save profile",
    help: { name: "Your display name.", tax_id: "Restricted help." },
  };
  const form: EntityRuntimeDescriptor = {
    ...descriptor,
    fields: descriptor.fields.map((field) => ({
      ...field,
      writableOn: field.key === "name" ? ["create", "patch"] : [],
    })),
    operations: {
      ...descriptor.operations,
      create: { code: "create", permissionCode: "partner.create" },
    },
    formPresentation: parseEntityFormPresentation(
      { schemaVersion: 1, create: mode, edit: mode },
      descriptor.fields.map((field) => field.key),
    ),
  };
  const service = createTestListService({
    descriptor: form,
    metadata: { getEntityDescriptor: async () => form },
    authorizer: {
      authorize: async ({ permissionCode }) =>
        permissionCode === "partner.tax.read"
          ? { allowed: false, reason: "missing_permission" }
          : { allowed: true },
    },
  });
  const result = await service.formDescriptor(
    context,
    form.entityCode,
    "create",
  );
  expect(result.fields.map((field) => field.key)).toEqual(["name"]);
  expect(result.fields[0]?.helpText).toBe("Your display name.");
  expect(result.submit.label).toBe("Save profile");
  expect(JSON.stringify(result)).not.toContain("Restricted help");
  expect(JSON.stringify(result)).not.toContain("tax_id");
});

it("preserves only authorized explicit detail bindings without borrowing list renderers", async () => {
  const presented: EntityRuntimeDescriptor = {
    ...descriptor,
    fields: descriptor.fields.map((field) =>
      field.key === "code"
        ? { ...field, list: { rendererKey: "badge" } }
        : { ...field, detail: { rendererKey: "text" as const } },
    ),
  };
  const lists = createTestListService({
    authorizer: allowReadOnly(),
    descriptor: presented,
    metadata: { getEntityDescriptor: async () => presented },
  });
  const detail = await lists.detailDescriptor(context, presented.entityCode);
  expect(detail.fields.find((field) => field.key === "name")?.rendererKey).toBe(
    "text",
  );
  expect(
    detail.fields.find((field) => field.key === "code")?.rendererKey,
  ).toBeUndefined();
  expect(detail.fields.find((field) => field.key === "tax_id")).toBeUndefined();
});
