import type { MetaEntityField } from "@athyper/runtime-contracts";

export type VisibilitySurface = "list" | "detail" | "create" | "edit" | "print";

export interface FieldVisibilityContext {
  surface: VisibilitySurface;
  /** Current form state (create/edit) or fetched record (detail/print). */
  values: Record<string, unknown>;
  /**
   * Original fetched record before edits. In detail/print, same as values.
   * In create, only set when a copy-from source record is available.
   */
  record?: Record<string, unknown>;
}

export interface FieldVisibilityResult {
  visible: boolean;
  reason?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function matchesSurface(token: string, surface: VisibilitySurface): boolean {
  const t = token.trim().toLowerCase();
  return t === surface || t === "all";
}

function parseHideIn(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string" && item.trim() ? [item.trim().toLowerCase()] : [],
    );
  }
  return [];
}

function parseShowIn(value: unknown): string[] {
  return parseHideIn(value);
}

function evaluateEqualityPredicate(
  predicate: Record<string, unknown>,
  values: Record<string, unknown>,
): boolean {
  const field = predicate["field"];
  if (typeof field !== "string") return true;

  const value = values[field];
  const eq = predicate["eq"] ?? predicate["equals"] ?? predicate["value"];
  const ne = predicate["ne"] ?? predicate["not"] ?? predicate["notEquals"];
  const isNull = predicate["isNull"] ?? predicate["is_null"];
  const notNull = predicate["notNull"] ?? predicate["not_null"];

  if (isNull === true) return value == null || value === "";
  if (notNull === true) return value != null && value !== "";

  if (eq !== undefined) {
    const equalsAny = Array.isArray(eq)
      ? eq.some((v) => String(v) === String(value))
      : String(eq) === String(value);
    return equalsAny;
  }

  if (ne !== undefined) {
    const notEqualsAny = Array.isArray(ne)
      ? !ne.some((v) => String(v) === String(value))
      : String(ne) !== String(value);
    return notEqualsAny;
  }

  return true;
}

export function evaluateMetaEntityFieldVisibility(
  field: MetaEntityField,
  context: FieldVisibilityContext,
): FieldVisibilityResult {
  const { surface, values } = context;
  const vis = asRecord(field.visibility);

  if (!vis) return { visible: true };

  if (vis["hidden"] === true) {
    return { visible: false, reason: "Field is hidden." };
  }

  const hideIn = parseHideIn(vis["hideIn"] ?? vis["hide_in"]);
  if (hideIn.length > 0 && hideIn.includes(surface)) {
    return { visible: false, reason: `Field is hidden in ${surface}.` };
  }

  const showIn = parseShowIn(vis["showIn"] ?? vis["show_in"]);
  if (showIn.length > 0 && !showIn.some((s) => matchesSurface(s, surface))) {
    return { visible: false, reason: `Field is only visible in ${showIn.join(", ")}.` };
  }

  const when = vis["when"];
  if (when) {
    const predicates = Array.isArray(when) ? when : [when];
    for (const raw of predicates) {
      const predicate = asRecord(raw);
      if (!predicate) continue;
      if (!evaluateEqualityPredicate(predicate, values)) {
        return { visible: false, reason: "Field visibility condition not met." };
      }
    }
  }

  const condition = asRecord(vis["condition"]);
  if (condition) {
    if (!evaluateEqualityPredicate(condition, values)) {
      return { visible: false, reason: "Field visibility condition not met." };
    }
  }

  return { visible: true };
}
