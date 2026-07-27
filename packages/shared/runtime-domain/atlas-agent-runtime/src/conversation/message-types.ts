export type AtlasMessageRole = "user" | "assistant";
export type AtlasMessageStatus = "complete" | "streaming" | "failed";

export interface AtlasMessage {
  id: string;
  role: AtlasMessageRole;
  content: string;
  status: AtlasMessageStatus;
  createdAt: string;
  runId?: string;
  citations?: readonly AtlasCitation[];
  resultCards?: readonly AtlasResultCard[];
}

export interface AtlasCitation {
  citationId: string;
  sourceId: string;
  revisionId: string;
  chunkId: string;
  checksum: string;
  title: string;
  excerpt: string;
}

export interface AtlasToolCall {
  id: string;
  capabilityId: string;
  label: string;
  status: "running" | "completed" | "failed";
}

export interface AtlasTextResultCard {
  kind: "text";
  title?: string;
  body: string;
}

export interface AtlasEvidencePointer {
  sourceId: string;
  revisionId: string;
  checksum?: string;
}

export interface AtlasRecordSummaryCard {
  kind: "record_summary";
  version: 1;
  entityType: string;
  entityId: string;
  title: string;
  fields: readonly {
    label: string;
    displayValue: string;
  }[];
  evidence: readonly AtlasEvidencePointer[];
}

export interface AtlasUnknownResultCard {
  kind: string;
  version?: number;
  readonly [key: string]: unknown;
}

export type AtlasResultCard =
  | AtlasTextResultCard
  | AtlasRecordSummaryCard
  | AtlasUnknownResultCard;
