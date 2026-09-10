import { describe, expect, it, vi } from "vitest";
import { createAtlasBusinessContextResolver } from "../business-context.js";
import { AtlasAgentRuntime } from "../agent-runtime.js";
const id = "10000000-0000-4000-8000-000000000001",
  denied = "20000000-0000-4000-8000-000000000002";
const context = {
  planeKey: "neon",
  realmKey: "neon",
  tenantId: "verified-tenant",
  principalId: "verified-principal",
  requestId: "verified-request",
  profileHash: "verified-profile",
  authEpoch: 1,
  permissions: {
    planeKey: "neon",
    tenantId: "verified-tenant",
    principalId: "verified-principal",
    profileHash: "verified-profile",
    allowed: [],
    denied: [],
    planLocked: [],
    planeExcluded: [],
  },
} as never;
const base = {
  schemaVersion: 1,
  entityCode: "business_partner",
  generationId: id,
  locale: "en",
};
const manage = {
  ...base,
  kind: "manage",
  filters: [{ field: "status", operator: "eq", value: "draft" }],
  sort: [],
  selectedIds: [id],
  visibleIds: [id],
  analysisTarget: "selection",
  pageSize: 25,
  pageIndex: 0,
  standardViewKey: "drafts",
  fields: ["code", "status"],
  group: "status",
  cursor: "owner-cursor",
};
function fixture(directoryMode?: "tenant" | "company", cases?: import("@athyper/server-contract-ai").AtlasCaseExplanationOwner) {
  const list = vi.fn(async (query: any) => {
    if (
      query.scopeCoordinate?.companyCodeId === denied ||
      query.scopeCoordinate?.companyCodeIds?.includes(denied) ||
      query.filters?.some((f: any) => f.field === "secret")
    )
      throw new Error("Denied by owner");
    return {
      rows: [{ id }],
      descriptorHash: "published-hash",
      scopeFingerprint: "authorized-scope",
    };
  });
  const resolver = createAtlasBusinessContextResolver({
    cases,
    metadata: {
      getEntityDescriptor: async () => ({
        entityCode: "business_partner",
        planeKey: "neon",
        compiledHash: "published-hash",
        ...(directoryMode ? {directoryScope: {schemaVersion: 1, mode: directoryMode}} : {}),
      }),
    } as never,
    records: {
      get: async (query: any) => ({
        data: query.recordId === id ? { id } : null,
      }),
    } as never,
    list,
  });
  return { resolver, list };
}
describe("Atlas authorized context admission", () => {
  it("delegates standard views, search, sort, pagination and selections to Manage owner", async () => {
    const { resolver, list } = fixture();
    const result = await resolver.resolve(context, manage);
    expect(result).toMatchObject({
      descriptorHash: "published-hash",
      page: manage,
    });
    expect(list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        context,
        standardViewKey: "drafts",
        fields: ["code", "status"],
        group: "status",
        cursor: "owner-cursor",
        filters: manage.filters,
        limit: 25,
      }),
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ recordIds: [id], limit: 100 }),
    );
  });
  it.each([
    { ...manage, selectedIds: [id, denied] },
    { ...manage, visibleIds: [denied] },
    { ...manage, directory: { companyCodeIds: [id, denied] } },
    {
      ...manage,
      filters: [{ field: "secret", operator: "eq", value: "hidden" }],
    },
    { ...base, kind: "record", recordId: denied, dirty: false },
    {
      ...base,
      kind: "record",
      recordId: id,
      dirty: false,
      workContext: { companyCodeId: denied },
    },
  ])(
    "rejects every unauthorized member before model input %#",
    async (input) => {
      await expect(
        fixture().resolver.resolve(context, input),
      ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    },
  );
  it("separates directory filters from transaction work context", async () => {
    const { resolver, list } = fixture();
    await resolver.resolve(context, {
      ...manage,
      directory: { companyCodeIds: [id] },
      workContext: { companyCodeId: id },
    });
    expect(list.mock.calls[0]![0].scopeCoordinate).toEqual({
      companyCodeId: id,
    });
    expect(list.mock.calls[1]![0].scopeCoordinate).toEqual({
      companyCodeIds: [id],
    });
  });
  it("fingerprints semantic changes but not generation IDs", async () => {
    const { resolver } = fixture();
    const a = await resolver.resolve(context, manage),
      b = await resolver.resolve(context, { ...manage, generationId: denied }),
      c = await resolver.resolve(context, { ...manage, search: "different" });
    expect(a.scopeFingerprint).toBe(b.scopeFingerprint);
    expect(a.scopeFingerprint).not.toBe(c.scopeFingerprint);
  });
  it("rejects malformed runtime context before any dependencies are called", async () => {
    const runtime = new AtlasAgentRuntime({
      maxInputCharacters: 100,
      maxToolRounds: 0,
    } as never);
    const command = {
      context: {
        planeKey: "neon",
        realmKey: "neon",
        requestId: "request-1",
        tenantId: "t",
        principalId: "p",
        profileHash: "h",
        authEpoch: 1,
        permissions: {
          planeKey: "neon",
          tenantId: "t",
          principalId: "p",
          profileHash: "h",
        },
      },
      businessContext: { ...manage, tenantId: "forged" },
      userText: "hello",
    } as never;
    await expect(
      runtime.run(command)[Symbol.asyncIterator]().next(),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });
});

it("binds registered BP reads to the current record/selection and explicit organization", async () => {
  const { AtlasRegisteredToolCoordinator } =
    await import("../runtime-tool-coordinator.js");
  const { AtlasToolRegistry } = await import("../tool-service.js");
  const { createBusinessPartnerAtlasTools } =
    await import("../business-partner-tools.js");
  const preview = vi.fn(async () => ({
      confirmationRequired: false,
      proposalId: "proposal",
    })),
    run = vi.fn(async () => ({}));
  const coordinator = new AtlasRegisteredToolCoordinator(
    new AtlasToolRegistry(createBusinessPartnerAtlasTools()),
    { preview, run } as never,
  );
  const page = {
    ...base,
    kind: "record",
    recordId: id,
    dirty: false,
    workContext: { operatingOrganizationId: id },
  };
  const input = {
    context,
    runId: "run",
    threadId: "thread",
    callId: "call",
    toolCode: "bp_read_summary",
    arguments: { recordId: denied },
    mutationToolsAllowed: false,
    businessContext: { page, descriptorHash: "h", scopeFingerprint: "s" },
  } as any;
  await expect(coordinator.handle(input)).rejects.toMatchObject({
    code: "TOOL_DENIED",
  });
  expect(preview).not.toHaveBeenCalled();
  await expect(
    coordinator.handle({
      ...input,
      arguments: { recordId: id, operatingOrganizationId: denied },
    }),
  ).rejects.toMatchObject({ code: "TOOL_DENIED" });
  await coordinator.handle({ ...input, arguments: { recordId: id } });
  expect(preview).toHaveBeenCalledWith(
    expect.objectContaining({
      arguments: { recordId: id, operatingOrganizationId: id },
    }),
  );
  await expect(
    coordinator.handle({
      ...input,
      arguments: { recordId: id },
      businessContext: {
        ...input.businessContext,
        page: { ...page, asOf: "2025-01-01T00:00:00Z" },
      },
    }),
  ).rejects.toMatchObject({ code: "TOOL_DENIED" });
});

it("keeps transport coordinates server-side and never exposes a partial multi-selection as complete", async () => {
  const { atlasBusinessContextModelScope } = await import("../business-context.js");
  const { parseAtlasBusinessContext, fitLocalPrompt, localPromptTokenBound } = await import("@athyper/server-contract-ai");
  const { createBusinessPartnerAtlasTools } = await import("../business-partner-tools.js");
  const page = parseAtlasBusinessContext({ ...manage, selectedIds: [id, denied], visibleIds: [id, denied], search: "untrusted filter text" });
  const scope = atlasBusinessContextModelScope(page);
  expect(scope).toMatchObject({ analysisTarget: "selection", selectedCount: 2, visibleCount: 2, searchApplied: true });
  for (const key of ["recordId", "selectedIds", "visibleIds", "cursor", "fields", "generationId", "filters", "search"]) expect(scope).not.toHaveProperty(key);
  const tools = createBusinessPartnerAtlasTools().filter(t=>t.manifest.access==="read").map(t=>({name:t.manifest.toolCode,description:t.manifest.description,inputSchema:t.manifest.inputSchema}));
  const prompt = {messages:[{role:"system" as const,content:[{type:"text" as const,text:JSON.stringify(scope)}]},{role:"user" as const,content:[{type:"text" as const,text:"Explain this scope"}]}],tools,maxOutputTokens:128};
  expect(localPromptTokenBound(fitLocalPrompt(prompt))+128).toBeLessThanOrEqual(4096);
  expect(atlasBusinessContextModelScope(parseAtlasBusinessContext(manage))).toMatchObject({recordId:id});
});

it("admits tenant-directory identity independently of a denied work context", async () => {
  const {resolver, list} = fixture("tenant");
  const page = {...base, kind: "record", recordId: id, dirty: false, workContext: {operatingOrganizationId: id, companyCodeId: denied}};
  expect(await resolver.resolve(context, page)).toMatchObject({page});
  expect(list.mock.calls[0]![0].scopeCoordinate).toBeUndefined();
  await expect(fixture().resolver.resolve(context, page)).rejects.toThrow();
  await expect(fixture("company").resolver.resolve(context, page)).rejects.toThrow();
  await expect(resolver.resolve(context, {...page, recordId: denied})).rejects.toThrow();
});

it("BP-AI-07: admits case context only through the owner with the parent record coordinate", async () => {
  const read = vi.fn(async () => ({} as import("@athyper/server-contract-ai").AtlasCaseExplanation));
  const page = {...base, kind: "record", recordId: id, caseId: denied, dirty: false};
  await expect(fixture().resolver.resolve(context, page)).rejects.toMatchObject({code: "PERMISSION_DENIED"});
  await expect(fixture(undefined, {read}).resolver.resolve(context, page)).resolves.toMatchObject({page});
  expect(read).toHaveBeenCalledWith({context, requestId: denied, businessPartnerId: id});
  read.mockRejectedValueOnce(new Error("protected owner denial"));
  await expect(fixture(undefined, {read}).resolver.resolve(context, page)).rejects.toMatchObject({code: "PERMISSION_DENIED", message: "The requested Atlas business context is unavailable."});
});

it('admits Mesh records only through the selected account owner and fails closed on membership denial',async()=>{
 const get=vi.fn(async()=>{throw Error('Unscoped get must not run');});
 const list=vi.fn(async()=>({rows:[{id}],descriptorHash:'mesh-hash',scopeFingerprint:'account-scope'}));
 const resolver=createAtlasBusinessContextResolver({metadata:{getEntityDescriptor:async()=>({entityCode:'network_relationship',planeKey:'mesh',compiledHash:'mesh-hash',ai:{enabled:true,contextKinds:['record'],insightProviders:[{id:'entity_read_record',version:1}]}})} as never,records:{get} as never,list:list as never});
 const actor={...(context as any),planeKey:'mesh',permissions:{...(context as any).permissions,planeKey:'mesh'}} as never;
 const page={...base,entityCode:'network_relationship',kind:'record',recordId:id,dirty:false,workContext:{networkAccountId:id}};
 await expect(resolver.resolve(actor,page)).resolves.toMatchObject({descriptorHash:'mesh-hash'});
 expect(get).not.toHaveBeenCalled();expect(list).toHaveBeenCalledWith(expect.objectContaining({scopeCoordinate:{networkAccountId:id},recordIds:[id]}));
 list.mockRejectedValueOnce(Error('Membership revoked'));
 await expect(resolver.resolve(actor,page)).rejects.toThrow();
});
