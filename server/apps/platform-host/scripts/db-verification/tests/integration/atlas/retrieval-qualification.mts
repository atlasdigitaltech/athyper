import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, type Kysely } from "kysely";
import {
  AtlasKnowledgeService,
  KyselyAtlasKnowledgeRepository,
} from "@athyper/server-platform-ai/knowledge";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
export async function qualifyRetrieval(
  db: Kysely<Record<string, never>>,
  base: VerifiedRequestContext,
  transactions: any,
) {
  const context = {
    ...base,
    permissions: { ...base.permissions, allowed: ["documents.read"] },
  };
  const repository = new KyselyAtlasKnowledgeRepository(transactions);
  // Ingestion is an administrative owner job; application retrieval remains SELECT-only.
  const writer = new KyselyAtlasKnowledgeRepository({
    async run(plane, actor, work) {
      return db.transaction().execute(async (tx) => {
        await sql`SET LOCAL ROLE athyperadmin`.execute(tx);
        await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true),set_config('app.database_plane',${plane},true)`.execute(
          tx,
        );
        return work(tx);
      });
    },
  });
  let hits: any[] = [],
    indexCalls = 0,
    admissionCalls = 0,
    allowed = true,
    failIndex = false,
    failRemove = true;
  const options = {
    repository: writer,
    admission: {
      authorize: async () => {
        admissionCalls++;
        return allowed;
      },
    },
    index: {
      async index(input) {
        if (failIndex) throw Error("index unavailable");
        const chunks =
          await sql<any>`SELECT id,ordinal,checksum,character_start,character_end FROM ai.atlas_knowledge_chunk WHERE revision_id=${input.revisionId}::uuid ORDER BY ordinal`.execute(
            db,
          );
        hits = chunks.rows.map((c) => ({
          citation: {
            sourceId: input.source.sourceId,
            sourceVersionId: input.sourceVersionId,
            revisionId: input.revisionId,
            chunkId: c.id,
            contentHash: c.checksum,
            characterStart: c.character_start,
            characterEnd: c.character_end,
          },
          score: 1,
          permissionCode: "untrusted",
        }));
        return chunks.rows.map((c) => ({
          ordinal: c.ordinal,
          indexReference: `index:${c.id}`,
          embeddingModel: "fixture",
        }));
      },
      async search() {
        indexCalls++;
        return hits;
      },
      async remove() {
        if (failRemove) throw Error("cleanup unavailable");
      },
      async health() {
        return { healthy: true };
      },
    },
  } satisfies ConstructorParameters<typeof AtlasKnowledgeService>[0];
  const service = new AtlasKnowledgeService(options);
  const reader = new AtlasKnowledgeService({ ...options, repository });
  await service.registerSource({
    context,
    sourceKind: "content",
    sourceId: "f5-doc",
    permissionCode: "documents.read",
  });
  const job = {
    context,
    sourceId: "f5-doc",
    sourceVersionId: "v1",
    text: "public fixture document",
  };
  await service.ingest(job);
  const search = () => reader.search({ context, query: "fixture" });
  assert.equal((await search()).length, 1);
  assert.equal((await search()).length, 1);
  assert.equal(indexCalls, 1);
  assert.equal(admissionCalls, 2);
  allowed = false;
  assert.equal((await search()).length, 0);
  allowed = true;
  const oldHits = hits;
  await service.ingest({
    ...job,
    sourceVersionId: "v2",
    text: "new fixture document",
  });
  assert.equal(
    (await search()).length,
    0,
    "superseded cached index hit excluded",
  );
  hits = oldHits;
  await assert.rejects(
    service.retract({ context, sourceId: "f5-doc", delete: true }),
    /cleanup unavailable/,
  );
  assert.equal(
    (await search()).length,
    0,
    "deleted source remains excluded after failed index cleanup",
  );
  failRemove = false;
  await service.retract({ context, sourceId: "f5-doc", delete: true });
  await service.registerSource({
    context,
    sourceKind: "content",
    sourceId: "f5-retry",
    permissionCode: "documents.read",
  });
  const retry = { ...job, sourceId: "f5-retry" };
  failIndex = true;
  await assert.rejects(service.ingest(retry), /index unavailable/);
  failIndex = false;
  const recovered = await service.ingest(retry);
  assert.equal(recovered.replayed, false);
  assert.equal((await service.ingest(retry)).replayed, true);
  const foreign = {
    ...context,
    tenantId: randomUUID(),
    permissions: { ...context.permissions, tenantId: "" },
  };
  foreign.permissions.tenantId = foreign.tenantId;
  assert.equal(
    (
      await repository.admitCandidates({
        context: foreign,
        citations: hits.map((h) => h.citation),
      })
    ).length,
    0,
  );
  console.log(
    `PASS ${base.planeKey}: canonical retrieval, live revocation, cache checks, supersession, deletion/cleanup retry, ingestion recovery and tenant isolation`,
  );
}
