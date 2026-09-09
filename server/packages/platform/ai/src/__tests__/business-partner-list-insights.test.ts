import { expect, it, vi } from "vitest";
import type {
  AtlasBusinessContextV1,
  AtlasInsightOwnerProjection,
} from "@athyper/server-contract-ai";
import { createBusinessPartnerInsightTools } from "../business-partner-insight-tools.js";
import type { AtlasBusinessPartnerList } from "../business-partner-list-insights.js";
import { AtlasRegisteredToolCoordinator } from "../runtime-tool-coordinator.js";
import { AtlasToolRegistry, AtlasToolService } from "../tool-service.js";
import { MemoryToolStore } from "./tool-store-fixture.js";
import { context as base } from "./review-fixture.js";
import { selectLocalBusinessPartnerTools } from "../business-partner-tool-selection.js";
const permission = "neon.relationship.business_partner.read";
const context = {
  ...base,
  permissions: { ...base.permissions, allowed: [permission] },
};
const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const candidate = <T>(value: T) => ({
  state: "evaluated_pass" as const,
  claims: [permission],
  value,
});
function harness(size = 2) {
  const all = Array.from({ length: size }, (_, i) => ({ id: id(i + 1) }));
  const page: Extract<AtlasBusinessContextV1, { kind: "manage" }> = {
    schemaVersion: 1,
    kind: "manage",
    entityCode: "business_partner",
    generationId: id(999),
    locale: "en",
    filters: [],
    sort: [],
    selectedIds: [],
    visibleIds: [],
    analysisTarget: "filtered_set",
    pageSize: 10,
    pageIndex: 0,
    workContext: { operatingOrganizationId: id(999), companyCodeId: id(999) },
    directory: { partnerRole: "supplier" },
  };
  const list = vi.fn<AtlasBusinessPartnerList>(async (q) => {
    const rows = q.recordIds
      ? all.filter((row) => q.recordIds!.includes(row.id))
      : all;
    const start = q.cursor ? Number(q.cursor) : 0;
    return {
      descriptorHash: "d",
      scopeFingerprint: "s",
      rows: rows.slice(start, start + q.limit!),
      pagination: {
        hasNext: start + q.limit! < rows.length,
        total: rows.length,
        countMode: "exact",
      },
    };
  });
  const read = vi.fn(
    async ({
      recordId,
    }: {
      recordId: string;
    }): Promise<AtlasInsightOwnerProjection> => ({
      evaluationMode: "user_scoped",
      scope: candidate({
        entityCode: "business_partner",
        fingerprint: "s",
        role: "supplier",
        operatingOrganizationId: id(999),
        companyCodeId: id(999),
      }),
      coverage: candidate({ target: "record", state: "complete" }),
      evaluatedAt: new Date().toISOString(),
      freshness: "current",
      evidence: [
        candidate({
          id: "e",
          entityCode: "business_partner",
          recordId,
          descriptorRevision: "d",
          sourceRevision: "v",
          sourceRevisionKind: "record_version",
          observedAt: new Date().toISOString(),
        }),
      ],
      findings: ["missing_a", "missing_b", "missing_a"].map((code, i) =>
        candidate({
          id: String(i),
          code,
          state: "evaluated_fail",
          severity: "warning",
          facts: {},
          ruleVersion: "r",
          evidenceIds: ["e"],
          actionIds: [],
        }),
      ),
      actions: [],
    }),
  );
  const query = vi.fn(
    async ({
      request,
    }: {
      request: { filters?: readonly { value?: unknown }[] };
    }) => ({
      rows: [{ code: "BP", bank: "SECRET" }],
      sources: [
        {
          entityCode: "business_partner",
          recordId: String(request.filters![0]!.value),
          revision: "v",
          descriptorHash: "d",
        },
      ],
      responseBytes: 10,
      authorizationProfileHash: context.profileHash,
    }),
  );
  const registry = new AtlasToolRegistry(
    createBusinessPartnerInsightTools({ read }, list),
  );
  const service = new AtlasToolService({
    registry,
    proposals: new MemoryToolStore(),
    records: { query },
    authority: {
      authorize: async () => ({ allowed: true, policyRevision: "1" }),
    },
    confirmations: { verify: async () => true },
    commands: {
      execute: async () => {
        throw Error("mutation");
      },
    },
  });
  const coordinator = new AtlasRegisteredToolCoordinator(registry, service);
  const request = {
    context,
    runId: id(999),
    threadId: id(999),
    callId: "list",
    toolCode: "bp_read_list_insights",
    arguments: {},
    mutationToolsAllowed: false,
    businessContext: { page, descriptorHash: "d", scopeFingerprint: "s" },
  };
  const run = async (patch = {}) => {
    const outcome = await coordinator.handle({ ...request, ...patch });
    return {
      ...outcome,
      insight: (
        outcome.result!.data as {
          insight: import("@athyper/server-contract-ai").AtlasInsightResult;
        }
      ).insight,
    };
  };
  return {
    all,
    page,
    list,
    read,
    query,
    registry,
    service,
    coordinator,
    request,
    run,
  };
}
it.each([0, 2, 20, 21, 100000])(
  "bounds a population of %i and keeps distinct/overlapping counts truthful",
  async (size) => {
    const h = harness(size),
      result = await h.run(),
      examined = Math.min(size, 20);
    expect(h.list).toHaveBeenCalledTimes(1);
    expect(h.read).toHaveBeenCalledTimes(examined);
    expect(result.insight.coverage).toEqual({
      target: "filtered_set",
      state: size > 20 ? "partial" : "complete",
      evaluatedCount: examined,
      authorizedTotalCount: size,
    });
    expect(result.insight.findings[0]!.facts).toMatchObject({
      examinedCount: examined,
      distinctPartnersWithFindings: examined,
      countsOverlap: true,
    });
    for (const finding of result.insight.findings.filter((f) =>
      f.code.startsWith("missing"),
    ))
      expect(finding.facts.distinctPartnerCount).toBe(examined);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  },
);
it("uses the full filtered target without the page cursor, and forwards query policy coordinates", async () => {
  const h = harness(30);
  Object.assign(h.page, {
    cursor: "10",
    fields: ["code"],
    filters: [{ field: "status", operator: "eq", value: "active" }],
    sort: [{ field: "code", direction: "desc" }],
    group: "status",
    search: "Acme",
    standardViewKey: "suppliers",
  });
  await h.run();
  expect(h.list.mock.calls[0]![0]).toMatchObject({
    fields: ["code"],
    filters: h.page.filters,
    sort: h.page.sort,
    search: "Acme",
    group: "status",
    standardViewKey: "suppliers",
    countMode: "exact",
    scopeCoordinate: { partnerRole: "supplier" },
  });
  expect(h.list.mock.calls[0]![0].cursor).toBeUndefined();
});
it("compares only the selected authorized population and supports explicit filtered override", async () => {
  const h = harness(30);
  Object.assign(h.page, {
    analysisTarget: "selection",
    selectedIds: [id(3), id(22)],
  });
  const selected = await h.run();
  expect(selected.insight.coverage).toMatchObject({
    target: "selection",
    evaluatedCount: 2,
    authorizedTotalCount: 2,
  });
  expect(h.read.mock.calls.map(([q]) => q.recordId)).toEqual([id(3), id(22)]);
  expect(
    (await h.run({ callId: "override", arguments: { target: "filtered_set" } }))
      .insight.coverage.authorizedTotalCount,
  ).toBe(30);
});
it("rechecks visible-page membership and rejects stale visible IDs", async () => {
  const h = harness(30);
  Object.assign(h.page, {
    analysisTarget: "visible_page",
    cursor: "10",
    visibleIds: [id(11), id(12)],
  });
  expect((await h.run()).insight.coverage).toMatchObject({
    target: "visible_page",
    authorizedTotalCount: 2,
  });
  Object.assign(h.page, { visibleIds: [id(1)] });
  await expect(h.run({ callId: "stale" })).rejects.toThrow();
});
it("omits downgraded approximate totals", async () => {
  const h = harness();
  h.list.mockResolvedValue({
    descriptorHash: "d",
    scopeFingerprint: "s",
    rows: h.all,
    pagination: { hasNext: false, total: 500000, countMode: "approximate" },
  });
  expect((await h.run()).insight.coverage.authorizedTotalCount).toBeUndefined();
});
it("withholds denied facts and never treats unavailable assessment as all-clear", async () => {
  const h = harness();
  const owner = await h.read({ recordId: id(1) });
  h.read.mockClear();
  h.read.mockImplementation(async ({ recordId }) => ({
    ...owner,
    coverage: candidate({ target: "record", state: "partial" }),
    evidence: [],
    findings: [
      candidate({
        ...owner.findings[0]!.value,
        code: "provider_unavailable",
        state: "provider_unavailable",
        evidenceIds: [],
      }),
      {
        ...candidate({
          ...owner.findings[0]!.value,
          id: "hidden",
          code: "SECRET",
        }),
        state: "restricted",
      },
    ],
  }));
  const result = await h.run();
  expect(result.insight.coverage).toMatchObject({
    state: "partial",
    evaluatedCount: 0,
  });
  expect(result.insight.findings[0]!.facts).toMatchObject({
    distinctPartnersWithFindings: 0,
    narrowingRequired: true,
  });
  expect(JSON.stringify(result)).not.toContain("SECRET");
});
it("fails closed on query denial, record revocation and descriptor changes", async () => {
  const h = harness();
  h.list.mockRejectedValueOnce(Error("SECRET filter"));
  await expect(h.run()).rejects.toThrow(
    "Business Partner list insight is unavailable",
  );
  expect(h.read).not.toHaveBeenCalled();
  h.query.mockResolvedValueOnce({
    rows: [],
    sources: [],
    responseBytes: 0,
    authorizationProfileHash: context.profileHash,
  });
  await expect(h.run({ callId: "revoked" })).rejects.toThrow();
  h.list.mockResolvedValueOnce({
    descriptorHash: "changed",
    scopeFingerprint: "s",
    rows: h.all,
    pagination: { hasNext: false, total: 2, countMode: "exact" },
  });
  await expect(h.run({ callId: "descriptor" })).rejects.toThrow();
});
it("binds server page arguments before preview and refuses model-supplied pages or missing context", async () => {
  const h = harness();
  await expect(h.run({ arguments: { page: h.page } })).rejects.toThrow();
  await expect(h.run({ businessContext: undefined })).rejects.toThrow();
  expect(h.list).not.toHaveBeenCalled();
});
it("replays only after the same population, owner findings and permissions are read again", async () => {
  const h = harness(),
    result = await h.run();
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(
    true,
  );
  h.list.mockRejectedValueOnce(Error("revoked"));
  expect(await h.service.revalidate(context, result.replayEvidence!)).toBe(
    false,
  );
});
it("stops admitting owner reads at the time budget and handles cancellation", async () => {
  const h = harness(20);
  const now = vi
    .spyOn(Date, "now")
    .mockReturnValueOnce(0)
    .mockReturnValue(4000);
  try {
    // Handler-only avoids service ledger clocks consuming the budget fixture.
    const tool = h.registry
      .list()
      .find((t) => t.manifest.toolCode === "bp_read_list_insights")!;
    const result = await tool.readHandler!.execute({
      context: {
        context,
        records: { query: h.query },
        signal: new AbortController().signal,
      },
      arguments: { page: h.page },
    });
    expect(
      (result.data as { insight: { coverage: unknown } }).insight.coverage,
    ).toMatchObject({ state: "partial", evaluatedCount: 0 });
    expect(h.read).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      tool.readHandler!.execute({
        context: {
          context,
          records: { query: h.query },
          signal: controller.signal,
        },
        arguments: { page: h.page },
      }),
    ).rejects.toThrow();
  } finally {
    now.mockRestore();
  }
});
it("routes natural Manage comparisons to one list tool", () => {
  const h = harness();
  const definitions = h.registry
    .list()
    .map((t) => ({
      name: t.manifest.toolCode,
      description: t.manifest.description,
      inputSchema: t.manifest.inputSchema,
    }));
  expect(
    selectLocalBusinessPartnerTools(
      definitions,
      "Compare these selected partners",
      h.page,
    ).map((t) => t.name),
  ).toEqual(["bp_read_list_insights"]);
});
it("finishes large results with authoritative counts without another model pass", async () => {
  const { businessPartnerListInsightMessage } =
    await import("../business-partner-list-insights.js");
  const h = harness(100000),
    result = await h.run();
  const message = businessPartnerListInsightMessage([
    {
      type: "tool_result",
      callId: "list",
      toolName: "bp_read_list_insights",
      result: result.result!.data,
    },
  ]);
  expect(message).toContain("Examined 20 authorized partners out of 100000");
  expect(message).toContain("20 had disclosed findings");
  expect(message).toContain("Issue counts overlap");
  expect(message).toContain("Coverage is partial");
});
