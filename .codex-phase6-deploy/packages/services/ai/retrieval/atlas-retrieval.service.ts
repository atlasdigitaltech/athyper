import type { VerifiedRequestContext } from "@athyper/svc-iam";
import { AtlasDataGateway, AtlasDataGatewayError } from "../atlas-data-gateway.js";
import type {
  AtlasCitation,
  AtlasKnowledgeCatalog,
  AtlasKnowledgeChunkMaterializer,
  AtlasRetrievedPassage,
  AtlasRetrievalIndex,
  AtlasRetrievalRequest,
  AtlasRetrievalMetric,
} from "./atlas-retrieval.types.js";

const MAX_QUERY_CHARS = 4_000;
const MAX_RESULTS = 12;
const MAX_EXCERPT_CHARS = 1_200;

/**
 * Retrieval is intentionally a two-step operation: approximate index search
 * finds identifiers only, then each selected source is re-authorized and
 * reloaded from its canonical service. A stale, disabled, deleted, masked, or
 * unauthorized candidate is omitted rather than surfaced to the model or UI.
 */
export class AtlasRetrievalService {
  constructor(
    private readonly deps: {
      index: AtlasRetrievalIndex;
      catalog: AtlasKnowledgeCatalog;
      dataGateway: AtlasDataGateway;
      materializer: AtlasKnowledgeChunkMaterializer;
      observe?: (metric: AtlasRetrievalMetric) => void;
    },
  ) {}

  async retrieve(
    context: VerifiedRequestContext,
    request: AtlasRetrievalRequest,
  ): Promise<readonly AtlasRetrievedPassage[]> {
    const query = requiredQuery(request.query);
    const limit = boundedLimit(request.limit);
    const candidates = await this.deps.index.search({
      tenantId: context.tenantId,
      query,
      limit,
      signal: request.signal,
    });
    const passages: AtlasRetrievedPassage[] = [];
    for (const candidate of candidates.slice(0, limit)) {
      this.deps.observe?.("candidate_seen");
      if (!validCandidate(candidate) || passages.length >= limit) continue;
      const source = await this.deps.catalog.getSource(context, candidate.sourceId);
      if (!source || source.tenantId !== context.tenantId || source.status !== "active") {
        this.deps.observe?.("candidate_omitted");
        continue;
      }
      const revision = await this.deps.catalog.getRevision(
        context, candidate.sourceId, candidate.revisionId,
      );
      if (!revision || revision.status !== "ready" || !safeText(revision.checksum, 256)) {
        this.deps.observe?.("candidate_omitted");
        continue;
      }
      try {
        const canonical = await this.deps.dataGateway.read(context, {
          permissionCode: source.permissionCode,
          entityCode: source.entityCode,
          sourceKind: "content",
          sourceId: source.sourceId,
        });
        if (canonical.source.sourceVersionId !== revision.revisionId) {
          this.deps.observe?.("stale_revision");
          continue;
        }
        const materialized = await this.deps.materializer.materialize({
          candidate, source, revision, value: canonical.value,
        });
        if (!materialized || !safeText(materialized.text, 20_000)) continue;
        const citation = citationFor(candidate, revision, materialized.title, materialized.excerpt);
        passages.push(Object.freeze({ text: materialized.text, citation }));
        this.deps.observe?.("passage_emitted");
      } catch (error) {
        // Data-gateway denial is expected for an index candidate whose current
        // authorization or revision no longer matches. Never leak its identity.
        if (!(error instanceof AtlasDataGatewayError)) throw error;
        this.deps.observe?.("authorization_denied");
      }
    }
    return Object.freeze(passages);
  }
}

function citationFor(
  candidate: { sourceId: string; revisionId: string; chunkId: string },
  revision: { checksum: string },
  title: string,
  excerpt: string,
): AtlasCitation {
  if (!safeText(title, 300) || !safeText(excerpt, MAX_EXCERPT_CHARS)) {
    throw new Error("Atlas retrieval materializer returned an invalid citation.");
  }
  return Object.freeze({
    citationId: `rag:${candidate.sourceId}:${candidate.revisionId}:${candidate.chunkId}`,
    sourceId: candidate.sourceId,
    revisionId: candidate.revisionId,
    chunkId: candidate.chunkId,
    checksum: revision.checksum,
    title,
    excerpt,
  });
}

function requiredQuery(value: string): string {
  const query = typeof value === "string" ? value.trim() : "";
  if (!safeText(query, MAX_QUERY_CHARS)) throw new Error("Atlas retrieval query is invalid.");
  return query;
}

function boundedLimit(value: number | undefined): number {
  const limit = value ?? 6;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESULTS) {
    throw new Error("Atlas retrieval limit is invalid.");
  }
  return limit;
}

function validCandidate(value: { chunkId: string; sourceId: string; revisionId: string; score: number }): boolean {
  return safeText(value.chunkId, 200)
    && safeText(value.sourceId, 200)
    && safeText(value.revisionId, 300)
    && Number.isFinite(value.score);
}

function safeText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
