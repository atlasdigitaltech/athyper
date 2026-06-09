export type RuntimeWriteErrorKind =
  | "field_validation"
  | "semantic_constraint"
  | "access_denied"
  | "conflict"
  | "server_error"
  | "unknown";

export interface ParsedRuntimeWriteError {
  kind: RuntimeWriteErrorKind;
  message: string;
  fieldErrors: Record<string, string>;
  conflict?: {
    versionField?: string;
    expected?: unknown;
    actual?: unknown;
    message: string;
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function kindFromStatus(status: number): RuntimeWriteErrorKind {
  if (status === 400) return "field_validation";
  if (status === 403 || status === 401) return "access_denied";
  if (status === 409) return "conflict";
  if (status === 422) return "semantic_constraint";
  if (status >= 500) return "server_error";
  return "unknown";
}

function parseFieldErrors(body: Record<string, unknown>): Record<string, string> {
  const raw = body["fieldErrors"] ?? body["field_errors"];
  const fromMap = asRecord(raw);
  if (fromMap) {
    return Object.fromEntries(
      Object.entries(fromMap).flatMap(([field, message]) => {
        const fieldMessage = text(message)
          ?? (Array.isArray(message)
            ? message.map(text).filter(Boolean).join(" ")
            : undefined);
        return fieldMessage ? [[field, fieldMessage]] : [];
      }),
    );
  }

  const errors = Array.isArray(body["errors"]) ? body["errors"] : [];
  const fromErrors = errors.flatMap((item): Array<[string, string]> => {
    const err = asRecord(item);
    const field = text(err?.["field"]);
    const message = text(err?.["message"]);
    return field && message ? [[field, message]] : [];
  });
  if (fromErrors.length > 0) return Object.fromEntries(fromErrors);

  const field = text(body["field"]);
  const message = text(body["message"]);
  return field && message ? { [field]: message } : {};
}

function parseConflict(
  body: Record<string, unknown>,
): ParsedRuntimeWriteError["conflict"] | undefined {
  const raw = body["conflict"];
  const conflict = asRecord(raw);
  if (!conflict) {
    const message = text(body["message"]);
    return message
      ? {
          message,
          versionField: text(body["versionField"] ?? body["version_field"]),
          expected: body["expected"],
          actual: body["actual"],
        }
      : undefined;
  }
  const message = text(conflict["message"]) ?? "A conflict occurred. Please reload and try again.";
  return {
    message,
    versionField: text(conflict["versionField"] ?? conflict["version_field"]),
    expected: conflict["expected"],
    actual: conflict["actual"],
  };
}

function defaultMessage(kind: RuntimeWriteErrorKind): string {
  switch (kind) {
    case "field_validation":  return "Please fix the highlighted fields before saving.";
    case "semantic_constraint": return "The record could not be saved due to a business rule violation.";
    case "access_denied":     return "You do not have permission to perform this action.";
    case "conflict":          return "A conflict occurred. Please reload and try again.";
    case "server_error":      return "A server error occurred. Please try again.";
    default:                  return "An unexpected error occurred.";
  }
}

export function parseRuntimeWriteError(body: unknown, status: number): ParsedRuntimeWriteError {
  const kind = kindFromStatus(status);
  const record = asRecord(body);

  if (!record) {
    return { kind, message: defaultMessage(kind), fieldErrors: {} };
  }

  const fieldErrors = parseFieldErrors(record);
  const message = text(record["message"]) ?? text(record["error"]) ?? defaultMessage(kind);
  const conflict = kind === "conflict" ? parseConflict(record) : undefined;

  return { kind, message, fieldErrors, conflict };
}
