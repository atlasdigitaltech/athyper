import { expect, it, vi } from "vitest";
import type {
  EntityRuntimeDescriptor,
  MetadataReader,
} from "@athyper/server-contract-metadata";
import type { AtlasRegisteredTool } from "@athyper/server-contract-ai";
import { createAtlasEntityLookupTools } from "./entity-lookup-tools.js";
import { context as actor } from "./__tests__/review-fixture.js";
import { AtlasRegisteredToolCoordinator } from "./runtime-tool-coordinator.js";
import { AtlasToolRegistry, AtlasToolService } from "./tool-service.js";
import { MemoryToolStore } from "./__tests__/tool-store-fixture.js";
const context = {
  ...actor,
  permissions: {
    ...actor.permissions,
    allowed: ["nation.read", "partner.read"],
  },
};
const id = "10000000-0000-4000-8000-000000000003";
const related = "10000000-0000-4000-8000-000000000004";
function fixture() {
  const make = (entityCode: string): EntityRuntimeDescriptor => ({
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode,
    planeKey: "neon",
    releaseId: id,
    releaseNo: 1,
    compiledHash: "published-" + entityCode,
    contractHash: "contract",
    storage: {
      schema: "master",
      object: entityCode,
      idField: "id",
      tenantField: "tenant_id",
    },
    fields: [
      {
        key: "name",
        storagePath: "name",
        type: "string",
        required: true,
        writableOn: [],
        filterable: true,
        searchable: true,
        classification: "public",
        list: { label: "Name" },
      },
      {
        key: "dial_code",
        storagePath: "dial_code",
        type: "string",
        required: false,
        writableOn: [],
        classification: "public",
        list: { label: "Calling code" },
      },
      {
        key: "private",
        storagePath: "private",
        type: "string",
        required: false,
        writableOn: [],
        classification: "public",
        readPermissionCode: "secret.read",
      },
      {
        key: "nation_id",
        storagePath: "nation_id",
        type: "uuid",
        required: false,
        writableOn: [],
        classification: "internal",
        referenceTargetEntity: "nation",
      },
    ],
    operations: {
      read: { code: "read", permissionCode: entityCode + ".read" },
    },
    ai: {
      schemaVersion: 1,
      enabled: true,
      aliases: [entityCode],
      summaryFieldKeys: ["name", "dial_code", "private", "nation_id"],
      searchFieldKeys: ["name"],
      relationshipKeys: ["nation_id"],
      contextKinds: ["record", "manage"],
      insightProviders: [
        { id: "entity_lookup", version: 1 },
        { id: "entity_follow_reference", version: 1 },
      ],
      actions: [],
      presentationProfiles: [],
    },
  });
  const descriptors = new Map([
    ["nation", make("nation")],
    ["partner", make("partner")],
  ]);
  const denied = new Set(["secret.read"]);
  const authorizer = {
    authorize: vi.fn(async ({ permissionCode }: { permissionCode: string }) =>
      denied.has(permissionCode)
        ? { allowed: false as const, reason: "denied" }
        : { allowed: true as const },
    ),
  };
  const metadata: MetadataReader = {
    listEntityCodes: async () => [...descriptors.keys()],
    getEntityDescriptor: async (_, code) => descriptors.get(code) ?? null,
  };
  const query = vi.fn(async (input: any) => ({
    rows:
      input.request.entityCode === "partner"
        ? [{ nation_id: related }]
        : [{ name: "Example nation", dial_code: "999" }],
    sources: [
      {
        entityCode: input.request.entityCode,
        recordId: input.request.entityCode === "partner" ? id : related,
        revision: "1",
        descriptorHash: "published-" + input.request.entityCode,
      },
    ],
    responseBytes: 100,
    authorizationProfileHash: context.profileHash,
  }));
  const tools = createAtlasEntityLookupTools(metadata, authorizer);
  async function execute(code: string, args: Record<string, unknown>) {
    const tool = tools.find((t) => t.manifest.toolCode === code)!;
    tool.validateArguments?.(args, {});
    return tool.readHandler!.execute({
      context: {
        context,
        records: { query },
        signal: new AbortController().signal,
      },
      arguments: args,
    } as Parameters<
      NonNullable<AtlasRegisteredTool["readHandler"]>["execute"]
    >[0]);
  }
  return { descriptors, make, denied, query, execute, metadata, tools };
}
it("discovers business labels from published metadata and automatically includes later Entities", async () => {
  const f = fixture();
  let result = await f.execute("entity_discover", { query: "calling code" });
  expect(JSON.stringify(result)).toContain("Calling code");
  expect(JSON.stringify(result)).not.toMatch(/private|secret.read|storagePath/);
  f.descriptors.set("new_reference", f.make("new_reference"));
  result = await f.execute("entity_discover", { query: "new_reference" });
  expect(JSON.stringify(result)).toContain("new_reference");
  f.denied.add("new_reference.read");
  result = await f.execute("entity_discover", { query: "new_reference" });
  expect(JSON.stringify(result)).not.toContain("published-new_reference");
  expect(f.query).not.toHaveBeenCalled();
});
it("looks up a named record without current-page binding and uses labels and authorized citations", async () => {
  const f = fixture();
  const result = await f.execute("entity_lookup", {
    entityCode: "nation",
    descriptorHash: "published-nation",
    searchField: "name",
    value: "Example",
    fields: ["dial_code"],
  });
  expect(result.data).toMatchObject({
    match: "one",
    items: [
      {
        fields: [
          { key: "name", value: "Example nation" },
          { key: "dial_code", label: "Calling code", value: "999" },
        ],
      },
    ],
  });
  expect(result.sources[0]?.coordinate.entityCode).toBe("nation");
  expect(f.query.mock.calls[0]![0].context).toBe(context);
});
it("denies stale publications, unknown fields, unsafe search fields, revoked grants and extra authority coordinates", async () => {
  for (const patch of [
    { descriptorHash: "old" },
    { fields: ["private"] },
    { fields: ["unknown"] },
    { searchField: "private" },
    { tenantId: "other" },
  ]) {
    const f = fixture();
    await expect(
      f.execute("entity_lookup", {
        entityCode: "nation",
        descriptorHash: "published-nation",
        searchField: "name",
        value: "Example",
        fields: ["dial_code"],
        ...patch,
      }),
    ).rejects.toThrow();
    expect(f.query).not.toHaveBeenCalled();
  }
  const f = fixture();
  f.denied.add("nation.read");
  await expect(
    f.execute("entity_lookup", {
      entityCode: "nation",
      descriptorHash: "published-nation",
      searchField: "name",
      value: "Example",
      fields: ["dial_code"],
    }),
  ).rejects.toThrow();
});
it("keeps multiple authorized matches ambiguous rather than selecting one", async () => {
  const f = fixture();
  f.query.mockResolvedValue({
    rows: [
      { name: "A", dial_code: "1" },
      { name: "B", dial_code: "2" },
    ],
    sources: [id, related].map((recordId) => ({
      entityCode: "nation",
      recordId,
      revision: "1",
      descriptorHash: "published-nation",
    })),
    responseBytes: 100,
    authorizationProfileHash: context.profileHash,
  });
  const result = await f.execute("entity_lookup", {
    entityCode: "nation",
    descriptorHash: "published-nation",
    searchField: "name",
    value: "A",
    fields: ["dial_code"],
  });
  expect(result.data).toMatchObject({ match: "ambiguous" });
});
it("follows only a declared authorized reference and cites both source and target", async () => {
  const f = fixture();
  const args = {
    sourceEntityCode: "partner",
    sourceRecordId: id,
    sourceDescriptorHash: "published-partner",
    relationshipKey: "nation_id",
    fields: ["dial_code"],
  };
  const result = await f.execute("entity_follow_reference", args);
  expect(result.sources.map((s) => s.coordinate.entityCode)).toEqual([
    "partner",
    "nation",
  ]);
  expect(f.query.mock.calls[1]![0].request.filters).toEqual([
    { field: "id", operator: "eq", value: related },
  ]);
  f.denied.add("nation.read");
  await expect(f.execute("entity_follow_reference", args)).rejects.toThrow();
  await expect(
    f.execute("entity_follow_reference", {
      ...args,
      relationshipKey: "undeclared",
    }),
  ).rejects.toThrow();
});

it("keeps explicit named lookup available across pages and binds relative lookup to the server page", async () => {
  const f = fixture();
  const registry = new AtlasToolRegistry(f.tools);
  const service = new AtlasToolService({
    registry,
    proposals: new MemoryToolStore(),
    records: { query: f.query },
    authority: {
      authorize: async () => ({ allowed: true, policyRevision: "1" }),
    },
    confirmations: { verify: async () => true },
    commands: {
      execute: async () => {
        throw Error("unexpected mutation");
      },
    },
  });
  const coordinator = new AtlasRegisteredToolCoordinator(
    registry,
    service,
    f.metadata,
  );
  const page = {
    schemaVersion: 1,
    kind: "record",
    entityCode: "partner",
    recordId: id,
    section: "overview",
    dirty: false,
    generationId: id,
    locale: "en",
  } as const;
  const businessContext = {
    page,
    descriptorHash: "published-partner",
    scopeFingerprint: "scope",
  };
  const definitions = await coordinator.definitions(
    context,
    { readToolsAllowed: true, mutationToolsAllowed: false },
    undefined,
    businessContext,
  );
  expect(definitions.map((d) => d.name)).toContain("entity_lookup");
  expect(
    JSON.stringify(
      definitions.find((d) => d.name === "entity_follow_reference")!
        .inputSchema,
    ),
  ).not.toContain("sourceRecordId");
  expect(
    coordinator.resolveIntent(
      context,
      "What is Example nation's calling code?",
      businessContext,
      definitions,
    ).kind,
  ).toBe("delegate");
  const summaryDefinitions = [
    ...definitions,
    {
      name: "entity_read_record",
      description: "Read current record",
      inputSchema: {},
      entitySection: {
        entityCode: "partner",
        sectionKey: "record_summary",
        aliases: ["summary", "overview"],
        resultKey: "items",
        label: "Record summary",
      },
    },
  ];
  expect(
    coordinator.resolveIntent(
      context,
      "Explain the saved information in overview.",
      businessContext,
      summaryDefinitions,
    ).kind,
  ).toBe("read");
  expect(
    coordinator.resolveIntent(
      context,
      "Show this record summary for Example nation",
      businessContext,
      summaryDefinitions,
    ).kind,
  ).toBe("delegate");
  const request = {
    context,
    runId: id,
    threadId: id,
    callId: "relative",
    toolCode: "entity_follow_reference",
    arguments: { relationshipKey: "nation_id", fields: ["dial_code"] },
    mutationToolsAllowed: false,
    businessContext,
  };
  const result = await coordinator.handle(request);
  expect(result.result?.outcome).toBe("completed");
  expect(f.query.mock.calls[0]![0].request.filters).toEqual([
    { field: "id", operator: "eq", value: id },
  ]);
  await expect(
    coordinator.handle({
      ...request,
      arguments: { ...request.arguments, sourceRecordId: related },
    }),
  ).rejects.toThrow();
  await expect(
    coordinator.handle({ ...request, businessContext: undefined }),
  ).rejects.toThrow();
  const global = await coordinator.definitions(context, {
    readToolsAllowed: true,
    mutationToolsAllowed: false,
  });
  expect(global.map((d) => d.name)).toEqual([
    "entity_discover",
    "entity_lookup",
  ]);
});
it("rejects mismatched evidence and never sends confidential or masked fields to lookup", async () => {
  const f = fixture();
  const d = f.descriptors.get("nation")!;
  f.descriptors.set("nation", {
    ...d,
    fields: d.fields.map((field) =>
      field.key === "dial_code"
        ? { ...field, classification: "confidential" }
        : field,
    ),
  });
  const args = {
    entityCode: "nation",
    descriptorHash: "published-nation",
    searchField: "name",
    value: "Example",
    fields: ["dial_code"],
  };
  await expect(f.execute("entity_lookup", args)).rejects.toThrow();
  expect(f.query).not.toHaveBeenCalled();
  f.descriptors.set("nation", d);
  f.query.mockResolvedValue({
    rows: [{ name: "Example", dial_code: "999" }],
    sources: [],
    responseBytes: 10,
    authorizationProfileHash: context.profileHash,
  });
  await expect(f.execute("entity_lookup", args)).rejects.toThrow();
});

it("keeps natural-language grammar from flooding the bounded catalogue with unrelated fields", async () => {
  const f = fixture();
  const d = f.descriptors.get("nation")!;
  const extra = Array.from({ length: 20 }, (_, i) => ({
    key: `iso_format_${i}`,
    storagePath: `iso_format_${i}`,
    type: "string" as const,
    required: false,
    writableOn: [],
    classification: "public" as const,
    list: { label: `ISO format ${i}` },
  }));
  f.descriptors.set("nation", {
    ...d,
    fields: [...d.fields, ...extra],
    ai: {
      ...d.ai!,
      summaryFieldKeys: [...d.ai!.summaryFieldKeys, ...extra.map((x) => x.key)],
    },
  });
  const result = await f.execute("entity_discover", {
    query: "What is Example nation's calling code?",
  });
  expect(JSON.stringify(result.data)).toContain("Calling code");
  expect(JSON.stringify(result.data)).not.toContain("iso_format_");
});
