/**
 * Validation Rules — Type Definitions
 *
 * Typed validation rule schema for the META Engine dynamic rule system.
 * Replaces the untyped `Record<string, unknown>` validation column with
 * a discriminated union of rule types.
 *
 * These are pure types — no runtime dependencies.
 */

// ============================================================================
// Condition Types (re-declared as pure types for core package)
// ============================================================================

export type ConditionOperator =
  | "eq" | "ne" | "gt" | "gte" | "lt" | "lte"
  | "in" | "not_in" | "contains" | "not_contains"
  | "starts_with" | "ends_with" | "matches"
  | "exists" | "not_exists" | "between"
  | "empty" | "not_empty" | "date_before" | "date_after";

export type ConditionLeaf = {
  field: string;
  operator: ConditionOperator;
  value: unknown;
};

export type ConditionGroup = {
  operator?: "and" | "or";
  conditions: Array<ConditionLeaf | ConditionGroup>;
};

// ============================================================================
// Validation Rule Enums
// ============================================================================

/** Rule severity controls whether it blocks persistence or is advisory */
export type ValidationRuleSeverity = "error" | "warning";

/** Execution phase determines when the rule is evaluated */
export type ValidationPhase = "beforePersist" | "beforeTransition";

/** Trigger determines which operations invoke the rule */
export type ValidationTrigger = "create" | "update" | "transition" | "all";

// ============================================================================
// Rule Kind Discriminant
// ============================================================================

export type ValidationRuleKind =
  | "required"
  | "min_max"
  | "length"
  | "regex"
  | "enum"
  | "cross_field"
  | "conditional"
  | "date_range"
  | "referential"
  | "unique";

// ============================================================================
// Base Rule (common fields)
// ============================================================================

export type BaseValidationRule = {
  /** Unique rule identifier */
  id: string;

  /** Human-readable rule name */
  name: string;

  /** Rule kind discriminant */
  kind: ValidationRuleKind;

  /** Severity: "error" blocks save, "warning" is advisory */
  severity: ValidationRuleSeverity;

  /** Which operations trigger this rule */
  appliesOn: ValidationTrigger[];

  /** Execution phase */
  phase: ValidationPhase;

  /** Target field path (dot notation for nested) */
  fieldPath: string;

  /** Custom error message template. Supports {field}, {value}, {param} placeholders */
  message?: string;
};

// ============================================================================
// Concrete Rule Types (Discriminated Union)
// ============================================================================

/** Field must have a non-null, non-empty value */
export type RequiredRule = BaseValidationRule & {
  kind: "required";
};

/** Numeric min/max range */
export type MinMaxRule = BaseValidationRule & {
  kind: "min_max";
  min?: number;
  max?: number;
};

/** String length constraint */
export type LengthRule = BaseValidationRule & {
  kind: "length";
  minLength?: number;
  maxLength?: number;
};

/** Regular expression match */
export type RegexRule = BaseValidationRule & {
  kind: "regex";
  pattern: string;
  flags?: string;
};

/** Value must be one of the allowed values */
export type EnumConstraintRule = BaseValidationRule & {
  kind: "enum";
  allowedValues: string[];
};

/** Compare value of this field against another field */
export type CrossFieldRule = BaseValidationRule & {
  kind: "cross_field";
  compareField: string;
  operator: ConditionOperator;
};

/** Conditional rule: IF condition tree → THEN enforce nested rules */
export type ConditionalRule = BaseValidationRule & {
  kind: "conditional";
  when: ConditionGroup;
  then: ValidationRule[];
};

/** Date range validation (before/after other fields or absolute dates) */
export type DateRangeRule = BaseValidationRule & {
  kind: "date_range";
  afterField?: string;
  beforeField?: string;
  minDate?: string;  // ISO 8601
  maxDate?: string;  // ISO 8601
};

/** Value must exist as a record in the target entity */
export type ReferentialIntegrityRule = BaseValidationRule & {
  kind: "referential";
  targetEntity: string;
  targetField?: string;  // default: "id"
};

/** Value must be unique (optionally scoped to other fields) */
export type UniqueRule = BaseValidationRule & {
  kind: "unique";
  scope?: string[];  // Composite uniqueness scope fields
};

// ============================================================================
// Discriminated Union
// ============================================================================

export type ValidationRule =
  | RequiredRule
  | MinMaxRule
  | LengthRule
  | RegexRule
  | EnumConstraintRule
  | CrossFieldRule
  | ConditionalRule
  | DateRangeRule
  | ReferentialIntegrityRule
  | UniqueRule;

// ============================================================================
// Rule Set (stored in DB validation JSONB column)
// ============================================================================

/**
 * Versioned set of validation rules for an entity field or entity-level.
 * The version number enables forward-compatible rule migration.
 */
export type ValidationRuleSet = {
  /** Schema version for migration safety */
  version: number;

  /** Ordered list of validation rules */
  rules: ValidationRule[];
};

// ============================================================================
// Validation Result
// ============================================================================

/** Single validation failure */
export type RuleValidationError = {
  /** Rule ID that produced this error */
  ruleId: string;

  /** Human-readable rule name */
  ruleName: string;

  /** Target field path */
  fieldPath: string;

  /** Error message */
  message: string;

  /** Severity */
  severity: ValidationRuleSeverity;

  /** Actual value that failed validation (omitted for security-sensitive fields) */
  value?: unknown;
};

/** Complete validation result */
export type RuleValidationResult = {
  /** Overall validity (false if any severity=error rule failed) */
  valid: boolean;

  /** Blocking errors */
  errors: RuleValidationError[];

  /** Advisory warnings */
  warnings: RuleValidationError[];
};
