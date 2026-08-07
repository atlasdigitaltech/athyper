import { z } from "zod";

const AtlasTextResultCardSchema = z.object({
  kind: z.literal("text"),
  title: z.string().max(200).optional(),
  body: z.string().max(50_000),
}).strict();

export const AtlasEvidencePointerSchema = z.object({
  sourceId: z.string().min(1).max(200),
  revisionId: z.string().min(1).max(128),
  checksum: z.string().min(8).max(256).optional(),
}).strict();

export const AtlasRecordSummaryCardSchema = z.object({
  kind: z.literal("record_summary"),
  version: z.literal(1),
  entityType: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  entityId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/),
  title: z.string().min(1).max(200),
  fields: z.array(z.object({
    label: z.string().min(1).max(100),
    displayValue: z.string().max(500),
  }).strict()).max(12),
  evidence: z.array(AtlasEvidencePointerSchema).min(1).max(8),
}).strict();

const AtlasKnownResultCardSchema = z.discriminatedUnion("kind", [
  AtlasTextResultCardSchema,
  AtlasRecordSummaryCardSchema,
]);

const AtlasUnknownResultCardSchema = z.object({
  kind: z.string().min(1).max(100),
  version: z.number().int().positive().max(1_000).optional(),
}).passthrough();

export const AtlasResultCardSchema = z.union([
  AtlasKnownResultCardSchema,
  AtlasUnknownResultCardSchema,
]);

const UsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
}).strict();

/** Citation payload is immutable evidence metadata, never a provider URL or
 * a client-supplied display snippet. The server emits it only after retrieval
 * authorization and revision validation. */
export const AtlasCitationSchema = z.object({
  citation_id: z.string().min(1).max(700),
  source_id: z.string().min(1).max(200),
  revision_id: z.string().min(1).max(300),
  chunk_id: z.string().min(1).max(200),
  checksum: z.string().min(8).max(256),
  title: z.string().min(1).max(300),
  excerpt: z.string().min(1).max(1_200),
}).strict();

export const AgentStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("run.started"),
    provider: z.string().min(1),
    model: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("message.delta"),
    delta: z.string(),
  }).strict(),
  z.object({
    type: z.literal("citation.added"),
    citation: AtlasCitationSchema,
  }).strict(),
  z.object({
    type: z.literal("tool.started"),
    tool_call_id: z.string().min(1),
    capability_id: z.string().min(1),
    label: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("tool.completed"),
    tool_call_id: z.string().min(1),
    capability_id: z.string().min(1),
    success: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal("result.card"),
    card: AtlasResultCardSchema,
  }).strict(),
  z.object({
    type: z.literal("run.failed"),
    code: z.string().min(1),
    message: z.string().min(1),
    retryable: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal("run.completed"),
    finish_reason: z.string().min(1),
    model_used: z.string().min(1),
    usage: UsageSchema,
  }).strict(),
  z.object({
    type: z.literal("heartbeat"),
    timestamp: z.string().datetime(),
  }).strict(),
]);

export type AgentStreamEvent = z.infer<typeof AgentStreamEventSchema>;
export type AgentUsage = Extract<AgentStreamEvent, { type: "run.completed" }>["usage"];
export type AtlasCitation = z.infer<typeof AtlasCitationSchema>;
export type AtlasWireResultCard = z.infer<typeof AtlasResultCardSchema>;
