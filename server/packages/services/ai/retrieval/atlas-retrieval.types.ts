import type { VerifiedRequestContext } from "@athyper/svc-iam";

/** Immutable, tenant-owned knowledge source identity. Source content is never
 * taken from a vector index as authority. */
export interface AtlasKnowledgeSource {
  readonly sourceId: string;
  readonly tenantId: string;
  readonly permissionCode: string;
  readonly entityCode?: string;
  readonly status: "active" | "disabled" | "deleted";
}

export interface AtlasKnowledgeRevision {
  readonly sourceId: string;
  readonly revisionId: string;
  readonly checksum: string;
  readonly status: "ready" | "superseded" | "deleted";
}

/** Index candidates contain no displayable content. The authoritative content
 * is reloaded through AtlasDataGateway after candidate selection. */
export interface AtlasRetrievalCandidate {
  readonly chunkId: string;
  readonly sourceId: string;
  readonly revisionId: string;
  readonly score: number;
}

export interface AtlasCitation {
  readonly citationId: string;
  readonly sourceId: string;
  readonly revisionId: string;
  readonly chunkId: string;
  readonly checksum: string;
  readonly title: string;
  readonly excerpt: string;
}

export interface AtlasRetrievedPassage {
  readonly text: string;
  readonly citation: AtlasCitation;
}

export interface AtlasRetrievalIndex {
  search(input: {
    readonly tenantId: string;
    readonly query: string;
    readonly limit: number;
    readonly signal?: AbortSignal;
  }): Promise<readonly AtlasRetrievalCandidate[]>;
}

export interface AtlasKnowledgeCatalog {
  getSource(
    context: VerifiedRequestContext,
    sourceId: string,
  ): Promise<AtlasKnowledgeSource | null>;
  getRevision(
    context: VerifiedRequestContext,
    sourceId: string,
    revisionId: string,
  ): Promise<AtlasKnowledgeRevision | null>;
}

/** Converts a freshly authorized canonical source value into a specific,
 * bounded chunk. It must reject chunks not belonging to the requested revision. */
export interface AtlasKnowledgeChunkMaterializer {
  materialize(input: {
    readonly candidate: AtlasRetrievalCandidate;
    readonly source: AtlasKnowledgeSource;
    readonly revision: AtlasKnowledgeRevision;
    readonly value: unknown;
  }): Promise<{ readonly title: string; readonly excerpt: string; readonly text: string } | null>;
}

export interface AtlasRetrievalRequest {
  readonly query: string;
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export type AtlasRetrievalMetric =
  | "candidate_seen"
  | "candidate_omitted"
  | "passage_emitted"
  | "authorization_denied"
  | "stale_revision";
