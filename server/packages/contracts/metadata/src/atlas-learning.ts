import { normalizeEntityAiPhrase } from "./entity-ai.js";
export interface AtlasLearningProposal {
  readonly schemaVersion: 1;
  readonly candidateId: string;
  readonly feedbackId: string;
  readonly locale: "en";
  readonly phrase: string;
  readonly capabilityId: string;
}
/** Minimized, server-derived handoff. Never includes a question, response or business value. */
export interface AtlasLearningHandoff extends AtlasLearningProposal {
  readonly tenantId: string;
  readonly originPlane: "neon" | "mesh" | "studio";
  readonly submittedBy: string;
  readonly entityCode: string;
  readonly sourceDescriptorHash: string;
  readonly sourceContractHash: string;
  readonly sourceReleaseId: string;
  readonly proposalHash: string;
  readonly expiresAt: string;
}
/** Only the authenticated origin service may call this port; no public import endpoint. */
export interface AtlasLearningInboxPort {
  receive(proposal: AtlasLearningHandoff): Promise<void>;
}
export function parseAtlasLearningProposal(value: unknown): AtlasLearningProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid learning proposal");
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(key => !["schemaVersion", "candidateId", "feedbackId", "locale", "phrase", "capabilityId"].includes(key)) || v.schemaVersion !== 1 || v.locale !== "en") throw new TypeError("Invalid learning proposal version or locale");
  for (const key of ["candidateId", "feedbackId"]) if (typeof v[key] !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v[key])) throw new TypeError("Invalid learning coordinate");
  if (typeof v.capabilityId !== "string" || !/^[a-z][a-z0-9_]{1,127}$/.test(v.capabilityId)) throw new TypeError("Invalid capability");
  return Object.freeze({schemaVersion: 1, candidateId: v.candidateId as string, feedbackId: v.feedbackId as string, locale: "en", phrase: normalizeEntityAiPhrase(v.phrase), capabilityId: v.capabilityId});
}
