/** Message keys only: metadata never supplies executable validation or templates. */
export type ValidationCode =
  "required" | "maxLength" | "option" | "url" | "number" | "value";
export type ValidationMessages = Partial<Record<ValidationCode, string>>;
export interface FieldValidationIssue {
  fieldPath: string;
  code: ValidationCode;
  messageKey: string;
  params: { field: string; max?: number };
}
export function parseValidationMessages(
  raw: unknown,
): ValidationMessages | undefined {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("INVALID_VALIDATION_MESSAGES");
  const result: ValidationMessages = {};
  for (const [code, key] of Object.entries(raw)) {
    if (
      !["required", "maxLength", "option", "url", "number", "value"].includes(
        code,
      ) ||
      typeof key !== "string" ||
      !/^[a-z][a-zA-Z0-9_.-]{0,126}$/.test(key) ||
      key
        .split(".")
        .some((s) => ["__proto__", "constructor", "prototype"].includes(s))
    )
      throw Error("INVALID_VALIDATION_MESSAGE_KEY");
    result[code as ValidationCode] = key;
  }
  return result;
}
export function validateDataInput(
  field: {
    valueKey: string;
    label: string;
    required: boolean;
    widget: string;
    format?: "bic" | "iban";
    pattern?: string;
    maxLength?: number;
    normalize?: string;
    validationMessages?: ValidationMessages;
    lookup?: { options?: readonly { value: string }[] };
  },
  value: unknown,
  defaults?: ValidationMessages,
): FieldValidationIssue | undefined {
  const issue = (code: ValidationCode): FieldValidationIssue => ({
    fieldPath: field.valueKey,
    code,
    messageKey:
      field.validationMessages?.[code] ??
      defaults?.[code] ??
      `validation.${code}`,
    params: {
      field: field.label,
      ...(code === "maxLength" ? { max: field.maxLength } : {}),
    },
  });
  const empty =
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "string" && !value.trim());
  if (
    field.required &&
    (empty || (field.widget === "checkbox" && value !== true))
  )
    return issue("required");
  if (empty) return;
  if (field.widget === "checkbox")
    return typeof value === "boolean" ? undefined : issue("value");
  if (typeof value !== "string" && typeof value !== "number")
    return issue("value");
  let text = String(value).trim();
  if (field.format === "iban") text = text.replace(/\s/g, "").toUpperCase();
  if (field.normalize === "uppercase") text = text.toUpperCase();
  if (field.normalize === "lowercase") text = text.toLowerCase();
  // Unicode code points; shared by browser and server, unlike native maxlength.
  if (
    field.maxLength !== undefined &&
    Array.from(text).length > field.maxLength
  )
    return issue("maxLength");
  if (
    field.format === "bic" &&
    !/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(text)
  )
    return issue("value");
  if (field.pattern) {
    if (field.pattern.length > 256 || text.length > 128) return issue("value");
    try {
      if (!new RegExp(field.pattern).test(text)) return issue("value");
    } catch {
      return issue("value");
    }
  }
  if (field.format === "iban") {
    const normalized = text.replace(/\s/g, "").toUpperCase();
    if (
      normalized.length < 15 ||
      normalized.length > 34 ||
      !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)
    )
      return issue("value");
    const expanded = (normalized.slice(4) + normalized.slice(0, 4)).replace(
      /[A-Z]/g,
      (c) => String(c.charCodeAt(0) - 55),
    );
    let remainder = 0;
    for (const digit of expanded)
      remainder = (remainder * 10 + Number(digit)) % 97;
    if (remainder !== 1) return issue("value");
  }
  if (
    field.widget === "select" &&
    !field.lookup?.options?.some((o) => o.value === text)
  )
    return issue("option");
  if (
    field.widget === "date" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      !Number.isFinite(Date.parse(text)) ||
      new Date(text).toISOString().slice(0, 10) !== text)
  )
    return issue("value");
  if (field.widget === "url") {
    try {
      if (!["http:", "https:"].includes(new URL(text).protocol))
        return issue("url");
    } catch {
      return issue("url");
    }
  }
  if (
    ["integer", "decimal"].includes(field.widget) &&
    (!Number.isFinite(Number(text)) ||
      (field.widget === "integer" && !Number.isInteger(Number(text))))
  )
    return issue("number");
}
export class DataValidationError extends Error {
  constructor(public readonly issues: readonly FieldValidationIssue[]) {
    super(
      issues
        .map((i) =>
          i.code === "required"
            ? `${i.params.field} is required.`
            : i.code === "option"
              ? `${i.params.field}: choose an available option.`
              : `${i.params.field}: ${i.code}${i.params.max === undefined ? "" : ` (${i.params.max})`}.`,
        )
        .join(" "),
    );
    this.name = "DataValidationError";
  }
}
