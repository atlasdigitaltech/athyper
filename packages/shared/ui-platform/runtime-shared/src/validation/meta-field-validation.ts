export interface MetaValidationField {
  name?: string;
  field_name?: string;
  label?: string | null;
  field_label?: string | null;
  validation_rules?: Record<string, unknown> | null;
}

export interface MetaValidationError {
  code: string;
  message: string;
  messageKey?: string;
  field: string;
  fields: string[];
  details?: Record<string, unknown>;
}

export interface MetaValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
  errors: MetaValidationError[];
}

interface CrossFieldRule {
  code: string;
  kind: string;
  leftField: string;
  operator: string;
  rightField: string;
  anchorField: string;
  fields: string[];
  message: string;
  messageKey?: string;
  dbConstraint?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function fieldName(field: MetaValidationField): string | null {
  return text(field.name) ?? text(field.field_name) ?? null;
}

function fieldLabel(field: MetaValidationField): string {
  return text(field.label) ?? text(field.field_label) ?? fieldName(field) ?? "Field";
}

function readRules(field: MetaValidationField): Record<string, unknown>[] {
  const validation = asRecord(field.validation_rules);
  if (!validation) return [];

  const rules = validation["rules"];
  if (Array.isArray(rules)) {
    return rules.flatMap((rule) => {
      const record = asRecord(rule);
      return record ? [record] : [];
    });
  }

  const crossField = validation["cross_field"] ?? validation["crossField"];
  if (Array.isArray(crossField)) {
    return crossField.flatMap((rule) => {
      const record = asRecord(rule);
      return record ? [{ ...record, kind: record["kind"] ?? "cross_field" }] : [];
    });
  }

  if (validation["kind"]) return [validation];
  return [];
}

function normalizeRule(rule: Record<string, unknown>, owner: MetaValidationField): CrossFieldRule | null {
  const ownerName = fieldName(owner);
  const kind = text(rule["kind"] ?? rule["type"]) ?? "";
  const leftField = text(rule["left_field"] ?? rule["leftField"] ?? rule["field"]) ?? ownerName;
  const operator = text(rule["operator"] ?? rule["op"]);
  const rightField = text(rule["right_field"] ?? rule["rightField"] ?? rule["compare_to"] ?? rule["compareTo"]);
  if (kind !== "cross_field" || !leftField || !operator || !rightField) return null;

  const anchorField = text(rule["anchor_field"] ?? rule["anchorField"]) ?? leftField;
  const rawHighlightFields = rule["highlight_fields"] ?? rule["highlightFields"];
  const highlightFields = Array.isArray(rawHighlightFields)
    ? rawHighlightFields.flatMap((item) => text(item) ? [text(item)!] : [])
    : [];
  const fields = Array.from(new Set([leftField, rightField, anchorField, ...highlightFields]));
  const code =
    text(rule["code"]) ??
    text(rule["message_key"] ?? rule["messageKey"]) ??
    `${anchorField}.invalid`;
  const message =
    text(rule["default_message"] ?? rule["defaultMessage"] ?? rule["message"]) ??
    `${fieldLabel(owner)} is invalid.`;

  return {
    code,
    kind,
    leftField,
    operator,
    rightField,
    anchorField,
    fields,
    message,
    messageKey: text(rule["message_key"] ?? rule["messageKey"]),
    dbConstraint: text(rule["db_constraint"] ?? rule["dbConstraint"]),
  };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function comparable(value: unknown): string | number | boolean | null {
  if (isBlank(value)) return null;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "string") return String(value);

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) && trimmed !== "" ? numeric : trimmed;
}

function compareValues(leftRaw: unknown, operator: string, rightRaw: unknown): boolean {
  const left = comparable(leftRaw);
  const right = comparable(rightRaw);
  if (left === null || right === null) return true;

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

export function validateMetaFieldRules(
  fields: MetaValidationField[],
  data: Record<string, unknown>,
): MetaValidationResult {
  const fieldErrors: Record<string, string> = {};
  const errors: MetaValidationError[] = [];

  for (const field of fields) {
    for (const rawRule of readRules(field)) {
      const rule = normalizeRule(rawRule, field);
      if (!rule) continue;
      if (compareValues(data[rule.leftField], rule.operator, data[rule.rightField])) continue;

      if (!fieldErrors[rule.anchorField]) {
        fieldErrors[rule.anchorField] = rule.message;
      }
      errors.push({
        code: rule.code,
        message: rule.message,
        messageKey: rule.messageKey,
        field: rule.anchorField,
        fields: rule.fields,
        details: {
          left_field: rule.leftField,
          right_field: rule.rightField,
          operator: rule.operator,
          db_constraint: rule.dbConstraint,
        },
      });
    }
  }

  return {
    valid: errors.length === 0,
    fieldErrors,
    errors,
  };
}

export function validationFieldsAffectedByChange(
  fields: MetaValidationField[],
  changedField: string,
): string[] {
  const affected = new Set<string>([changedField]);

  for (const field of fields) {
    for (const rawRule of readRules(field)) {
      const rule = normalizeRule(rawRule, field);
      if (!rule || !rule.fields.includes(changedField)) continue;
      rule.fields.forEach((name) => affected.add(name));
      affected.add(rule.anchorField);
    }
  }

  return [...affected];
}

export function fieldErrorsFromApiErrorBody(body: unknown): Record<string, string> {
  const record = asRecord(body);
  if (!record) return {};

  const fieldErrors = asRecord(record["fieldErrors"] ?? record["field_errors"]);
  if (fieldErrors) {
    return Object.fromEntries(
      Object.entries(fieldErrors).flatMap(([field, message]) =>
        typeof message === "string" && message.trim() ? [[field, message.trim()]] : [],
      ),
    );
  }

  const errors = Array.isArray(record["errors"]) ? record["errors"] : [];
  const fromErrors = errors.flatMap((item): Array<[string, string]> => {
    const err = asRecord(item);
    const field = text(err?.["field"]);
    const message = text(err?.["message"]);
    return field && message ? [[field, message]] : [];
  });
  if (fromErrors.length > 0) return Object.fromEntries(fromErrors);

  const field = text(record["field"]);
  const message = text(record["message"]);
  return field && message ? { [field]: message } : {};
}

export function validationSummaryMessage(fieldErrors: Record<string, string>): string {
  const count = Object.keys(fieldErrors).length;
  return count === 1
    ? "Fix 1 validation issue before saving."
    : `Fix ${count} validation issues before saving.`;
}
