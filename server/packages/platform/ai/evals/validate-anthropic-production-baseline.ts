import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { z } from "zod";

import { loadAtlasOpenAiEvaluationSet } from "./validate-atlas-openai-eval.js";

const BindingSchema = z.object({
  public_model_id: z.enum(["atlas-fast", "atlas-balanced", "atlas-best"]),
  binding_id: z.string().min(1),
  provider_id: z.literal("anthropic"),
  upstream_model_id: z.string().min(1),
  routing_policy_id: z.literal("no-fallback-v1"),
}).strict();

export const AnthropicProductionBaselineSchema = z.object({
  baseline_id: z.literal("atlas-anthropic-production-baseline"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  released_on: z.iso.date(),
  description: z.string().min(20),
  input_suite: z.object({
    fixture: z.literal("atlas-openai-eval-v1.json"),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    required_case_count: z.literal(200),
    source: z.literal("synthetic_only"),
    contains_customer_data: z.literal(false),
  }).strict(),
  bindings: z.array(BindingSchema).length(3),
  evaluation_status: z.literal("not_run"),
  outputs_embedded: z.literal(false),
}).strict();

const ApprovalRecordSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "expired"]),
  approved_by: z.string().min(1).nullable(),
  approved_at: z.iso.datetime({ offset: true }).nullable(),
  evidence_reference: z.string().min(1).nullable(),
}).strict().superRefine((value, context) => {
  if (
    value.status === "approved"
    && (
      value.approved_by === null
      || value.approved_at === null
      || value.evidence_reference === null
    )
  ) {
    context.addIssue({
      code: "custom",
      message: "approved records require actor, timestamp, and evidence reference",
    });
  }
});

export const AnthropicProductionApprovalSchema = z.object({
  approval_id: z.literal("atlas-anthropic-production-neon-pilot"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  provider_account_class: z.string().min(1),
  provider_region: z.string().min(1),
  retention_profile: z.string().min(1),
  data_classification: z.literal("public_internal_only"),
  approvals: z.object({
    provider_account: ApprovalRecordSchema,
    region: ApprovalRecordSchema,
    retention: ApprovalRecordSchema,
    data_classification: ApprovalRecordSchema,
    security: ApprovalRecordSchema,
    privacy: ApprovalRecordSchema,
    operations: ApprovalRecordSchema,
  }).strict(),
}).strict();

export interface ValidatedAnthropicProductionBaseline {
  baseline: z.infer<typeof AnthropicProductionBaselineSchema>;
  fixtureSha256: string;
  caseCount: number;
}

const EXPECTED_BINDINGS = [
  {
    public_model_id: "atlas-fast",
    binding_id: "atlas-fast-anthropic-v2",
    provider_id: "anthropic",
    upstream_model_id: "claude-haiku-4-5-20251001",
    routing_policy_id: "no-fallback-v1",
  },
  {
    public_model_id: "atlas-balanced",
    binding_id: "atlas-balanced-anthropic-v2",
    provider_id: "anthropic",
    upstream_model_id: "claude-sonnet-4-6",
    routing_policy_id: "no-fallback-v1",
  },
  {
    public_model_id: "atlas-best",
    binding_id: "atlas-best-anthropic-v2",
    provider_id: "anthropic",
    upstream_model_id: "claude-opus-4-8",
    routing_policy_id: "no-fallback-v1",
  },
] as const;

export function loadAnthropicProductionBaseline(
  baselineUrl: URL = new URL(
    "./atlas-anthropic-baseline-v1.json",
    import.meta.url,
  ),
): ValidatedAnthropicProductionBaseline {
  const baseline = AnthropicProductionBaselineSchema.parse(
    JSON.parse(readFileSync(baselineUrl, "utf8")),
  );
  const fixtureUrl = new URL(baseline.input_suite.fixture, baselineUrl);
  const fixtureBytes = readFileSync(fixtureUrl);
  const fixtureSha256 = createHash("sha256").update(fixtureBytes).digest("hex");
  if (fixtureSha256 !== baseline.input_suite.sha256) {
    throw new Error(
      `Anthropic baseline fixture hash mismatch: expected ${baseline.input_suite.sha256}, received ${fixtureSha256}`,
    );
  }

  const evaluationSet = loadAtlasOpenAiEvaluationSet(fixtureUrl);
  if (evaluationSet.cases.length !== baseline.input_suite.required_case_count) {
    throw new Error(
      `Anthropic baseline requires ${baseline.input_suite.required_case_count} cases, received ${evaluationSet.cases.length}`,
    );
  }
  if (JSON.stringify(baseline.bindings) !== JSON.stringify(EXPECTED_BINDINGS)) {
    throw new Error("Anthropic baseline bindings do not match the production lock");
  }

  return {
    baseline,
    fixtureSha256,
    caseCount: evaluationSet.cases.length,
  };
}

export function loadAnthropicProductionApproval(
  approvalUrl: URL,
): z.infer<typeof AnthropicProductionApprovalSchema> {
  return AnthropicProductionApprovalSchema.parse(
    JSON.parse(readFileSync(approvalUrl, "utf8")),
  );
}

export function areAnthropicProductionApprovalsComplete(
  approval: z.infer<typeof AnthropicProductionApprovalSchema>,
): boolean {
  return Object.values(approval.approvals).every(
    (record) => record.status === "approved",
  );
}
