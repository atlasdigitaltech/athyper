import { beforeEach, expect, it, vi } from "vitest";
import type { Transaction } from "kysely";
import type { ExpandedNativeMetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  coreFixture,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  lock: vi.fn(),
  guard: vi.fn(),
}));
vi.mock("kysely", () => ({
  sql: Object.assign(
    (s: TemplateStringsArray, ...values: unknown[]) => ({
      execute: () => mocks.query(s.join("?"), values),
    }),
    { table: (s: string) => s },
  ),
}));
vi.mock("./native-core-layout-persistence.js", () => ({
  lockNativeDraft: mocks.lock,
  assertNativeAuthoringContract: mocks.guard,
}));
import { prepareNativeAiSave } from "./native-ai-storage.js";
const c = {
  entityId: coreFixtureId(100),
  changeSetId: coreFixtureId(101),
  tenantId: null,
};
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
function fixture(): ExpandedNativeMetaEntityGraph {
  const core = coreFixture();
  return {
    contractSchema: "athyper.meta-entity-contract/2.5",
    entity: { entityCode: "synthetic-reference" },
    operations: [],
    fields: core.field,
    runtimeProfiles: core.runtime,
    surfaces: core.surface,
    surfaceSections: [],
    surfaceFieldBindings: [],
    authoringSource: {
      ...c,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    ownedLabels: { ...c, labels: [], translations: [] },
    ai: {
      profile: [
        {
          id: coreFixtureId(500),
          enabled: true,
          description: null,
          aliases: [],
          contextKinds: ["record"],
          searchProfileId: null,
          vocabularyLocale: null,
        },
      ],
      field: [
        {
          id: coreFixtureId(501),
          aiProfileId: coreFixtureId(500),
          entityFieldId: core.field[0]!.id,
          position: 1,
        },
      ],
      binding: [],
      reference: [],
      term: [],
    },
  } as unknown as ExpandedNativeMetaEntityGraph;
}
beforeEach(() => {
  mocks.lock.mockReset().mockResolvedValue({
    nativeVersion: 2,
    status: "draft",
    sourceKind: "product",
    authoringSchemaHash: "a".repeat(64),
  });
  mocks.guard.mockReset().mockResolvedValue(undefined);
  mocks.query.mockReset().mockResolvedValue({ rows: [] });
});
it("prepares every native AI table under the exact source lock and schema guard with bounded scoped reads", async () => {
  const graph = fixture(),
    plans = await prepareNativeAiSave(tx, c, graph, 100);
  expect(mocks.lock).toHaveBeenCalledWith(
    tx,
    c,
    graph.authoringSource.authoringSchemaHash,
    [2],
  );
  expect(mocks.guard).toHaveBeenCalledWith(
    tx,
    c,
    graph.authoringSource.authoringSchemaHash,
    2,
  );
  expect(plans).toHaveLength(5);
  expect(plans[0]!.insert[0]!.id).toBe(graph.ai.profile[0]!.id);
  expect(mocks.query).toHaveBeenCalledTimes(5);
  for (const [query, args] of mocks.query.mock.calls) {
    expect(query).toContain("tenant_id IS NOT DISTINCT FROM");
    expect(query).toContain("entity_id=");
    expect(query).toContain("change_set_id=");
    expect(query).toContain("ORDER BY id LIMIT");
    expect(args.slice(1)).toEqual([c.changeSetId, c.entityId, null, 101]);
    expect(query).not.toMatch(/^(UPDATE|INSERT|DELETE)/);
  }
});
it("does not read or write AI rows when native cutover evidence is missing or the source is sealed", async () => {
  mocks.guard.mockRejectedValueOnce(
    Error("ENTITY_NATIVE_SNAPSHOT_CUTOVER_REQUIRED"),
  );
  await expect(prepareNativeAiSave(tx, c, fixture(), 100)).rejects.toThrow(
    "ENTITY_NATIVE_SNAPSHOT_CUTOVER_REQUIRED",
  );
  expect(mocks.query).not.toHaveBeenCalled();
  mocks.lock.mockResolvedValueOnce({
    status: "approved",
    sourceKind: "product",
  });
  await expect(
    prepareNativeAiSave(tx, c, fixture(), 100),
  ).rejects.toMatchObject({ code: "AUTHORING_DRAFT_NOT_EDITABLE" });
  expect(mocks.query).not.toHaveBeenCalled();
});
it("rejects mismatched coordinates, dangling references and oversized stored graphs before application", async () => {
  const f = fixture();
  await expect(prepareNativeAiSave(tx, c, f, 2147483647)).rejects.toMatchObject(
    { code: "NATIVE_SNAPSHOT_LIMIT" },
  );
  expect(mocks.lock).not.toHaveBeenCalled();
  await expect(
    prepareNativeAiSave(tx, { ...c, tenantId: coreFixtureId(200) }, f, 100),
  ).rejects.toMatchObject({ code: "NORMALIZED_SAVE_CONTEXT_MISMATCH" });
  expect(mocks.lock).not.toHaveBeenCalled();
  await expect(
    prepareNativeAiSave(
      tx,
      c,
      {
        ...f,
        ai: {
          ...f.ai,
          field: f.ai.field.map((r) => ({
            ...r,
            entityFieldId: coreFixtureId(999),
          })),
        },
      },
      100,
    ),
  ).rejects.toMatchObject({ code: "NATIVE_SNAPSHOT_REFERENCE_INVALID" });
  expect(mocks.query).not.toHaveBeenCalled();
  mocks.query.mockResolvedValueOnce({
    rows: Array.from({ length: 4 }, () => ({ value: {} })),
  });
  await expect(prepareNativeAiSave(tx, c, f, 3)).rejects.toMatchObject({
    code: "NATIVE_SNAPSHOT_LIMIT",
  });
  expect(mocks.query).toHaveBeenCalledTimes(1);
});
