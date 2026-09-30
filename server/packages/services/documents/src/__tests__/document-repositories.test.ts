import { Kysely, DummyDriver, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type CompiledQuery, type DatabaseConnection } from "kysely";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { describe, expect, it } from "vitest";
import { createKyselyDocumentArtifactRepository, type DocumentTransaction } from "../kysely-document-repositories.js";

function database(rows: Record<string, unknown>[] = []) {
  const queries: CompiledQuery[] = [];
  const connection: DatabaseConnection = {
    executeQuery: async <R>(query: CompiledQuery) => { queries.push(query); return { rows: rows as R[] }; },
    async *streamQuery<R>() { yield { rows: [] as R[] }; },
  };
  class Driver extends DummyDriver { override async acquireConnection() { return connection; } }
  const db = new Kysely<Record<string, never>>({ dialect: { createDriver: () => new Driver(), createAdapter: () => new PostgresAdapter(), createQueryCompiler: () => new PostgresQueryCompiler(), createIntrospector: (value) => new PostgresIntrospector(value) } });
  return { db, transaction: db as unknown as DocumentTransaction, queries };
}
const context = { tenantId: "11111111-1111-4111-8111-111111111111" } as VerifiedRequestContext;
describe("document repository access and replay guards", () => {
  it("filters download records by tenant, lifecycle, scan, expiry, and pinned link", async () => {
    const test = database();
    try {
      await expect(createKyselyDocumentArtifactRepository().findAccessible(context, "44444444-4444-4444-8444-444444444444", test.transaction)).resolves.toBeNull();
      const query = test.queries[0]!;
      expect(query.parameters).toEqual([context.tenantId, "44444444-4444-4444-8444-444444444444"]);
      expect(query.sql).toContain("attachment.status = 'active' AND attachment.is_virus_scanned");
      expect(query.sql).toContain("AND attachment.is_active");
      expect(query.sql).toContain("attachment.expires_at > clock_timestamp()");
      expect(query.sql).toContain("link.pinned_attachment_id = attachment.id");
    } finally { await test.db.destroy(); }
  });
  it.each([true, false])("only exposes a fingerprint when the reserved artifact is replayable: %s", async (replayable) => {
    const test = database([{ id: "document", entity_type: "invoice", entity_id: "entity", file_name: "invoice.pdf", size_bytes: 10, sha256: "abc", created_at: new Date("2026-08-09T00:00:00Z"), metadata: { template_id: "template", template_version_id: "version", template_version: 1, request_hash: "fingerprint" }, replayable }]);
    try {
      const result = await createKyselyDocumentArtifactRepository().findIdempotent(context, "request-1", test.transaction);
      expect(result).not.toBeNull();
      expect(result?.requestHash).toBe(replayable ? "fingerprint" : undefined);
      const query = test.queries[0]!;
      expect(query.parameters).toEqual([context.tenantId, "request-1"]);
      // An inactive/unlinked document still reserves its key under the unique index.
      expect(query.sql).toContain("LEFT JOIN document.attachment_link");
      expect(query.sql.split("WHERE")[1]).not.toContain("attachment.status");
    } finally { await test.db.destroy(); }
  });
});

it('rejects a pinned template whose stored content no longer matches its checksum',async()=>{
 const {createHash}=await import('node:crypto');const {createKyselyDocumentTemplateRepository}=await import('../kysely-document-repositories.js');
 const content={assets_manifest:{},content_html:'<p>{{name}}</p>',styles_css:'',variables_schema:{}};const hash=createHash('sha256').update(JSON.stringify(content)).digest('hex');
 const row={...content,binding_id:'binding',template_id:'template',template_version_id:'version',version:1,checksum:hash,template_name:'Pinned',engine:'handlebars',locale_code:'en',variant_code:'default'};
 const valid=database([row]),tampered=database([{...row,content_html:'<p>Changed</p>'}]);const query={tenantId:context.tenantId,entityType:'entity_case',operationCode:'submitted_review_pack',variant:'default',locale:'en',effectiveOn:'2026-09-14',exact:{bindingId:'binding',templateId:'template',id:'version',version:1,hash,locale:'en',variant:'default'}};
 try{const repository=createKyselyDocumentTemplateRepository();await expect(repository.resolveExact!(query,valid.transaction)).resolves.toMatchObject({checksum:hash,html:content.content_html});await expect(repository.resolveExact!(query,tampered.transaction)).resolves.toBeNull();}finally{await valid.db.destroy();await tampered.db.destroy();}
});
