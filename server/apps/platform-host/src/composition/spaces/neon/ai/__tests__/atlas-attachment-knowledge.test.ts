import { EventEmitter } from "node:events";
import { describe, it, expect, vi, beforeEach } from "vitest";
const m = vi.hoisted(() => ({
  routes: new Map<string, Function>(),
  source: vi.fn(),
  ingest: vi.fn(async () => ({
    revisionId: "revision",
    chunkCount: 1,
    replayed: false,
  })),
  search: vi.fn(async () => []),
  owner: vi.fn(async () => true),
}));
vi.mock("@athyper/server-runtime-http", () => ({
  defineRouteContract: (v: unknown) => v,
  registerContractRoute: (
    _a: unknown,
    c: { path: string },
    _auth: unknown,
    h: Function,
  ) => m.routes.set(c.path, h),
}));
vi.mock("@athyper/server-platform-ai", () => ({
  KyselyAtlasKnowledgeRepository: class {},
  AtlasKnowledgeService: class {
    registerSource = m.source;
    ingest = m.ingest;
    search = m.search;
  },
}));
vi.mock("@athyper/server-service-attachments", () => ({
  createAttachmentRetrievalAdmission: () => ({ authorize: m.owner }),
}));
vi.mock("@athyper/server-adapter-search-meilisearch", () => ({
  createMeilisearchIndex: () => ({}),
}));
import { registerAtlasAttachmentKnowledge } from "../atlas-attachment-knowledge.js";
const tenant = "44444444-4444-4444-8444-444444444444",
  id = "fc668e33-9d67-4015-83ba-8be70dfbb2c6",
  parent = "f7688c3d-8c92-5651-a469-da3f4f786375";
function setup({ denied = false, scopeRequired = false, plane = "neon" } = {}) {
  const execute = vi.fn(async () => ({
    rows: [{ text: "Actual extracted owner text", sha256: "a".repeat(64) }],
  }));
  const db = {
    getExecutor: () => ({
      transformQuery: (x: unknown) => x,
      compileQuery: (x: unknown) => x,
      executeQuery: execute,
    }),
  };
  const records = vi.fn(async () => {
    if (scopeRequired)
      throw Object.assign(new Error("Scope required"), { status: 409 });
    return { data: [{ id: parent }] };
  });
  registerAtlasAttachmentKnowledge(
    {} as never,
    {
      authenticate: vi.fn(),
      readContext: () => ({
        planeKey: plane,
        tenantId: tenant,
        principalId: "actor",
      }),
      transactions: {
        run: async (_p: unknown, _a: unknown, f: Function) => f(db),
      },
      authorizer: { authorize: async () => ({ allowed: !denied }) },
      metadata: {
        getEntityDescriptor: async () => ({
          ai: { enabled: true },
          planeKey: "neon",
          operations: {
            read: { permissionCode: "neon.business_partner.record.read" },
          },
          storage: { idField: "id" },
        }),
      },
      records: { list: records },
      search: { baseUrl: "http://test", apiKey: "test" },
    } as never,
  );
  async function call(body: object, search = false) {
    let status = 200,
      result: unknown;
    const next = vi.fn();
    const res = Object.assign(new EventEmitter(), {
      status: (s: number) => {
        status = s;
        return res;
      },
      json: (b: unknown) => {
        result = b;
        return res;
      },
    });
    await m.routes.get(
      search
        ? "/api/atlas/knowledge/search"
        : "/api/atlas/knowledge/attachments/reindex",
    )!(Object.assign(new EventEmitter(), { body }), res, next);
    return { status, result, next };
  }
  return { call, records, execute };
}
const body = {
  attachmentId: id,
  entityCode: "business_partner",
  recordId: parent,
  scopeCoordinate: {
    operatingOrganizationId: "a478f9c0-8226-5d22-9599-b8fb27a45180",
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  m.routes.clear();
  m.owner.mockResolvedValue(true);
});
describe("local attachment knowledge boundary", () => {
  it("indexes actual owner text and scanned version, ignoring caller text and permission", async () => {
    const s = setup();
    const r = await s.call({
      ...body,
      text: "UNTRUSTED",
      permissionCode: "allow.all",
    });
    expect(r.next).not.toHaveBeenCalled();
    expect(r.status).toBe(200);
    expect(m.ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: id,
        sourceVersionId: id + ":" + "a".repeat(64),
        text: "Actual extracted owner text",
      }),
    );
    expect(m.source).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKind: "attachment",
        permissionCode: "neon.collaboration.attachment.read",
      }),
    );
    expect(s.records).toHaveBeenCalledWith(
      expect.objectContaining({
        recordIds: [parent],
        scopeCoordinate: body.scopeCoordinate,
      }),
    );
  });
  it("denies permissions before loading text", async () => {
    const s = setup({ denied: true });
    expect((await s.call(body)).status).toBe(403);
    expect(s.execute).not.toHaveBeenCalled();
    expect(m.source).not.toHaveBeenCalled();
  });
  it("does not infer missing work scope", async () => {
    const s = setup({ scopeRequired: true });
    expect((await s.call({ ...body, scopeCoordinate: undefined })).status).toBe(
      409,
    );
    expect(s.execute).not.toHaveBeenCalled();
  });
  it("rejects stale owner eligibility", async () => {
    m.owner.mockResolvedValue(false);
    const s = setup();
    expect((await s.call(body)).status).toBe(403);
    expect(m.ingest).not.toHaveBeenCalled();
  });
  it("rejects a different plane", async () => {
    const s = setup({ plane: "studio" });
    expect((await s.call(body)).status).toBe(403);
    expect(s.execute).not.toHaveBeenCalled();
  });
  it("rejects malformed attachment coordinates", async () => {
    const s = setup();
    expect((await s.call({ ...body, attachmentId: "' OR true" })).status).toBe(
      400,
    );
    expect(s.execute).not.toHaveBeenCalled();
  });
  it("returns only admission-filtered citation results", async () => {
    const s = setup();
    const r = await s.call({ ...body, query: "synthetic" }, true);
    expect(r.result).toEqual({ citations: [] });
    expect(m.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "synthetic", limit: 8 }),
    );
    expect(s.execute).not.toHaveBeenCalled();
  });
});
