/**
 * Shared Condition Evaluator
 *
 * Generic AND/OR condition evaluation engine extracted from the policy rule evaluator.
 * Used by:
 * - Validation Rules Engine (conditional rules, cross-field comparisons)
 * - Policy Rule Evaluator (ABAC conditions)
 * - Approver Resolver (assignment conditions)
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Supported condition operators
 */
export type ConditionOperator =
  | "eq"
  | "ne"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "matches"
  | "exists"
  | "not_exists"
  | "between"
  | "empty"
  | "not_empty"
  | "date_before"
  | "date_after";

/**
 * Single condition leaf node
 */
export type Condition = {
  /** Field path (dot notation, e.g., "record.amount", "status") */
  field: string;

  /** Comparison operator */
  operator: ConditionOperator;

  /** Value to compare against */
  value: unknown;
};

/**
 * Condition group node (AND/OR with nested conditions)
 */
export type ConditionGroup = {
  /** Logical operator (default: "and") */
  operator?: "and" | "or";

  /** Child conditions — can be leaves or nested groups */
  conditions: Array<Condition | ConditionGroup>;
};

/**
 * Flat record used as evaluation context.
 * The evaluator resolves dot-notation field paths against this object.
 */
export type EvaluationContext = Record<string, unknown>;

// ============================================================================
// Type Guards
// ============================================================================

function isConditionGroup(node: Condition | ConditionGroup): node is ConditionGroup {
  return "conditions" in node && Array.isArray((node as ConditionGroup).conditions);
}

// ============================================================================
// Evaluation Engine
// ============================================================================

/**
 * Evaluate a condition group (AND/OR tree) against a context object.
 */
export function evaluateConditionGroup(
  group: ConditionGroup,
  context: EvaluationContext,
): boolean {
  const op = group.operator ?? "and";

  if (op === "and") {
    for (const child of group.conditions) {
      const result = isConditionGroup(child)
        ? evaluateConditionGroup(child, context)
        : evaluateCondition(child, context);
      if (!result) return false;
    }
    return true;
  }

  // OR
  for (const child of group.conditions) {
    const result = isConditionGroup(child)
      ? evaluateConditionGroup(child, context)
      : evaluateCondition(child, context);
    if (result) return true;
  }
  return false;
}

/**
 * Evaluate a single condition against the context.
 */
export function evaluateCondition(
  condition: Condition,
  context: EvaluationContext,
): boolean {
  const fieldValue = resolveFieldValue(condition.field, context);
  const compareValue = condition.value;

  switch (condition.operator) {
    case "eq":
      return fieldValue === compareValue;

    case "ne":
      return fieldValue !== compareValue;

    case "gt":
      return toNumber(fieldValue) > toNumber(compareValue);

    case "gte":
      return toNumber(fieldValue) >= toNumber(compareValue);

    case "lt":
      return toNumber(fieldValue) < toNumber(compareValue);

    case "lte":
      return toNumber(fieldValue) <= toNumber(compareValue);

    case "in":
      return Array.isArray(compareValue) && compareValue.includes(fieldValue);

    case "not_in":
      return Array.isArray(compareValue) && !compareValue.includes(fieldValue);

    case "contains":
      return typeof fieldValue === "string" &&
        typeof compareValue === "string" &&
        fieldValue.includes(compareValue);

    case "not_contains":
      return typeof fieldValue === "string" &&
        typeof compareValue === "string" &&
        !fieldValue.includes(compareValue);

    case "starts_with":
      return typeof fieldValue === "string" &&
        typeof compareValue === "string" &&
        fieldValue.startsWith(compareValue);

    case "ends_with":
      return typeof fieldValue === "string" &&
        typeof compareValue === "string" &&
        fieldValue.endsWith(compareValue);

    case "matches":
      try {
        return typeof fieldValue === "string" &&
          typeof compareValue === "string" &&
          new RegExp(compareValue).test(fieldValue);
      } catch {
        return false;
      }

    case "exists":
      return fieldValue !== undefined && fieldValue !== null;

    case "not_exists":
      return fieldValue === undefined || fieldValue === null;

    case "between": {
      if (!Array.isArray(compareValue) || compareValue.length !== 2) return false;
      const num = toNumber(fieldValue);
      return num >= toNumber(compareValue[0]) && num <= toNumber(compareValue[1]);
    }

    case "empty":
      return fieldValue === undefined ||
        fieldValue === null ||
        fieldValue === "" ||
        (Array.isArray(fieldValue) && fieldValue.length === 0);

    case "not_empty":
      return fieldValue !== undefined &&
        fieldValue !== null &&
        fieldValue !== "" &&
        !(Array.isArray(fieldValue) && fieldValue.length === 0);

    case "date_before": {
      const d = toDate(fieldValue);
      const ref = toDate(compareValue);
      return d !== null && ref !== null && d < ref;
    }

    case "date_after": {
      const d = toDate(fieldValue);
      const ref = toDate(compareValue);
      return d !== null && ref !== null && d > ref;
    }

    default:
      return false;
  }
}

/**
 * Resolve a dot-notation field path against a context object.
 *
 * Examples:
 *   resolveFieldValue("amount", { amount: 100 }) → 100
 *   resolveFieldValue("address.city", { address: { city: "NYC" } }) → "NYC"
 */
export function resolveFieldValue(
  field: string,
  context: EvaluationContext,
): unknown {
  const parts = field.split(".");
  let value: unknown = context;

  for (const key of parts) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "object") {
      value = (value as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return value;
}

// ============================================================================
// Helpers
// ============================================================================

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return isNaN(n) ? NaN : n;
  }
  return NaN;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}
