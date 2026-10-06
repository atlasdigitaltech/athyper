import { coreFixture } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { Kysely, PostgresDialect, type Transaction } from "kysely";
import { expect, it, vi } from "vitest";
import {
  emptyReferenceMembers,
  type MetaEntityGraph,
  type ExpandedNativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import { prepareCanonicalNativeConversionPlans } from "./native-conversion-plans.js";
import type { NativeExpandedConversionProof } from "./native-conversion-application.js";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function fixture(
  stored: Record<string, object[]> = {},
  retirement: { attname: string; attnotnull: boolean }[] = [],
) {
  const query = vi.fn(async (text: string) => {
    if (text.includes("FROM pg_attribute")) return { rows: retirement };
    const table = /FROM "metadata"\."([a-z_]+)"/.exec(text)?.[1];
    return { rows: (stored[table ?? ""] ?? []).map((value) => ({ value })) };
  });
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  Object.defineProperty(db, "isTransaction", { value: true });
  const source: MetaEntityGraph = {
    contractSchema: "athyper.meta-entity-contract/2.3",
    entity: { entityCode: "synthetic_reference" },
    fields: [],
    operations: [],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    ownedLabels: {
      contract: "entity.authoring-owned-labels/1",
      entityId: id(1),
      changeSetId: id(2),
      tenantId: null,
      defaultLocale: "en",
      requiredLocales: ["en"],
      labels: [],
      translations: [],
    },
    referenceMembers: emptyReferenceMembers(),
  };
  const candidate: ExpandedNativeMetaEntityGraph = {
    ...source,
    contractSchema: "athyper.meta-entity-contract/2.5",
    authoringSource: {
      entityId: id(1),
      tenantId: null,
      sourceKind: "product",
      authoringSchemaHash: "a".repeat(64),
    },
    fields: [],
    operations: [],
    runtimeProfiles: [],
    surfaces: [],
    surfaceSections: [],
    surfaceFieldBindings: [],
    ai: { profile: [], field: [], binding: [], reference: [], term: [] },
  };
  const proof = { candidate } as unknown as NativeExpandedConversionProof;
  const run = (limit = 100) =>
    prepareCanonicalNativeConversionPlans(
      db as Transaction<Record<string, never>>,
      { entityId: id(1), changeSetId: id(2), tenantId: null },
      source,
      proof,
      limit,
    );
  return { query, source, candidate, run };
}
it("projects typed labels without touching stored attribution or unrelated columns", async () => {
  const label = {
    id: id(8),
    labelKey: "synthetic.title",
    defaultText: "New",
    sourceKind: "owned" as const,
    sharedLabelKey: null,
    sharedResourceKey: null,
    sharedResourceVersion: null,
    sharedResourceHash: null,
  };
  const f = fixture({
    entity_label: [
      {
        id: id(8),
        label_key: label.labelKey,
        default_text: "Old",
        source_kind: "owned",
        created_by: id(9),
        created_at: "immutable",
        protected_control: true,
      },
    ],
  });
  Reflect.set(f.candidate.ownedLabels!, "labels", [label]);
  const plan = (await f.run()).find((p) => p.table === "entity_label")!;
  expect(plan.insert).toEqual([]);
  expect(plan.remove).toEqual([]);
  expect(plan.update[0]!.values).toEqual({ default_text: "New" });
  expect(f.query.mock.calls.every(([text]) => text.startsWith("SELECT"))).toBe(
    true,
  );
});
it("rejects unaccounted source IDs and deletions before returning a writable plan", async () => {
  await expect(
    fixture({ entity_surface_section: [{ id: id(7) }] }).run(),
  ).rejects.toMatchObject({
    code: "NATIVE_CONVERSION_SOURCE_INVENTORY_MISMATCH",
  });
  await expect(
    fixture({ entity_label: [{ id: id(8) }] }).run(),
  ).rejects.toMatchObject({ code: "NATIVE_CONVERSION_IDENTITY_CHANGED" });
});
it("rejects a legacy NOT NULL coupling and retained-root changes", async () => {
  await expect(
    fixture({}, [{ attname: "type_config", attnotnull: true }]).run(),
  ).rejects.toMatchObject({ code: "ENTITY_NATIVE_SCHEMA_CUTOVER_REQUIRED" });
  const f = fixture();
  Reflect.set(f.candidate, "keys", [{ id: id(8) }]);
  await expect(f.run()).rejects.toMatchObject({
    code: "NATIVE_CONVERSION_RETAINED_BRANCH_CHANGED",
  });
  expect(f.query).not.toHaveBeenCalled();
});
it("bounds inventories and validates normalized rows before SQL preparation", async () => {
  await expect(
    fixture({ entity_label: [{ id: id(7) }, { id: id(8) }] }).run(1),
  ).rejects.toMatchObject({ code: "NATIVE_SNAPSHOT_LIMIT" });
  const f = fixture();
  Reflect.set(f.candidate, "fields", [{ id: id(8), arbitrary: true }]);
  await expect(f.run()).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
  await expect(fixture().run(2147483647)).rejects.toMatchObject({
    code: "NATIVE_CONVERSION_PLAN_CONTEXT_INVALID",
  });
});

it("requires already enrolled field identity and rejects catalogue injection", async () => {
  const field = coreFixture().field[0]!;
  for (const storedIdentity of [null, id(99)]) {
    const f = fixture({
      entity_field: [{ id: field.id, field_identity_id: storedIdentity }],
    });
    Reflect.set(f.source, "fields", [{ id: field.id }]);
    Reflect.set(f.candidate, "fields", [field]);
    await expect(f.run()).rejects.toMatchObject({
      code: "NATIVE_CONVERSION_FIELD_IDENTITY_SOURCE_REQUIRED",
    });
  }
  const f = fixture();
  Reflect.set(f.candidate, "fieldIdentities", [{ id: id(99) }]);
  await expect(f.run()).rejects.toMatchObject({
    code: "NATIVE_CONVERSION_RETAINED_BRANCH_CHANGED",
  });
  expect(f.query).not.toHaveBeenCalled();
});
