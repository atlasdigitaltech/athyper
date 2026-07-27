import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { z } from "zod";

import {
  loadAtlasOpenAiEvaluationSet,
  type NormalizedAtlasOpenAiEvaluationCase,
} from "./validate-atlas-openai-eval";

const GeminiEvaluationCategorySchema = z.enum([
  "safety_block_normalization",
  "long_context_behavior",
  "structured_output_adherence",
  "multi_function_call_ordering",
  "model_parameter_compatibility",
  "quota_project_limits",
]);

const MessageSchema = z.object({
  role: z.enum(["developer", "user", "assistant", "tool"]),
  content: z.string().min(1).max(20_000),
}).strict();

const ExpectedSchema = z.object({
  literal: z.unknown().optional(),
  from: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
}).strict().superRefine((value, context) => {
  const hasLiteral = Object.prototype.hasOwnProperty.call(value, "literal");
  const hasReference = value.from !== undefined;
  if (hasLiteral === hasReference) {
    context.addIssue({
      code: "custom",
      message: "expected must contain exactly one of literal or from",
    });
  }
});

const AssertionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  target: z.enum([
    "output_text",
    "output_json",
    "provider_request",
    "normalized_stream",
    "runtime",
    "ledger",
    "policy",
  ]),
  operator: z.string().regex(/^[a-z][a-z0-9_]*$/),
  expected: ExpectedSchema,
}).strict();

const RubricSchema = z.object({
  scoring: z.enum(["human_0_2_weighted", "protocol_pass_fail"]),
  criteria: z.array(z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    description: z.string().min(10).max(500),
    weight: z.number().positive().max(1),
  }).strict()).min(1),
  pass: z.object({
    required_assertions: z.literal("all"),
    minimum_weighted_score: z.number().min(0).max(1),
  }).strict(),
}).strict();

const ExecutionSchema = z.object({
  harness: z.enum([
    "atlas_live_text",
    "provider_recorded_fixture",
    "atlas_policy_guard",
    "production_shaped_load",
  ]),
  stream: z.boolean(),
  capability_gate: z.enum([
    "phase3_text",
    "future_native_structured_output",
    "future_tool_calls",
    "operations",
  ]),
  claim_scope: z.enum([
    "text_generation",
    "prompt_json_only",
    "adapter_normalization_only",
    "policy_enforcement_only",
    "load_control_only",
  ]),
}).strict();

const CaseSetupSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("recorded_fixture"),
    fixture_id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  }).strict(),
  z.object({
    kind: z.literal("synthetic_context"),
    target_tokens: z.number().int().min(1_000).max(200_000),
    marker: z.string().min(1).max(100),
    expected_sentinel: z.string().min(1).max(100),
  }).strict(),
  z.object({
    kind: z.literal("live_text"),
    schema_id: z.string().regex(/^[a-z][a-z0-9-]*$/).optional(),
  }).strict(),
  z.object({
    kind: z.literal("policy_scenario"),
    scenario: z.string().regex(/^[a-z][a-z0-9-]*$/),
  }).strict(),
  z.object({
    kind: z.literal("load_scenario"),
    scenario: z.string().regex(/^[a-z][a-z0-9-]*$/),
    request_count: z.number().int().min(1).max(100_000),
  }).strict(),
]);

const CaseSchema = z.object({
  id: z.string().regex(/^GEM-[A-Z]{2}-\d{3}$/),
  variables: z.record(z.string(), z.unknown()),
  setup: CaseSetupSchema,
}).strict();

const FamilySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  category: GeminiEvaluationCategorySchema,
  risk: z.enum(["low", "medium", "high"]),
  execution: ExecutionSchema,
  messages: z.array(MessageSchema).min(1),
  assertions: z.array(AssertionSchema).min(1),
  rubric: RubricSchema,
  cases: z.array(CaseSchema).min(1),
}).strict();

export const AtlasGeminiEvaluationAddonSchema = z.object({
  dataset_id: z.literal("atlas-gemini-eval-addon"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  released_on: z.iso.date(),
  description: z.string().min(20).max(1_000),
  base_suite: z.object({
    dataset_id: z.literal("atlas-openai-eval"),
    version: z.literal("1.0.0"),
    fixture: z.literal("atlas-openai-eval-v1.json"),
    sha256: z.string().regex(/^[A-F0-9]{64}$/),
    required_case_count: z.literal(200),
  }).strict(),
  data_policy: z.object({
    source: z.literal("synthetic_only"),
    contains_customer_data: z.literal(false),
    contains_copyrighted_passages: z.literal(false),
    tenant_data_allowed: z.literal(false),
  }).strict(),
  model_profile: z.object({
    provider: z.literal("gemini"),
    public_binding: z.literal("atlas-gemini-eval"),
    upstream_model_id: z.literal("gemini-3.6-flash"),
    exact_model_source: z.literal("AtlasModelBinding"),
    api_surface: z.literal("interactions"),
    endpoint_version: z.literal("v1beta"),
    sdk_package: z.literal("@google/genai"),
    sdk_version: z.literal("2.13.0"),
    audience: z.literal("internal_only"),
    evaluation_status: z.literal("not_run"),
    scores_recorded: z.literal(false),
  }).strict(),
  run_policy_contract: z.object({
    account_class_required: z.literal(true),
    provider_region_required: z.literal(true),
    environment_project_required: z.literal(true),
    free_tier_scope: z.literal("local_development_synthetic_only"),
    tenant_data_requires: z.literal("approved_paid"),
    silent_account_fallback_allowed: z.literal(false),
    routing_enabled: z.literal(false),
    safety_gate_status: z.literal(
      "blocked_pending_paid_sandbox_native_fixture",
    ),
  }).strict(),
  structured_output_schemas: z.record(
    z.string().regex(/^[a-z][a-z0-9-]*$/),
    z.record(z.string(), z.unknown()),
  ),
  families: z.array(FamilySchema).min(1),
}).strict();

export type AtlasGeminiEvaluationAddon = z.infer<
  typeof AtlasGeminiEvaluationAddonSchema
>;
export type AtlasGeminiEvaluationCategory = z.infer<
  typeof GeminiEvaluationCategorySchema
>;

export interface NormalizedAtlasGeminiEvaluationCase {
  id: string;
  datasetId: "atlas-gemini-eval-addon";
  version: string;
  category: AtlasGeminiEvaluationCategory;
  risk: "low" | "medium" | "high";
  execution: z.infer<typeof ExecutionSchema>;
  setup: z.infer<typeof CaseSetupSchema>;
  messages: Array<z.infer<typeof MessageSchema>>;
  assertions: Array<{
    id: string;
    target: z.infer<typeof AssertionSchema>["target"];
    operator: string;
    expected: unknown;
  }>;
  rubric: z.infer<typeof RubricSchema>;
}

export interface ValidatedAtlasGeminiEvaluationSuite {
  addon: AtlasGeminiEvaluationAddon;
  commonCases: NormalizedAtlasOpenAiEvaluationCase[];
  geminiCases: NormalizedAtlasGeminiEvaluationCase[];
  allCaseCount: number;
  categoryCounts: Record<AtlasGeminiEvaluationCategory, number>;
  commonFixtureSha256: string;
}

export const REQUIRED_GEMINI_CATEGORY_MINIMUMS: Record<
  AtlasGeminiEvaluationCategory,
  number
> = {
  safety_block_normalization: 5,
  long_context_behavior: 5,
  structured_output_adherence: 5,
  multi_function_call_ordering: 5,
  model_parameter_compatibility: 5,
  quota_project_limits: 5,
};

const CATEGORY_PREFIX: Record<AtlasGeminiEvaluationCategory, string> = {
  safety_block_normalization: "SB",
  long_context_behavior: "LC",
  structured_output_adherence: "JS",
  multi_function_call_ordering: "MF",
  model_parameter_compatibility: "PC",
  quota_project_limits: "QP",
};

const FORBIDDEN_OBSERVED_RESULT_KEYS = new Set([
  "score",
  "scores",
  "model_output",
  "observed_result",
  "evaluation_results",
  "winner",
]);

const TEMPLATE_PATTERN = /\{\{([a-z][a-z0-9_]*)\}\}/g;

export function loadAtlasGeminiEvaluationSuite(
  addonUrl: URL = new URL("./atlas-gemini-eval-addon-v1.json", import.meta.url),
  commonUrl: URL = new URL("./atlas-openai-eval-v1.json", import.meta.url),
): ValidatedAtlasGeminiEvaluationSuite {
  const parsedAddon: unknown = JSON.parse(readFileSync(addonUrl, "utf8"));
  return validateAtlasGeminiEvaluationSuite(parsedAddon, commonUrl);
}

export function validateAtlasGeminiEvaluationSuite(
  value: unknown,
  commonUrl: URL = new URL("./atlas-openai-eval-v1.json", import.meta.url),
): ValidatedAtlasGeminiEvaluationSuite {
  const addon = AtlasGeminiEvaluationAddonSchema.parse(value);
  assertNoObservedResults(addon);

  const commonBytes = readFileSync(commonUrl);
  const commonFixtureSha256 = createHash("sha256")
    .update(commonBytes)
    .digest("hex")
    .toUpperCase();
  if (commonFixtureSha256 !== addon.base_suite.sha256) {
    throw new Error(
      `common evaluation fixture hash mismatch: expected ${addon.base_suite.sha256}, received ${commonFixtureSha256}`,
    );
  }

  const common = loadAtlasOpenAiEvaluationSet(commonUrl);
  if (
    common.dataset.dataset_id !== addon.base_suite.dataset_id
    || common.dataset.version !== addon.base_suite.version
    || common.cases.length !== addon.base_suite.required_case_count
  ) {
    throw new Error("common evaluation suite does not match pinned Gemini base");
  }

  const ids = new Set(common.cases.map((item) => item.id));
  const familyIds = new Set<string>();
  const categoryCounts = emptyCategoryCounts();
  const geminiCases: NormalizedAtlasGeminiEvaluationCase[] = [];

  for (const family of addon.families) {
    if (familyIds.has(family.id)) {
      throw new Error(`duplicate Gemini evaluation family id: ${family.id}`);
    }
    familyIds.add(family.id);

    if (family.version !== addon.version) {
      throw new Error(
        `family ${family.id} version ${family.version} does not match dataset ${addon.version}`,
      );
    }

    assertExecutionGate(family);
    assertUniqueIds(
      family.assertions.map((item) => item.id),
      `family ${family.id} assertion`,
    );
    assertUniqueIds(
      family.rubric.criteria.map((item) => item.id),
      `family ${family.id} rubric criterion`,
    );

    const totalWeight = family.rubric.criteria.reduce(
      (total, criterion) => total + criterion.weight,
      0,
    );
    if (Math.abs(totalWeight - 1) > 0.000_001) {
      throw new Error(`family ${family.id} rubric weights must total 1`);
    }

    for (const evaluationCase of family.cases) {
      if (ids.has(evaluationCase.id)) {
        throw new Error(`duplicate evaluation case id: ${evaluationCase.id}`);
      }
      ids.add(evaluationCase.id);

      const expectedPrefix = `GEM-${CATEGORY_PREFIX[family.category]}-`;
      if (!evaluationCase.id.startsWith(expectedPrefix)) {
        throw new Error(
          `case ${evaluationCase.id} does not match category ${family.category}`,
        );
      }

      assertSetupMatchesExecution(
        evaluationCase.id,
        evaluationCase.setup,
        family.execution,
      );
      if (
        evaluationCase.setup.kind === "live_text"
        && evaluationCase.setup.schema_id
        && !Object.prototype.hasOwnProperty.call(
          addon.structured_output_schemas,
          evaluationCase.setup.schema_id,
        )
      ) {
        throw new Error(
          `case ${evaluationCase.id} references unknown schema ${evaluationCase.setup.schema_id}`,
        );
      }

      const messages = family.messages.map((message) => ({
        ...message,
        content: renderTemplate(
          message.content,
          evaluationCase.variables,
          evaluationCase.id,
        ),
      }));
      const assertions = family.assertions.map((assertion) => ({
        id: assertion.id,
        target: assertion.target,
        operator: assertion.operator,
        expected: resolveExpected(
          assertion.expected,
          evaluationCase.variables,
          evaluationCase.id,
        ),
      }));

      categoryCounts[family.category] += 1;
      geminiCases.push({
        id: evaluationCase.id,
        datasetId: addon.dataset_id,
        version: addon.version,
        category: family.category,
        risk: family.risk,
        execution: family.execution,
        setup: evaluationCase.setup,
        messages,
        assertions,
        rubric: family.rubric,
      });
    }
  }

  for (const [category, minimum] of Object.entries(
    REQUIRED_GEMINI_CATEGORY_MINIMUMS,
  ) as Array<[AtlasGeminiEvaluationCategory, number]>) {
    if (categoryCounts[category] < minimum) {
      throw new Error(
        `category ${category} requires at least ${minimum} cases; received ${categoryCounts[category]}`,
      );
    }
  }

  return {
    addon,
    commonCases: common.cases,
    geminiCases,
    allCaseCount: common.cases.length + geminiCases.length,
    categoryCounts,
    commonFixtureSha256,
  };
}

function assertExecutionGate(family: z.infer<typeof FamilySchema>): void {
  if (
    family.execution.capability_gate === "future_tool_calls"
    && family.execution.harness !== "provider_recorded_fixture"
  ) {
    throw new Error(
      `family ${family.id} may exercise future tool calls only with recorded provider fixtures`,
    );
  }

  if (
    family.execution.capability_gate === "future_native_structured_output"
    && family.execution.harness === "atlas_live_text"
  ) {
    throw new Error(
      `family ${family.id} may not claim native structured output through the Phase 3 text binding`,
    );
  }

  if (
    family.execution.claim_scope === "prompt_json_only"
    && family.execution.capability_gate !== "phase3_text"
  ) {
    throw new Error(
      `family ${family.id} prompt-only JSON cases must use the Phase 3 text gate`,
    );
  }
}

function assertSetupMatchesExecution(
  caseId: string,
  setup: z.infer<typeof CaseSetupSchema>,
  execution: z.infer<typeof ExecutionSchema>,
): void {
  const expectedHarnessBySetup = {
    recorded_fixture: "provider_recorded_fixture",
    synthetic_context: "atlas_live_text",
    live_text: "atlas_live_text",
    policy_scenario: "atlas_policy_guard",
    load_scenario: "production_shaped_load",
  } as const;
  const expectedHarness = expectedHarnessBySetup[setup.kind];
  if (execution.harness !== expectedHarness) {
    throw new Error(
      `case ${caseId} setup ${setup.kind} requires harness ${expectedHarness}`,
    );
  }
}

function assertUniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`duplicate ${label} id: ${id}`);
    }
    seen.add(id);
  }
}

function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  caseId: string,
): string {
  const rendered = template.replace(
    TEMPLATE_PATTERN,
    (_placeholder, variableName: string) => {
      if (!Object.prototype.hasOwnProperty.call(variables, variableName)) {
        throw new Error(`case ${caseId} is missing variable ${variableName}`);
      }
      const value = variables[variableName];
      if (
        typeof value !== "string"
        && typeof value !== "number"
        && typeof value !== "boolean"
      ) {
        throw new Error(
          `case ${caseId} template variable ${variableName} must be scalar`,
        );
      }
      return String(value);
    },
  );

  if (TEMPLATE_PATTERN.test(rendered)) {
    throw new Error(`case ${caseId} has unresolved message template variables`);
  }
  TEMPLATE_PATTERN.lastIndex = 0;
  return rendered;
}

function resolveExpected(
  expected: z.infer<typeof ExpectedSchema>,
  variables: Record<string, unknown>,
  caseId: string,
): unknown {
  if (expected.from !== undefined) {
    if (!Object.prototype.hasOwnProperty.call(variables, expected.from)) {
      throw new Error(
        `case ${caseId} assertion references missing variable ${expected.from}`,
      );
    }
    return variables[expected.from];
  }
  return expected.literal;
}

function emptyCategoryCounts(): Record<
  AtlasGeminiEvaluationCategory,
  number
> {
  return {
    safety_block_normalization: 0,
    long_context_behavior: 0,
    structured_output_adherence: 0,
    multi_function_call_ordering: 0,
    model_parameter_compatibility: 0,
    quota_project_limits: 0,
  };
}

function assertNoObservedResults(
  value: unknown,
  path: string = "dataset",
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoObservedResults(item, `${path}[${index}]`);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_OBSERVED_RESULT_KEYS.has(key)) {
      throw new Error(
        `${path}.${key} is forbidden until an evaluation run records real evidence`,
      );
    }
    assertNoObservedResults(child, `${path}.${key}`);
  }
}
