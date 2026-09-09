import { expect, it, vi } from "vitest";
import {
  createBusinessPartnerInsightTools,
  createAtlasRecordDataGateway,
} from "@athyper/server-platform-ai";
import {
  createEntityListService,
  createInMemoryRecordPersistence,
  createRecordListExecutor,
  createRecordQueryService,
} from "@athyper/server-service-records";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type {
  AtlasInsightOwnerProjection,
  AtlasInsightResult,
  AtlasBusinessContextV1,
} from "@athyper/server-contract-ai";
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const permission = "neon.relationship.business_partner.read";
const context: VerifiedRequestContext = {
  planeKey: "neon",
  realmKey: "neon",
  tenantId: id(90001),
  principalId: id(90002),
  authEpoch: 1,
  profileHash: "p",
  requestId: "r",
  permissions: {
    planeKey: "neon",
    tenantId: id(90001),
    principalId: id(90002),
    principalFingerprint: "f",
    profileHash: "p",
    schemaHash: "s",
    resolvedAt: 1,
    allowed: [permission],
    denied: [],
    planLocked: [],
    planeExcluded: [],
    entries: [],
    authorizationScopes: [],
  },
};
const descriptor: EntityRuntimeDescriptor = {
  schema: "athyper.entity-runtime-descriptor/1.0",
  entityCode: "business_partner",
  planeKey: "neon",
  releaseId: "release",
  releaseNo: 1,
  contractHash: "a".repeat(64),
  compiledHash: "b".repeat(64),
  storage: {
    schema: "master",
    object: "business_partner",
    idField: "id",
    tenantField: "tenant_id",
    versionField: "row_version",
  },
  fields: [
    "id",
    "code",
    "display_name",
    "status",
    "partner_category",
    "secret",
  ].map((key) => ({
    key,
    storagePath: key,
    type: "string",
    required: false,
    writableOn: [],
    filterable: true,
    sortable: true,
    searchable: key === "display_name" || key === "secret",
    list: { groupable: true },
    ...(key === "secret" ? { readPermissionCode: "private.read" } : {}),
  })),
  operations: { read: { code: "read", permissionCode: permission } },
};
function harness() {
  const metadata = { getEntityDescriptor: async () => descriptor };
  const authorizer: Authorizer = {
    authorize: async ({ permissionCode }) =>
      permissionCode === permission
        ? { allowed: true }
        : { allowed: false, reason: "missing_permission" },
  };
  const persistence = createInMemoryRecordPersistence();
  persistence.seed(
    descriptor,
    context.tenantId,
    Array.from({ length: 2000 }, (_, i) => ({
      id: id(i + 1),
      tenant_id: context.tenantId,
      row_version: 1,
      code: `BP-${i}`,
      display_name: i % 2 ? "Beta" : "Acme",
      status: i % 3 ? "active" : "draft",
      partner_category: "organization",
      secret: "HIDDEN",
    })),
  );
  persistence.seed(descriptor, id(99999), [
    {
      id: id(80000),
      tenant_id: id(99999),
      row_version: 1,
      code: "OTHER-TENANT",
      display_name: "Acme",
      status: "active",
    },
  ]);
  const options = {
    metadata,
    authorizer,
    repository: persistence.repository,
    transactions: persistence.transactions,
  };
  const executor = createRecordListExecutor(options),
    queries = createRecordQueryService(options, executor);
  const lists = createEntityListService({
    metadata,
    authorizer,
    listExecutor: executor,
    queries,
  });
  const records = createAtlasRecordDataGateway({
    metadata,
    records: queries,
    maxRows: 1,
    maxResponseBytes: 2048,
    fieldSecurity: { project: async ({ rows }) => rows },
  });
  const candidate = <T>(value: T) => ({
    state: "evaluated_pass" as const,
    claims: [permission],
    value,
  });
  const read = vi.fn(async (): Promise<AtlasInsightOwnerProjection> => ({
    evaluationMode: "user_scoped",
    scope: candidate({ entityCode: "business_partner", fingerprint: "s" }),
    coverage: candidate({ target: "record", state: "complete" }),
    evaluatedAt: "2026-09-09T00:00:00Z",
    freshness: "current",
    findings: [
      candidate({
        id: "check",
        code: "owner_check",
        state: "evaluated_pass",
        severity: "info",
        facts: {},
        evidenceIds: [],
        actionIds: [],
        ruleVersion: "1",
      }),
    ],
    evidence: [],
    actions: [],
  }));
  const tool = createBusinessPartnerInsightTools({ read }, (q) =>
    lists.list(q),
  ).find((t) => t.manifest.toolCode === "bp_read_list_insights")!;
  const page: Extract<AtlasBusinessContextV1, { kind: "manage" }> = {
    schemaVersion: 1,
    kind: "manage",
    entityCode: "business_partner",
    generationId: id(90000),
    locale: "en",
    filters: [{ field: "status", operator: "eq", value: "active" }],
    sort: [{ field: "code", direction: "asc" }],
    search: "Acme",
    fields: ["code"],
    group: "status",
    analysisTarget: "filtered_set",
    selectedIds: [],
    visibleIds: [],
    pageIndex: 0,
    pageSize: 10,
  };
  const execute = () =>
    tool.readHandler!.execute({
      context: { context, records, signal: new AbortController().signal },
      arguments: { page },
    });
  return { lists, page, execute, read };
}
it("matches real authorized Manage rows and exact totals across filters/search/group and tenant isolation", async () => {
  const h = harness();
  const manage = await h.lists.list({
    context,
    entityCode: "business_partner",
    filters: h.page.filters,
    search: h.page.search,
    fields: h.page.fields,
    sort: h.page.sort,
    group: h.page.group,
    countMode: "exact",
    limit: 20,
  });
  const result = await h.execute(),
    insight = (result.data as { insight: AtlasInsightResult }).insight;
  expect(insight.coverage).toMatchObject({
    state: "partial",
    evaluatedCount: 20,
    authorizedTotalCount: manage.pagination.total,
  });
  expect(result.sources.map((s) => s.coordinate.recordId)).toEqual(
    manage.rows.map((row) => row.id),
  );
  expect(h.read).toHaveBeenCalledTimes(20);
  expect(JSON.stringify(result)).not.toMatch(/HIDDEN|OTHER-TENANT/);
});
it.each(["filters", "sort", "group", "fields"])(
  "rejects hidden %s before owner reads",
  async (operation) => {
    const h = harness();
    Object.assign(
      h.page,
      operation === "filters"
        ? { filters: [{ field: "secret", operator: "eq", value: "HIDDEN" }] }
        : operation === "sort"
          ? { sort: [{ field: "secret", direction: "asc" }] }
          : operation === "group"
            ? { group: "secret" }
            : { fields: ["secret"] },
    );
    await expect(h.execute()).rejects.toThrow(
      "Business Partner list insight is unavailable",
    );
    expect(h.read).not.toHaveBeenCalled();
  },
);
it("excludes hidden search matches and cross-tenant selection from counts and comparisons", async () => {
  const h = harness();
  Object.assign(h.page, { search: "HIDDEN" });
  expect(
    ((await h.execute()).data as { insight: AtlasInsightResult }).insight
      .coverage,
  ).toMatchObject({ authorizedTotalCount: 0, evaluatedCount: 0 });
  Object.assign(h.page, {
    search: undefined,
    filters: [],
    analysisTarget: "selection",
    selectedIds: [id(1), id(80000)],
  });
  const result = await h.execute();
  expect(
    (result.data as { insight: AtlasInsightResult }).insight.coverage,
  ).toMatchObject({ authorizedTotalCount: 1, evaluatedCount: 1 });
  expect(result.sources.map((s) => s.coordinate.recordId)).toEqual([id(1)]);
});
