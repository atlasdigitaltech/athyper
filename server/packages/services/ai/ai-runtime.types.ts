/**
 * AI Foundation — shared type contracts.
 *
 * This file contains only data shapes and interfaces; no runtime logic.
 * Every file in the AI service imports from here — nothing outside Layer 2
 * should re-export these types except through index.ts.
 */

import { z } from "zod";

// ─── Autonomy tiers ───────────────────────────────────────────────────────────

export const AUTONOMY_TIERS = ["disabled", "suggest", "assist", "auto"] as const;
export type AutonomyLevel = (typeof AUTONOMY_TIERS)[number];

export const TIER_RANK: Record<AutonomyLevel, number> = {
  disabled: 0,
  suggest:  1,
  assist:   2,
  auto:     3,
};

// Returns the lower of two autonomy levels.
export function capByCeiling(a: AutonomyLevel, b: AutonomyLevel): AutonomyLevel {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

// ─── ActionRequest ────────────────────────────────────────────────────────────

export const ActionSubjectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("attachment"), attachment_id: z.string().uuid() }),
  z.object({ kind: z.literal("text"),       text: z.string().max(50_000) }),
  z.object({ kind: z.literal("record"),     entity_type: z.string().min(1), entity_id: z.string() }),
  z.object({ kind: z.literal("composite"),  parts: z.array(z.any()).max(10) }),
]);

export const ActionRequestSchema = z.object({
  action_code:  z.string().min(1),
  doc_class:    z.string().nullable().default(null),
  subject:      ActionSubjectSchema,
  context: z.object({
    company_code_id: z.string().uuid().optional(),
    correlation_id:  z.string().uuid(),
    locale:          z.string().default("en"),
    extra:           z.record(z.string(), z.any()).default({}),
  }),
  desired_tier: z.enum(["suggest", "assist", "auto"]).optional(),
});

export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionSubject = z.infer<typeof ActionSubjectSchema>;

// ─── Evidence pointer ─────────────────────────────────────────────────────────

export const EvidencePointerSchema = z.object({
  page:  z.number().int().nullable(),
  bbox:  z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  sheet: z.string().nullable(),
  cell:  z.string().nullable(),
  span:  z.tuple([z.number(), z.number()]).nullable(),
}).nullable();

export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

// ─── ActionResponse ───────────────────────────────────────────────────────────

export const ActionResponseSchema = z.object({
  action_code:  z.string(),
  status:       z.enum(["ok", "blocked", "failed"]),
  // The decision tells callers exactly what to do with output:
  //   auto    — use output directly; human-in-the-loop optional
  //   assist  — pre-fill the form; user confirms before commit
  //   suggest — show as a non-default chip / hint
  //   denied  — discard output; show manual entry with no AI hints
  decision:     z.enum(["suggest", "assist", "auto", "denied"]),
  output:       z.any(),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    fields:  z.record(z.string(), z.number().min(0).max(1)),
  }),
  evidence:              z.record(z.string(), EvidencePointerSchema),
  pipeline_id:           z.string().uuid(),
  ai_inference_log_id:   z.string().uuid().nullable(),
  model_id:              z.string(),
  model_version:         z.string(),
  prompt_version:        z.string().nullable(),
  cost_units: z.object({
    input_tokens:  z.number().int(),
    output_tokens: z.number().int(),
    vision_pages:  z.number().int(),
    duration_ms:   z.number().int(),
  }),
  blockers: z.array(z.object({ code: z.string(), message: z.string() })),
  warnings: z.array(z.object({ code: z.string(), message: z.string() })),
});

export type ActionResponse = z.infer<typeof ActionResponseSchema>;

// ─── Policy / threshold shapes ────────────────────────────────────────────────

export interface ActionPolicy {
  autonomy_level:              AutonomyLevel;
  min_confidence_for_auto:     number | null;
  requires_human_confirmation: boolean;
  is_active:                   boolean;
}

export interface ConfidenceThreshold {
  min_for_suggest:    number;
  min_for_assist:     number;
  min_for_auto:       number;
  drift_alert_below:  number | null;
  drift_window_hours: number;
}

// ─── Capability handler ───────────────────────────────────────────────────────

export interface CostUnits {
  input_tokens:  number;
  output_tokens: number;
  vision_pages:  number;
  duration_ms:   number;
}

export interface CapabilityResult {
  output:        unknown;
  confidence:    { overall: number; fields: Record<string, number> };
  evidence:      Record<string, EvidencePointer>;
  costUnits:     CostUnits;
  modelId:       string;
  modelVersion:  string;
  promptVersion: string | null;
  warnings:      Array<{ code: string; message: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = import("kysely").Kysely<Record<string, any>>;

export interface AiLogger {
  info(msg: string,  ctx?: Record<string, unknown>): void;
  warn(msg: string,  ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

export type AiLogKind = "inference" | "feedback";

export interface AiLogMetrics {
  writeFailed(kind: AiLogKind): void;
}
