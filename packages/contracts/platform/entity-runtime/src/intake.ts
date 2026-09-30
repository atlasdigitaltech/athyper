/** Published presentation flow. Conditions guide navigation; operations retain server authority. */
export type IntakeCondition = Readonly<{
  field: string;
  operator: "present" | "equals";
  value?: string | number | boolean | null;
}>;
export interface EntityIntakeStepV1 {
  readonly key: string;
  readonly surfaceKey: string;
  readonly title: string;
  readonly description?: string;
  readonly optional: boolean;
  readonly entryCondition?: IntakeCondition;
  readonly completionCondition?: IntakeCondition;
}
export interface EntityIntakeFlowV1 {
  readonly schemaVersion: 1;
  readonly key: string;
  readonly kind: "create" | "edit" | "review" | "execute";
  readonly title: string;
  readonly description?: string;
  readonly navigation: "linear" | "free";
  readonly allowDraftResume: boolean;
  readonly entryOperation: string;
  readonly completionOperation: string;
  readonly steps: readonly EntityIntakeStepV1[];
}
const fail = (name: string): never => {
  throw new TypeError(`Invalid intake ${name}`);
};
const object = (v: unknown): Record<string, unknown> =>
  !v || typeof v !== "object" || Array.isArray(v)
    ? fail("object")
    : (v as Record<string, unknown>);
const text = (v: unknown): string =>
  typeof v !== "string" || !v.trim() || v.length > 4000 ? fail("text") : v;
const key = (v: unknown): string => {
  const s = text(v);
  return /^[a-z][a-z0-9_.-]{0,126}$/.test(s) ? s : fail("key");
};
const bool = (v: unknown): boolean =>
  typeof v === "boolean" ? v : fail("boolean");
function choice<T extends string>(v: unknown, options: readonly T[]): T {
  return options.includes(v as T) ? (v as T) : fail("choice");
}
export function parseIntakeCondition(raw: unknown): IntakeCondition {
  const v = object(raw);
  if (Object.keys(v).some((k) => !["field", "operator", "value"].includes(k)))
    fail("condition property");
  const operator = choice(v.operator, ["present", "equals"] as const);
  if (
    operator === "equals" &&
    !(
      v.value === null ||
      ["string", "boolean"].includes(typeof v.value) ||
      (typeof v.value === "number" && Number.isFinite(v.value))
    )
  )
    fail("condition value");
  if (operator === "present" && Object.hasOwn(v, "value"))
    fail("present condition value");
  return Object.freeze({
    field: key(v.field),
    operator,
    ...(operator === "equals"
      ? { value: v.value as string | number | boolean | null }
      : {}),
  });
}
export function intakeConditionMatches(
  condition: IntakeCondition | undefined,
  answers: Readonly<Record<string, unknown>>,
): boolean {
  if (!condition) return true;
  const value = Object.hasOwn(answers, condition.field)
    ? answers[condition.field]
    : undefined;
  return condition.operator === "equals"
    ? value === condition.value
    : value !== undefined && value !== null && value !== "";
}
export function parseEntityIntakeFlow(raw: unknown): EntityIntakeFlowV1 {
  const v = object(raw);
  if (
    v.schemaVersion !== 1 ||
    !Array.isArray(v.steps) ||
    !v.steps.length ||
    v.steps.length > 32
  )
    fail("flow");
  const steps = (v.steps as unknown[]).map((raw) => {
    const s = object(raw);
    return Object.freeze({
      key: key(s.key),
      surfaceKey: key(s.surfaceKey),
      title: text(s.title),
      optional: bool(s.optional),
      ...(s.description === undefined
        ? {}
        : { description: text(s.description) }),
      ...(s.entryCondition === undefined
        ? {}
        : { entryCondition: parseIntakeCondition(s.entryCondition) }),
      ...(s.completionCondition === undefined
        ? {}
        : { completionCondition: parseIntakeCondition(s.completionCondition) }),
    });
  });
  if (new Set(steps.map((s) => s.key)).size !== steps.length)
    fail("duplicate step");
  return Object.freeze({
    schemaVersion: 1,
    key: key(v.key),
    kind: choice(v.kind, ["create", "edit", "review", "execute"] as const),
    title: text(v.title),
    ...(v.description === undefined
      ? {}
      : { description: text(v.description) }),
    navigation: choice(v.navigation, ["linear", "free"] as const),
    allowDraftResume: bool(v.allowDraftResume),
    entryOperation: key(v.entryOperation),
    completionOperation: key(v.completionOperation),
    steps: Object.freeze(steps),
  });
}
export function parseEntityIntakeFlows(
  raw: unknown,
): readonly EntityIntakeFlowV1[] {
  if (!Array.isArray(raw) || raw.length > 32) fail("flows");
  const flows = (raw as unknown[]).map(parseEntityIntakeFlow);
  if (new Set(flows.map((f) => f.key)).size !== flows.length)
    fail("duplicate flow");
  return Object.freeze(flows);
}
