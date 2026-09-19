import { AtlasServiceError } from "./errors.js";
import { assertAtlasContext, hasPermission } from "./context.js";
import { createHash, randomUUID } from "node:crypto";
import type {
  AtlasKnowledgeChunkInput,
  AtlasKnowledgeCitation,
  AtlasKnowledgeAdmission,
  AtlasKnowledgeIndex,
  AtlasKnowledgeRepository,
  AtlasKnowledgeSource,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { JobHandler } from "@athyper/server-contract-jobs";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Transaction } from "kysely";

import { AtlasBoundedCache } from "./bounded-cache.js";

type Db = Record<string, never>;
type Tx = Transaction<Db>;
type Row = Record<string, unknown>;
export interface AtlasKnowledgeIngestionJob {
  readonly context: VerifiedRequestContext;
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly text: string;
}
export const ATLAS_KNOWLEDGE_QUEUE = "atlas.knowledge",
  INGEST_ATLAS_KNOWLEDGE_JOB = "atlas.knowledge.ingest";
export interface AtlasKnowledgeIngestionPayload {
  readonly tenantId: string;
  readonly sourceId: string;
  readonly sourceVersionId: string;
  readonly contentReference: string;
}
export interface AtlasKnowledgeJobAuthority {
  load(input: AtlasKnowledgeIngestionPayload): Promise<{
    readonly context: VerifiedRequestContext;
    readonly text: string;
  }>;
}
export function createAtlasKnowledgeIngestionHandler(
  service: AtlasKnowledgeService,
  authority: AtlasKnowledgeJobAuthority,
): JobHandler<
  typeof INGEST_ATLAS_KNOWLEDGE_JOB,
  AtlasKnowledgeIngestionPayload
> {
  return {
    async handle(job) {
      const loaded = await authority.load(job.data);
      if (loaded.context.tenantId !== job.data.tenantId)
        throw Object.assign(new Error("Knowledge job tenant mismatch."), {
          retryable: false,
        });
      const result = await service.ingest({
        context: loaded.context,
        sourceId: job.data.sourceId,
        sourceVersionId: job.data.sourceVersionId,
        text: loaded.text,
      });
      return {
        status: "completed",
        output: {
          revisionId: result.revisionId,
          chunkCount: result.chunkCount,
          replayed: result.replayed,
        },
      };
    },
  };
}

export class AtlasKnowledgeService {
  private readonly candidates = new AtlasBoundedCache<
    Awaited<ReturnType<AtlasKnowledgeIndex["search"]>>
  >({ maxEntries: 128, maxBytes: 512 * 1024, ttlMs: 5_000 });
  cacheStats() {
    return this.candidates.stats();
  }
  constructor(
    private readonly options: {
      repository: AtlasKnowledgeRepository;
      index: AtlasKnowledgeIndex;
      admission?: AtlasKnowledgeAdmission;
      now?: () => Date;
      createId?: () => string;
      chunkCharacters?: number;
    },
  ) {}
  registerSource(input: {
    context: VerifiedRequestContext;
    sourceKind: string;
    sourceId: string;
    entityCode?: string;
    permissionCode: string;
  }): Promise<AtlasKnowledgeSource> {
    return this.options.repository.registerSource({
      ...input,
      id: this.id(),
      at: this.now(),
    });
  }
  async ingest(
    job: AtlasKnowledgeIngestionJob,
  ): Promise<{ revisionId: string; replayed: boolean; chunkCount: number }> {
    const text = boundedText(job.text);
    const chunks = chunk(text, this.options.chunkCharacters ?? 2_000);
    const revisionId = this.id();
    const begun = await this.options.repository.beginRevision({
      context: job.context,
      sourceId: job.sourceId,
      revisionId,
      sourceVersionId: required(job.sourceVersionId, 256),
      contentHash: sha(text),
      chunks: chunks.map(({ text: _text, ...item }) => item),
      at: this.now(),
    });
    if (begun.replayed)
      return {
        revisionId: begun.revisionId,
        replayed: true,
        chunkCount: chunks.length,
      };
    try {
      const indexed = await this.options.index.index({
        tenantId: job.context.tenantId,
        source: begun.source,
        revisionId: begun.revisionId,
        sourceVersionId: job.sourceVersionId,
        chunks,
      });
      await this.options.repository.markReady({
        context: job.context,
        sourceId: job.sourceId,
        revisionId: begun.revisionId,
        indexed,
        at: this.now(),
      });
      this.candidates.clear();
      return {
        revisionId: begun.revisionId,
        replayed: false,
        chunkCount: chunks.length,
      };
    } catch (error) {
      await this.options.repository.markFailed({
        context: job.context,
        revisionId: begun.revisionId,
        at: this.now(),
      });
      throw error;
    }
  }
  async retract(input: {
    context: VerifiedRequestContext;
    sourceId: string;
    sourceKind?: string;
    delete?: boolean;
  }): Promise<void> {
    this.candidates.clear();
    const revisions = await this.options.repository.retract({
      context: input.context,
      sourceId: input.sourceId,
      ...(input.sourceKind === undefined
        ? {}
        : { sourceKind: input.sourceKind }),
      delete: input.delete === true,
      at: this.now(),
    });
    await this.options.index.remove({
      tenantId: input.context.tenantId,
      revisionIds: revisions,
    });
  }
  async search(input: {
    context: VerifiedRequestContext;
    query: string;
    limit?: number;
  }) {
    const limit = input.limit ?? 8;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      throw new Error("Knowledge search limit is invalid.");
    assertAtlasContext(input.context);
    // No owner adapter means no retrieval. Permissions on a stale index are insufficient.
    if (!this.options.admission || !this.options.repository.admitCandidates)
      return [];
    const query = required(input.query, 4_096);
    const key = sha(
      JSON.stringify([
        input.context.tenantId,
        input.context.principalId,
        input.context.planeKey,
        input.context.profileHash,
        input.context.authEpoch,
        query,
        limit,
      ]),
    );
    let candidates = this.candidates.get(key);
    if (!candidates) {
      candidates = (
        await this.options.index.search({
          tenantId: input.context.tenantId,
          query,
          limit,
        })
      )
        .slice(0, limit)
        .filter(
          (item) => Number.isFinite(item.score) && validCitation(item.citation),
        )
        .map((item) => ({
          citation: {
            sourceId: item.citation.sourceId,
            sourceVersionId: item.citation.sourceVersionId,
            revisionId: item.citation.revisionId,
            chunkId: item.citation.chunkId,
            contentHash: item.citation.contentHash,
            characterStart: item.citation.characterStart,
            characterEnd: item.citation.characterEnd,
          },
          score: item.score,
          permissionCode: "",
        }));
      this.candidates.set(key, candidates);
    }
    // Both checks run on cache hits, including revocation with an unchanged auth epoch.
    const admitted = await this.options.repository.admitCandidates({
      context: input.context,
      citations: candidates.map((item) => item.citation),
    });
    const results: { citation: AtlasKnowledgeCitation; score: number }[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
      const match = admitted.find((item) =>
        sameCitation(item.citation, candidate.citation),
      );
      if (
        !match ||
        match.source.tenantId !== input.context.tenantId ||
        match.source.status !== "active" ||
        !hasPermission(input.context, match.source.permissionCode) ||
        seen.has(candidate.citation.chunkId)
      )
        continue;
      let allowed = false;
      try {
        allowed = await this.options.admission.authorize({
          context: input.context,
          ...match,
        });
      } catch {
        /* fail closed */
      }
      if (!allowed) continue;
      seen.add(candidate.citation.chunkId);
      results.push({ citation: match.citation, score: candidate.score });
    }
    return results;
  }

  private now(): string {
    return (this.options.now ?? (() => new Date()))().toISOString();
  }
  private id(): string {
    return (this.options.createId ?? randomUUID)();
  }
}

export class KyselyAtlasKnowledgeRepository implements AtlasKnowledgeRepository {
  constructor(private readonly transactions: PlaneTransactionCoordinator<Tx>) {}
  registerSource(input: {
    context: VerifiedRequestContext;
    sourceId: string;
    sourceKind: string;
    entityCode?: string;
    permissionCode: string;
    id: string;
    at: string;
  }): Promise<AtlasKnowledgeSource> {
    return this.tx(input.context, async (tx) => {
      const row =
        await sql<Row>`INSERT INTO ai.atlas_knowledge_source (id,tenant_id,source_kind,source_id,entity_code,permission_code,status,created_at,created_by) VALUES (${input.id}::uuid,${input.context.tenantId}::uuid,${required(input.sourceKind, 64)},${required(input.sourceId, 256)},${input.entityCode ?? null},${required(input.permissionCode, 128)},'active',${input.at}::timestamptz,${input.context.principalId}::uuid) ON CONFLICT (tenant_id,source_kind,source_id) DO UPDATE SET status='active',permission_code=EXCLUDED.permission_code,entity_code=EXCLUDED.entity_code,updated_at=${input.at}::timestamptz,updated_by=${input.context.principalId}::uuid RETURNING *`.execute(
          tx,
        );
      return source(row.rows[0]!);
    });
  }
  beginRevision(input: {
    context: VerifiedRequestContext;
    sourceId: string;
    revisionId: string;
    sourceVersionId: string;
    contentHash: string;
    chunks: readonly Omit<AtlasKnowledgeChunkInput, "text">[];
    at: string;
  }): Promise<{
    revisionId: string;
    replayed: boolean;
    source: AtlasKnowledgeSource;
  }> {
    return this.tx(input.context, async (tx) => {
      const sourceRow =
        await sql<Row>`SELECT * FROM ai.atlas_knowledge_source WHERE tenant_id=${input.context.tenantId}::uuid AND source_id=${input.sourceId} AND status='active' LIMIT 2 FOR UPDATE`.execute(
          tx,
        );
      if (sourceRow.rows.length !== 1)
        throw new Error("Active Atlas knowledge source not found.");
      const sourceValue = source(sourceRow.rows[0]!);
      const inserted = await sql<{
        id: string;
      }>`INSERT INTO ai.atlas_knowledge_revision (id,tenant_id,source_id,source_version_id,checksum,status,created_at) VALUES (${input.revisionId}::uuid,${input.context.tenantId}::uuid,${sourceValue.id}::uuid,${input.sourceVersionId},${hash(input.contentHash)},'pending',${input.at}::timestamptz) ON CONFLICT (tenant_id,source_id,source_version_id) DO NOTHING RETURNING id`.execute(
        tx,
      );
      if (!inserted.rows[0]) {
        const existing =
          await sql<Row>`SELECT id,checksum,status FROM ai.atlas_knowledge_revision WHERE tenant_id=${input.context.tenantId}::uuid AND source_id=${sourceValue.id}::uuid AND source_version_id=${input.sourceVersionId}`.execute(
            tx,
          );
        if (
          !existing.rows[0] ||
          existing.rows[0]["checksum"] !== input.contentHash
        )
          throw new Error(
            "Knowledge source version was reused with different content.",
          );
        const existingId = String(existing.rows[0]["id"]);
        const status = existing.rows[0]["status"];
        if (status === "failed") {
          await sql`UPDATE ai.atlas_knowledge_revision SET status='indexing' WHERE tenant_id=${input.context.tenantId}::uuid AND id=${existingId}::uuid AND status='failed'`.execute(
            tx,
          );
          await sql`UPDATE ai.atlas_knowledge_chunk SET index_status='pending',index_reference=NULL WHERE tenant_id=${input.context.tenantId}::uuid AND revision_id=${existingId}::uuid`.execute(
            tx,
          );
          return {
            revisionId: existingId,
            replayed: false,
            source: sourceValue,
          };
        }
        if (status !== "ready")
          throw new AtlasServiceError(
            "VERSION_CONFLICT",
            "Knowledge revision is not ready for replay.",
          );
        return { revisionId: existingId, replayed: true, source: sourceValue };
      }
      for (const item of input.chunks)
        await sql`INSERT INTO ai.atlas_knowledge_chunk (tenant_id,revision_id,ordinal,character_start,character_end,checksum,index_status,created_at) VALUES (${input.context.tenantId}::uuid,${input.revisionId}::uuid,${item.ordinal},${item.characterStart},${item.characterEnd},${hash(item.contentHash)},'pending',${input.at}::timestamptz)`.execute(
          tx,
        );
      await sql`UPDATE ai.atlas_knowledge_revision SET status='indexing' WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.revisionId}::uuid AND status='pending'`.execute(
        tx,
      );
      return {
        revisionId: input.revisionId,
        replayed: false,
        source: sourceValue,
      };
    });
  }
  markReady(input: {
    context: VerifiedRequestContext;
    sourceId: string;
    revisionId: string;
    indexed: readonly {
      ordinal: number;
      indexReference: string;
      embeddingModel: string;
    }[];
    at: string;
  }): Promise<void> {
    return this.tx(input.context, async (tx) => {
      // Serialize readiness with retraction; an in-flight index write cannot revive a removed source.
      const active =
        await sql<Row>`SELECT s.id FROM ai.atlas_knowledge_source s JOIN ai.atlas_knowledge_revision r ON r.source_id=s.id AND r.tenant_id=s.tenant_id WHERE s.tenant_id=${input.context.tenantId}::uuid AND s.source_id=${input.sourceId} AND s.status='active' AND r.id=${input.revisionId}::uuid AND r.status='indexing' FOR UPDATE OF s,r`.execute(
          tx,
        );
      if (active.rows.length !== 1)
        throw new AtlasServiceError(
          "VERSION_CONFLICT",
          "Knowledge revision is no longer eligible.",
        );
      for (const item of input.indexed)
        await sql`UPDATE ai.atlas_knowledge_chunk SET index_status='ready',index_reference=${required(item.indexReference, 512)},embedding_model=${required(item.embeddingModel, 128)} WHERE tenant_id=${input.context.tenantId}::uuid AND revision_id=${input.revisionId}::uuid AND ordinal=${item.ordinal} AND index_status IN ('pending','indexing')`.execute(
          tx,
        );
      const pending = await sql<{
        count: string | number;
      }>`SELECT count(*) AS count FROM ai.atlas_knowledge_chunk WHERE tenant_id=${input.context.tenantId}::uuid AND revision_id=${input.revisionId}::uuid AND index_status<>'ready'`.execute(
        tx,
      );
      if (Number(pending.rows[0]?.count ?? 1) !== 0)
        throw new Error(
          "Knowledge vector index did not acknowledge every chunk.",
        );
      await sql`UPDATE ai.atlas_knowledge_revision SET status='superseded',superseded_at=${input.at}::timestamptz WHERE tenant_id=${input.context.tenantId}::uuid AND source_id=(SELECT source_id FROM ai.atlas_knowledge_revision WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.revisionId}::uuid) AND id<>${input.revisionId}::uuid AND status='ready'`.execute(
        tx,
      );
      await sql`UPDATE ai.atlas_knowledge_revision SET status='ready',indexed_at=${input.at}::timestamptz WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.revisionId}::uuid AND status='indexing'`.execute(
        tx,
      );
    });
  }
  markFailed(input: {
    context: VerifiedRequestContext;
    revisionId: string;
    at: string;
  }): Promise<void> {
    return this.tx(input.context, async (tx) => {
      await sql`UPDATE ai.atlas_knowledge_chunk SET index_status='failed' WHERE tenant_id=${input.context.tenantId}::uuid AND revision_id=${input.revisionId}::uuid AND index_status IN ('pending','indexing')`.execute(
        tx,
      );
      await sql`UPDATE ai.atlas_knowledge_revision SET status='failed' WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.revisionId}::uuid AND status IN ('pending','indexing')`.execute(
        tx,
      );
    });
  }
  retract(input: {
    context: VerifiedRequestContext;
    sourceId: string;
    sourceKind?: string;
    delete: boolean;
    at: string;
  }): Promise<readonly string[]> {
    return this.tx(input.context, async (tx) => {
      const sources = await sql<{
        id: string;
      }>`SELECT id FROM ai.atlas_knowledge_source WHERE tenant_id=${input.context.tenantId}::uuid AND source_id=${input.sourceId} AND (${input.sourceKind ?? null}::text IS NULL OR source_kind=${input.sourceKind ?? null}) FOR UPDATE`.execute(
        tx,
      );
      if (sources.rows.length > 1)
        throw new AtlasServiceError(
          "VERSION_CONFLICT",
          "Knowledge sourceId is ambiguous; provide sourceKind.",
        );
      const sourceId = sources.rows[0]?.id;
      if (!sourceId) return [];
      const ids = await sql<{
        id: string;
      }>`SELECT r.id FROM ai.atlas_knowledge_revision r WHERE r.tenant_id=${input.context.tenantId}::uuid AND r.source_id=${sourceId}::uuid`.execute(
        tx,
      );
      const status = input.delete ? "deleted" : "disabled";
      await sql`UPDATE ai.atlas_knowledge_source SET status=${status},updated_at=${input.at}::timestamptz,updated_by=${input.context.principalId}::uuid WHERE tenant_id=${input.context.tenantId}::uuid AND id=${sourceId}::uuid`.execute(
        tx,
      );
      await sql`UPDATE ai.atlas_knowledge_revision SET status='deleted' WHERE tenant_id=${input.context.tenantId}::uuid AND id=ANY(${sql`ARRAY[${sql.join(ids.rows.map((row) => sql`${row.id}::uuid`))}]::uuid[]`})`.execute(
        tx,
      );
      await sql`UPDATE ai.atlas_knowledge_chunk SET index_status='deleted',index_reference=NULL WHERE tenant_id=${input.context.tenantId}::uuid AND revision_id=ANY(${sql`ARRAY[${sql.join(ids.rows.map((row) => sql`${row.id}::uuid`))}]::uuid[]`})`.execute(
        tx,
      );
      return ids.rows.map((row) => row.id);
    });
  }
  async admitCandidates(input: {
    context: VerifiedRequestContext;
    citations: readonly AtlasKnowledgeCitation[];
  }) {
    if (input.citations.length > 50)
      throw new TypeError("Knowledge admission exceeds work bound.");
    const citations = input.citations.filter(validCitation);
    if (!citations.length) return [];
    return this.tx(input.context, async (tx) => {
      const rows =
        await sql<Row>`SELECT s.*, r.id AS revision_id, r.source_version_id,
        c.id AS chunk_id, c.checksum AS content_hash, c.character_start, c.character_end
        FROM ai.atlas_knowledge_source s
        JOIN ai.atlas_knowledge_revision r ON r.tenant_id=s.tenant_id AND r.source_id=s.id
        JOIN ai.atlas_knowledge_chunk c ON c.tenant_id=r.tenant_id AND c.revision_id=r.id
        WHERE s.tenant_id=${input.context.tenantId}::uuid AND s.status='active'
          AND r.status='ready' AND c.index_status='ready'
          AND c.id=ANY(ARRAY[${sql.join(citations.map((c) => sql`${c.chunkId}::uuid`))}]::uuid[])`.execute(
          tx,
        );
      return rows.rows.flatMap((row) => {
        const citation: AtlasKnowledgeCitation = {
          sourceId: String(row["source_id"]),
          sourceVersionId: String(row["source_version_id"]),
          revisionId: String(row["revision_id"]),
          chunkId: String(row["chunk_id"]),
          contentHash: String(row["content_hash"]),
          characterStart: Number(row["character_start"]),
          characterEnd: Number(row["character_end"]),
        };
        return citations.some((c) => sameCitation(c, citation))
          ? [{ citation, source: source(row) }]
          : [];
      });
    });
  }
  async health(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
  private tx<T>(
    context: VerifiedRequestContext,
    work: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    return this.transactions.run(
      context.planeKey,
      { tenantId: context.tenantId, principalId: context.principalId },
      work,
    );
  }
}
function source(row: Row): AtlasKnowledgeSource {
  return {
    id: String(row["id"]),
    tenantId: String(row["tenant_id"]),
    sourceKind: String(row["source_kind"]),
    sourceId: String(row["source_id"]),
    ...(row["entity_code"] ? { entityCode: String(row["entity_code"]) } : {}),
    permissionCode: String(row["permission_code"]),
    status: String(row["status"]) as AtlasKnowledgeSource["status"],
    createdAt: new Date(String(row["created_at"])).toISOString(),
  };
}
function chunk(text: string, size: number): AtlasKnowledgeChunkInput[] {
  if (!Number.isSafeInteger(size) || size < 256 || size > 16_000)
    throw new Error("Knowledge chunk size is invalid.");
  const result: AtlasKnowledgeChunkInput[] = [];
  for (
    let start = 0, ordinal = 0;
    start < text.length;
    start += size, ordinal++
  ) {
    const value = text.slice(start, start + size);
    result.push({
      ordinal,
      characterStart: start,
      characterEnd: start + value.length,
      contentHash: sha(value),
      text: value,
    });
  }
  return result;
}
function sha(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function hash(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value))
    throw new Error("Lowercase SHA-256 hash required.");
  return value;
}
function required(value: string, max: number): string {
  const result = value.trim();
  if (!result || Buffer.byteLength(result, "utf8") > max)
    throw new Error("Knowledge identifier is invalid.");
  return result;
}
function boundedText(value: string): string {
  if (!value.trim() || Buffer.byteLength(value, "utf8") > 10_000_000)
    throw new Error("Knowledge content is empty or too large.");
  return value;
}

function validCitation(c: AtlasKnowledgeCitation): boolean {
  return (
    !!c &&
    typeof c.sourceId === "string" &&
    c.sourceId.length > 0 &&
    c.sourceId.length <= 256 &&
    typeof c.sourceVersionId === "string" &&
    c.sourceVersionId.length > 0 &&
    c.sourceVersionId.length <= 256 &&
    [c.revisionId, c.chunkId].every(
      (v) =>
        typeof v === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          v,
        ),
    ) &&
    /^[0-9a-f]{64}$/.test(c.contentHash) &&
    Number.isSafeInteger(c.characterStart) &&
    c.characterStart >= 0 &&
    Number.isSafeInteger(c.characterEnd) &&
    c.characterEnd > c.characterStart &&
    c.characterEnd - c.characterStart <= 16_000
  );
}
function sameCitation(
  a: AtlasKnowledgeCitation,
  b: AtlasKnowledgeCitation,
): boolean {
  return (
    a.sourceId === b.sourceId &&
    a.sourceVersionId === b.sourceVersionId &&
    a.revisionId === b.revisionId &&
    a.chunkId === b.chunkId &&
    a.contentHash === b.contentHash &&
    a.characterStart === b.characterStart &&
    a.characterEnd === b.characterEnd
  );
}
