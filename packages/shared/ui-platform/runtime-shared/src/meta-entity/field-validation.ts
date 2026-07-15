import type { MetaEntityField } from "@athyper/runtime-contracts";

export interface MetaValidationResult {
  valid: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function readNumber(obj: Record<string, unknown> | null, ...keys: string[]): number | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === "number" && Number.isFinite(val)) return val;
    if (typeof val === "string" && val.trim()) {
      const parsed = Number(val.trim());
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readString(obj: Record<string, unknown> | null, ...keys: string[]): string | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    if (typeof obj[key] === "string" && (obj[key] as string).trim()) {
      return (obj[key] as string).trim();
    }
  }
  return undefined;
}

function readStringArray(obj: Record<string, unknown> | null, ...keys: string[]): string[] | undefined {
  if (!obj) return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (Array.isArray(val)) {
      const arr = val.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []);
      if (arr.length > 0) return arr;
    }
  }
  return undefined;
}

function resolveValidationRules(field: MetaEntityField): Record<string, unknown> | null {
  return asRecord(field.validation) ?? asRecord(field.constraints);
}

export function validateMetaEntityFieldValue(
  field: MetaEntityField,
  value: unknown,
  values: Record<string, unknown>,
): MetaValidationResult {
  if (isBlank(value)) {
    if (field.isRequired) {
      return { valid: false, message: `${field.label} is required.` };
    }
    return { valid: true };
  }

  const rules = resolveValidationRules(field);

  const maxLength = readNumber(rules, "max_length", "maxLength");
  if (maxLength !== undefined && typeof value === "string" && value.length > maxLength) {
    return { valid: false, message: `${field.label} must not exceed ${maxLength} characters.` };
  }

  const minLength = readNumber(rules, "min_length", "minLength");
  if (minLength !== undefined && typeof value === "string" && value.length < minLength) {
    return { valid: false, message: `${field.label} must be at least ${minLength} characters.` };
  }

  const pattern = readString(rules, "pattern", "regex");
  if (pattern && typeof value === "string") {
    try {
      if (!new RegExp(pattern).test(value)) {
        const message = readString(rules, "pattern_message", "patternMessage", "message")
          ?? `${field.label} is not in the expected format.`;
        return { valid: false, message };
      }
    } catch {
      // ignore invalid regex
    }
  }

  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isFinite(numericValue)) {
    const minValue = readNumber(rules, "min_value", "minValue", "min");
    if (minValue !== undefined && numericValue < minValue) {
      return { valid: false, message: `${field.label} must be at least ${minValue}.` };
    }

    const maxValue = readNumber(rules, "max_value", "maxValue", "max");
    if (maxValue !== undefined && numericValue > maxValue) {
      return { valid: false, message: `${field.label} must be at most ${maxValue}.` };
    }
  }

  const allowedValues = readStringArray(rules, "allowed_values", "allowedValues", "options");
  if (allowedValues && allowedValues.length > 0) {
    const strValue = String(value);
    if (!allowedValues.includes(strValue)) {
      return { valid: false, message: `${field.label} contains an invalid value.` };
    }
  }

  const crossFieldErrors = validateCrossFieldRules(field, value, values, rules);
  if (crossFieldErrors) return crossFieldErrors;

  return { valid: true };
}

function validateCrossFieldRules(
  field: MetaEntityField,
  _value: unknown,
  values: Record<string, unknown>,
  rules: Record<string, unknown> | null,
): MetaValidationResult | null {
  if (!rules) return null;

  const rawCrossField = rules["cross_field"] ?? rules["crossField"];
  if (!Array.isArray(rawCrossField)) return null;

  const fieldErrors: Record<string, string> = {};

  for (const raw of rawCrossField) {
    const rule = asRecord(raw);
    if (!rule) continue;

    const leftField = readString(rule, "left_field", "leftField", "field") ?? field.name;
    const operator = readString(rule, "operator", "op");
    const rightField = readString(rule, "right_field", "rightField", "compare_to", "compareTo");
    const message = readString(rule, "message", "default_message", "defaultMessage")
      ?? `${field.label} is invalid.`;
    const anchorField = readString(rule, "anchor_field", "anchorField") ?? leftField;

    if (!operator || !rightField) continue;

    const leftVal = comparable(values[leftField]);
    const rightVal = comparable(values[rightField]);
    if (leftVal === null || rightVal === null) continue;

    if (!compareValues(leftVal, operator, rightVal)) {
      if (!fieldErrors[anchorField]) {
        fieldErrors[anchorField] = message;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      valid: false,
      message: "Validation failed.",
      fieldErrors,
    };
  }

  return null;
}

function comparable(value: unknown): string | number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value !== "string") return String(value);
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && trimmed !== "" ? numeric : trimmed;
}

function compareValues(left: string | number, operator: string, right: string | number): boolean {
  switch (operator) {
    case "<=": return left <= right;
    case "<":  return left < right;
    case ">=": return left >= right;
    case ">":  return left > right;
    case "==":
    case "=":  return left === right;
    case "!=":
    case "<>": return left !== right;
    default:   return true;
  }
}
