import { expect, it, vi } from "vitest";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { createAtlasEntityContextTools } from "./entity-context-tools.js";
import { AtlasRegisteredToolCoordinator } from "./runtime-tool-coordinator.js";
import { AtlasToolRegistry, AtlasToolService } from "./tool-service.js";
import { MemoryToolStore } from "./__tests__/tool-store-fixture.js";
import { context as actor } from "./__tests__/review-fixture.js";
const id = actor.tenantId;
function fixture() {
  const context = {
    ...actor,
    permissions: {
      ...actor.permissions,
      allowed: ["common.platform.reference.view"],
    },
  };
  const descriptor = {
    entityCode: "country",
    planeKey: "neon",
    compiledHash: "published",
    storage: { idField: "id" },
    operations: { read: { permissionCode: "common.platform.reference.view" } },
    fields: [{ key: "name", type: "string" }],
    ai: {
      enabled: true,
      contextKinds: ["record"],
      aliases: ["country"],
      summaryFieldKeys: ["name"],
      insightProviders: [
        "entity_explain_fields",
        "entity_read_record",
        "entity_read_comments",
        "entity_read_snapshots",
        "entity_compare_snapshots",
      ].map((id) => ({ id, version: 1 })),
    },
  } as unknown as EntityRuntimeDescriptor;
  const metadata = { getEntityDescriptor: vi.fn(async () => descriptor) };
  const read = vi.fn(async () => ({
    items: [{ text: "Saved comment" }],
    hasMore: false,
  }));
  const query = vi.fn(async () => ({
    rows: [{ name: "Malaysia" }],
    sources: [
      {
        entityCode: "country",
        recordId: id,
        revision: "1",
        descriptorHash: "published",
      },
    ],
    authorizationProfileHash: context.profileHash,
    responseBytes: 10,
  }));
  const registry = new AtlasToolRegistry(
    createAtlasEntityContextTools(metadata, { read }),
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
        throw Error("unexpected mutation");
      },
    },
  });
  const coordinator = new AtlasRegisteredToolCoordinator(
    registry,
    service,
    metadata,
  );
  const page = {
    schemaVersion: 1,
    kind: "record",
    entityCode: "country",
    recordId: id,
    section: "overview",
    dirty: false,
    generationId: id,
    locale: "en",
  } as const;
  const request = {
    context,
    runId: id,
    threadId: id,
    callId: "c",
    toolCode: "entity_read_comments",
    arguments: { recordId: id },
    mutationToolsAllowed: false,
    businessContext: {
      page,
      descriptorHash: "published",
      scopeFingerprint: "scope",
    },
  };
  return {
    context,
    descriptor,
    metadata,
    read,
    query,
    coordinator,
    request,
    service,
  };
}
it("binds model calls to published metadata and revalidates saved answer evidence", async () => {
  const h = fixture();
  const definitions = await h.coordinator.definitions(
    h.context,
    { readToolsAllowed: true, mutationToolsAllowed: false },
    undefined,
    h.request.businessContext,
  );
  expect(definitions.map((d) => d.name)).toEqual([
    "entity_explain_fields",
    "entity_read_comments",
    "entity_read_snapshots",
    "entity_compare_snapshots",
  ]);
  expect(JSON.stringify(definitions)).not.toContain("descriptorHash");
  const outcome = await h.coordinator.handle(h.request);
  expect(h.read).toHaveBeenCalledWith({
    context: h.context,
    entityCode: "country",
    recordId: id,
    capability: "entity_read_comments",
    arguments: {},
  });
  expect(await h.service.revalidate(h.context, outcome.replayEvidence!)).toBe(
    true,
  );
  h.read.mockResolvedValue({
    items: [{ text: "Edited comment" }],
    hasMore: false,
  });
  expect(await h.service.revalidate(h.context, outcome.replayEvidence!)).toBe(
    false,
  );
  h.read.mockRejectedValue(Error("permission revoked"));
  expect(await h.service.revalidate(h.context, outcome.replayEvidence!)).toBe(
    false,
  );
});
it("fails closed without current context, metadata, or agent admission", async () => {
  const h = fixture();
  expect(
    await h.coordinator.definitions(h.context, {
      readToolsAllowed: true,
      mutationToolsAllowed: false,
    }),
  ).toEqual([]);
  await expect(
    h.coordinator.handle({ ...h.request, businessContext: undefined }),
  ).rejects.toMatchObject({ code: "TOOL_DENIED" });
  await expect(
    h.coordinator.handle({ ...h.request, allowedToolCodes: [] }),
  ).rejects.toThrow();
  h.metadata.getEntityDescriptor.mockResolvedValue({
    ...h.descriptor,
    compiledHash: "new",
  });
  await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({
    code: "TOOL_DENIED",
  });
  expect(h.read).not.toHaveBeenCalled();
});
it.each([
  { entityCode: "principal" },
  { descriptorHash: "forged" },
  { recordId: actor.principalId },
  { sql: "select *" },
])("rejects model coordinate override %j", async (patch) => {
  const h = fixture();
  await expect(
    h.coordinator.handle({
      ...h.request,
      arguments: { ...h.request.arguments, ...patch },
    }),
  ).rejects.toMatchObject({ code: "TOOL_DENIED" });
  expect(h.read).not.toHaveBeenCalled();
});
it("denies cross-tenant/parent mismatches before owner reads", async () => {
  const h = fixture();
  h.query.mockResolvedValue({
    rows: [],
    sources: [],
    authorizationProfileHash: "other",
    responseBytes: 0,
  });
  await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({
    code: "TOOL_DENIED",
  });
  expect(h.read).not.toHaveBeenCalled();
});
it("denies removed publication and current explicit permission denial", async () => {
  const h = fixture();
  for (const context of [
    {
      ...h.context,
      permissions: {
        ...h.context.permissions,
        denied: ["common.platform.reference.view"],
      },
    },
    { ...h.context, planeKey: "mesh" as const },
  ]) {
    await expect(
      h.coordinator.handle({ ...h.request, context }),
    ).rejects.toMatchObject({ code: "TOOL_DENIED" });
  }
  h.metadata.getEntityDescriptor.mockResolvedValue({
    ...h.descriptor,
    ai: { ...h.descriptor.ai!, enabled: false },
  });
  await expect(h.coordinator.handle(h.request)).rejects.toMatchObject({
    code: "TOOL_DENIED",
  });
  expect(h.read).not.toHaveBeenCalled();
});
it("requires two distinct explicit snapshots and preserves owner coverage", async () => {
  const h = fixture();
  await expect(
    h.coordinator.handle({
      ...h.request,
      toolCode: "entity_compare_snapshots",
      arguments: { recordId: id, from: id, to: id },
    }),
  ).rejects.toMatchObject({ code: "TOOL_INVALID" });
  await expect(
    h.coordinator.handle({
      ...h.request,
      toolCode: "entity_compare_snapshots",
    }),
  ).rejects.toMatchObject({ code: "TOOL_INVALID" });
  const result = await h.coordinator.handle({
    ...h.request,
    toolCode: "entity_compare_snapshots",
    arguments: { recordId: id, from: id, to: actor.principalId },
  });
  expect(result.result?.outcome).toBe("completed");
  expect(h.read).toHaveBeenCalledWith(
    expect.objectContaining({ arguments: { from: id, to: actor.principalId } }),
  );
});

it("projects only field declarations admitted by Records, never storage or hidden rules", async () => {
  const h = fixture();
  h.metadata.getEntityDescriptor.mockResolvedValue({
    ...h.descriptor,
    fields: [
      {
        key: "name",
        type: "string",
        required: true,
        storagePath: "secret_storage",
        writableOn: [],
        validation: { options: ["SECRET"] },
      },
      {
        key: "hidden",
        type: "string",
        required: true,
        storagePath: "hidden",
        writableOn: [],
      },
    ],
  });
  const result = await h.coordinator.handle({
    ...h.request,
    toolCode: "entity_explain_fields",
  });
  expect(result.result?.data).toMatchObject({
    fields: [{ key: "name", label: "name", type: "string", required: true }],
    readOnlyEntity: true,
  });
  expect(JSON.stringify(result.result?.data)).not.toMatch(
    /SECRET|hidden|secret_storage/,
  );
  expect(h.read).not.toHaveBeenCalled();
});
