import { readFileSync } from "node:fs";

import { z } from "zod";

const EvaluationCategorySchema = z.enum([
  "product_help",
  "finance_terminology_calculation",
  "refuse_invent_live_tenant_data",
  "prompt_injection",
  "multi_turn_retention",
  "concise_answer",
  "future_structured_json",
  "cancellation_long_response",
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
    "stream",
    "runtime",
    "ledger",
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
  transport: z.literal("sse"),
  stream: z.literal(true),
  cancel: z.object({
    trigger: z.literal("after_first_text_delta"),
    deadline_ms: z.number().int().positive().max(30_000),
  }).strict(),
}).strict();

const CaseSchema = z.object({
  id: z.string().regex(/^OAI-[A-Z]{2}-\d{3}$/),
  variables: z.record(z.string(), z.unknown()),
}).strict();

const FamilySchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  category: EvaluationCategorySchema,
  risk: z.enum(["low", "medium", "high"]),
  messages: z.array(MessageSchema).min(1),
  execution: ExecutionSchema.optional(),
  assertions: z.array(AssertionSchema).min(1),
  rubric: RubricSchema,
  cases: z.array(CaseSchema).min(1),
}).strict();

export const AtlasOpenAiEvaluationSetSchema = z.object({
  dataset_id: z.literal("atlas-openai-eval"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  released_on: z.iso.date(),
  description: z.string().min(20).max(1_000),
  data_policy: z.object({
    source: z.literal("synthetic_only"),
    contains_customer_data: z.literal(false),
    contains_copyrighted_passages: z.literal(false),
  }).strict(),
  model_profile: z.object({
    provider: z.literal("openai"),
    model_id: z.literal("gpt-5.6-sol"),
    audience: z.literal("internal_only"),
    evaluation_status: z.literal("not_run"),
    scores_recorded: z.literal(false),
  }).strict(),
  families: z.array(FamilySchema).min(1),
}).strict();

export type AtlasOpenAiEvaluationSet = z.infer<
  typeof AtlasOpenAiEvaluationSetSchema
>;
export type AtlasOpenAiEvaluationCategory = z.infer<
  typeof EvaluationCategorySchema
>;

export interface NormalizedAtlasOpenAiEvaluationCase {
  id: string;
  datasetId: "atlas-openai-eval";
  version: string;
  category: AtlasOpenAiEvaluationCategory;
  risk: "low" | "medium" | "high";
  messages: Array<z.infer<typeof MessageSchema>>;
  execution?: z.infer<typeof ExecutionSchema>;
  assertions: Array<{
    id: string;
    target: z.infer<typeof AssertionSchema>["target"];
    operator: string;
    expected: unknown;
  }>;
  rubric: z.infer<typeof RubricSchema>;
}

export interface ValidatedAtlasOpenAiEvaluationSet {
  dataset: AtlasOpenAiEvaluationSet;
  cases: NormalizedAtlasOpenAiEvaluationCase[];
  categoryCounts: Record<AtlasOpenAiEvaluationCategory, number>;
}

export const REQUIRED_CATEGORY_MINIMUMS: Record<
  AtlasOpenAiEvaluationCategory,
  number
> = {
  product_help: 25,
  finance_terminology_calculation: 25,
  refuse_invent_live_tenant_data: 25,
  prompt_injection: 25,
  multi_turn_retention: 25,
  concise_answer: 25,
  future_structured_json: 25,
  cancellation_long_response: 25,
};

const CATEGORY_PREFIX: Record<AtlasOpenAiEvaluationCategory, string> = {
  product_help: "PH",
  finance_terminology_calculation: "FN",
  refuse_invent_live_tenant_data: "LT",
  prompt_injection: "PI",
  multi_turn_retention: "MT",
  concise_answer: "CA",
  future_structured_json: "JS",
  cancellation_long_response: "CL",
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

export function loadAtlasOpenAiEvaluationSet(
  sourceUrl: URL = new URL("./atlas-openai-eval-v1.json", import.meta.url),
): ValidatedAtlasOpenAiEvaluationSet {
  const parsedJson: unknown = JSON.parse(readFileSync(sourceUrl, "utf8"));
  return validateAtlasOpenAiEvaluationSet(parsedJson);
}

export function validateAtlasOpenAiEvaluationSet(
  value: unknown,
): ValidatedAtlasOpenAiEvaluationSet {
  const dataset = AtlasOpenAiEvaluationSetSchema.parse(value);
  assertNoObservedResults(dataset);

  const ids = new Set<string>();
  const familyIds = new Set<string>();
  const categoryCounts = emptyCategoryCounts();
  const normalizedCases: NormalizedAtlasOpenAiEvaluationCase[] = [];

  for (const family of dataset.families) {
    if (familyIds.has(family.id)) {
      throw new Error(`duplicate evaluation family id: ${family.id}`);
    }
    familyIds.add(family.id);

    if (family.version !== dataset.version) {
      throw new Error(
        `family ${family.id} version ${family.version} does not match dataset ${dataset.version}`,
      );
    }

    const totalWeight = family.rubric.criteria.reduce(
      (total, criterion) => total + criterion.weight,
      0,
    );
    if (Math.abs(totalWeight - 1) > 0.000_001) {
      throw new Error(`family ${family.id} rubric weights must total 1`);
    }

    const assertionIds = new Set<string>();
    for (const assertion of family.assertions) {
      if (assertionIds.has(assertion.id)) {
        throw new Error(
          `family ${family.id} has duplicate assertion id ${assertion.id}`,
        );
      }
      assertionIds.add(assertion.id);
    }

    const rubricIds = new Set<string>();
    for (const criterion of family.rubric.criteria) {
      if (rubricIds.has(criterion.id)) {
        throw new Error(
          `family ${family.id} has duplicate rubric criterion ${criterion.id}`,
        );
      }
      rubricIds.add(criterion.id);
    }

    for (const evaluationCase of family.cases) {
      if (ids.has(evaluationCase.id)) {
        throw new Error(`duplicate evaluation case id: ${evaluationCase.id}`);
      }
      ids.add(evaluationCase.id);

      const expectedPrefix = `OAI-${CATEGORY_PREFIX[family.category]}-`;
      if (!evaluationCase.id.startsWith(expectedPrefix)) {
        throw new Error(
          `case ${evaluationCase.id} does not match category ${family.category}`,
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
      normalizedCases.push({
        id: evaluationCase.id,
        datasetId: dataset.dataset_id,
        version: dataset.version,
        category: family.category,
        risk: family.risk,
        messages,
        ...(family.execution ? { execution: family.execution } : {}),
        assertions,
        rubric: family.rubric,
      });
    }
  }

  if (normalizedCases.length < 200) {
    throw new Error(
      `Atlas OpenAI evaluation set requires at least 200 cases; received ${normalizedCases.length}`,
    );
  }

  for (const [category, minimum] of Object.entries(
    REQUIRED_CATEGORY_MINIMUMS,
  ) as Array<[AtlasOpenAiEvaluationCategory, number]>) {
    if (categoryCounts[category] < minimum) {
      throw new Error(
        `category ${category} requires at least ${minimum} cases; received ${categoryCounts[category]}`,
      );
    }
  }

  return {
    dataset,
    cases: normalizedCases,
    categoryCounts,
  };
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

function emptyCategoryCounts(): Record<AtlasOpenAiEvaluationCategory, number> {
  return {
    product_help: 0,
    finance_terminology_calculation: 0,
    refuse_invent_live_tenant_data: 0,
    prompt_injection: 0,
    multi_turn_retention: 0,
    concise_answer: 0,
    future_structured_json: 0,
    cancellation_long_response: 0,
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
