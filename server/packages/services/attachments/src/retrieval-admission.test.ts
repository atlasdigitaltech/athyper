import { createHash } from "node:crypto";
import {
  Kysely,
  DummyDriver,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { expect, it, vi } from "vitest";
import {
  createAttachmentRetrievalAdmission,
  type AttachmentRetrievalRequest,
} from "./retrieval-admission.js";
const request = {
  context: { tenantId: "tenant", principalId: "actor", planeKey: "neon" },
  source: {
    tenantId: "tenant",
    sourceKind: "attachment",
    sourceId: "10000000-0000-4000-8000-000000000010",
    entityCode: "business_partner",
    permissionCode: "ai.agent.use",
  },
  citation: {
    sourceId: "10000000-0000-4000-8000-000000000010",
    sourceVersionId: "version",
    contentHash: createHash("sha256").update("😀 document").digest("hex"),
    characterStart: 0,
    characterEnd: "😀 document".length,
  },
} as AttachmentRetrievalRequest;
function fixture() {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery) {
      queries.push(query);
      return { rows: [{ entity_id: "parent", text: "😀 document" }] as R[] };
    },
    async *streamQuery<R>() {
      yield { rows: [] as R[] };
    },
  };
  class Driver extends DummyDriver {
    override async acquireConnection() {
      return connection;
    }
  }
  const db = new Kysely({
    dialect: {
      createDriver: () => new Driver(),
      createAdapter: () => new PostgresAdapter(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createIntrospector: (db) => new PostgresIntrospector(db),
    },
  });
  const authorizeParent = vi.fn(async () => true),
    authorize = vi.fn(async () => ({ allowed: true }));
  const admission = createAttachmentRetrievalAdmission({
    transactions: { run: async (_plane, _actor, work) => work(db as never) },
    authorizer: { authorize } as never,
    authorizeParent,
  });
  return { db, queries, authorizeParent, authorize, admission };
}
it("checks canonical parent and fixed attachment permission before bounded text access", async () => {
  const h = fixture();
  try {
    expect(await h.admission.authorize(request)).toBe(true);
    expect(h.authorizeParent).toHaveBeenCalledWith({
      context: request.context,
      entityCode: "business_partner",
      recordId: "parent",
    });
    expect(h.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        permissionCode: "neon.collaboration.attachment.read",
        resource: expect.objectContaining({
          recordId: "parent",
          attachmentId: request.source.sourceId,
        }),
      }),
    );
    // Attachment permissions are not Meta Entity operations; parent admission is separate.
    expect(h.authorize).not.toHaveBeenCalledWith(expect.objectContaining({resource:expect.objectContaining({entityCode:expect.any(String)})}));
    expect(h.queries).toHaveLength(2);
    expect(h.queries[0]!.sql).toContain("NULL::text AS text");
    expect(h.queries[1]!.parameters).toContain("parent");
    expect(h.queries[1]!.sql).toContain(
      "octet_length(a.extracted_text)<=1000000",
    );
  } finally {
    await h.db.destroy();
  }
});
it("does not load text after denied parent or attachment permission", async () => {
  const h = fixture();
  try {
    h.authorizeParent.mockResolvedValue(false);
    expect(await h.admission.authorize(request)).toBe(false);
    expect(h.queries).toHaveLength(1);
    expect(h.authorize).not.toHaveBeenCalled();
    h.authorizeParent.mockResolvedValue(true);
    h.authorize.mockResolvedValue({ allowed: false });
    expect(await h.admission.authorize(request)).toBe(false);
    expect(h.queries).toHaveLength(2);
    h.authorizeParent.mockRejectedValue(Error("scope required"));
    expect(await h.admission.authorize(request)).toBe(false);
  } finally {
    await h.db.destroy();
  }
});
it("rejects wrong source types, tenants, excessive ranges and changed extracted text", async () => {
  const h = fixture();
  try {
    for (const source of [
      { ...request.source, sourceKind: "record" },
      { ...request.source, tenantId: "other" },
      { ...request.source, entityCode: "atlas.prompt" },
    ])
      expect(await h.admission.authorize({ ...request, source })).toBe(false);
    expect(
      await h.admission.authorize({
        ...request,
        citation: { ...request.citation, characterEnd: 1_000_001 },
      }),
    ).toBe(false);
    expect(h.queries).toHaveLength(0);
    expect(
      await h.admission.authorize({
        ...request,
        citation: { ...request.citation, contentHash: "b".repeat(64) },
      }),
    ).toBe(false);
  } finally {
    await h.db.destroy();
  }
});
