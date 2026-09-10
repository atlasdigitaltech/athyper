import type { AtlasBusinessContextV1 } from "./business-context.js";
import type { AtlasDataClass } from "./model.js";

/** Internal durable evidence, never a model/browser content block. */
export interface AtlasReadReplayEvidence {
  readonly toolCode: string;
  readonly toolVersion: string;
  readonly arguments: Readonly<Record<string, unknown>>;
  readonly policyRevision: string;
  readonly resultHash: string;
}
export interface AtlasReplayInput {
  readonly intent?: import("./intent.js").AtlasIntentV1;
  readonly schemaVersion: 1;
  readonly attachments?: {
    readonly attachmentContextId: string;
    readonly attachmentIds: readonly string[];
    readonly attachmentChunkIds?: readonly string[];
    readonly dataClass: AtlasDataClass;
    readonly resultHash: string;
  };
  readonly businessContext?: AtlasBusinessContextV1;
  readonly businessContextHash?: string;
  readonly entityDescriptorHash?: string;
  readonly entityContractHash?: string;
}
export interface AtlasReplayCompletion {
  /** Only exact static guidance may complete without provider or tool usage. */
  readonly guidance?: import("./intent.js").AtlasGuidanceCode;
  readonly complete: boolean;
  readonly reads: readonly AtlasReadReplayEvidence[];
}
export interface AtlasMessageLineage {
  readonly type: "atlas_message_lineage";
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly principalId: string;
  readonly planeKey: string;
  readonly profileHash: string;
  readonly authEpoch: number;
  readonly contentHash: string;
  readonly parentMessageId: string | null;
  readonly input: AtlasReplayInput;
  readonly reads: readonly AtlasReadReplayEvidence[];
  readonly complete: boolean;
}
