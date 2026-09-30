import { describe, expect, it } from "vitest";
import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Transaction } from "kysely";
import { createKyselyDerivativeSourceRepository, createKyselyDerivativeRepository } from "./document-derivatives.js";

const id = "11111111-1111-4111-8111-111111111111";
function fixture(eligible: boolean) {
  const queries: string[] = [];
  class Driver extends DummyDriver {
    override async acquireConnection() { return {
      executeQuery: async <R>(query: { sql: string }) => {
        queries.push(query.sql);
        return { rows: (eligible ? [{ id, storage_key: "source", content_type: "application/pdf", sha256: "hash", size_bytes: 42 }] : []) as R[] };
      },
      async *streamQuery<R>(): AsyncGenerator<{ rows: R[] }> { throw new Error("unused"); },
    }; }
  }
  const db = new Kysely<Record<string, never>>({ dialect: {
    createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(),
    createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: db => new PostgresIntrospector(db),
  } });
  return { queries, tx: db as unknown as Transaction<Record<string, never>> };
}
describe("draft derivative source eligibility", () => {
  it("admits live owned drafts as well as pinned links, retaining scan checks", async () => {
    const f = fixture(true);
    expect(await createKyselyDerivativeSourceRepository().loadSource(id, id, f.tx)).toMatchObject({ storageKey: "source" });
    expect(f.queries[0]).toContain("link.pinned_attachment_id=attachment.id");
    expect(f.queries[0]).toContain("draft.tenant_id=attachment.tenant_id AND draft.id=attachment.draft_id");
    expect(f.queries[0]).toContain("draft.principal_id=attachment.uploaded_by");
    expect(f.queries[0]).toContain("draft.expires_at>clock_timestamp()");
    expect(f.queries[0]).toContain("attachment.is_virus_scanned");
  });
  it("rechecks draft eligibility before publishing and refuses a removed or expired source", async () => {
    const f = fixture(false);
    const repo = createKyselyDerivativeRepository();
    await expect(repo.markReady({ id, tenantId: id } as Parameters<typeof repo.markReady>[0], f.tx)).rejects.toThrow("source is no longer eligible");
    expect(f.queries).toHaveLength(1);
    expect(f.queries[0]).toContain("draft.tenant_id=a.tenant_id AND draft.id=a.draft_id");
    expect(f.queries[0]).toContain("draft.principal_id=a.uploaded_by");
    expect(f.queries[0]).toContain("draft.expires_at>clock_timestamp()");
    expect(f.queries[0]).toContain("a.is_virus_scanned");
  });
});
