import type { IntlRuntime } from "./index";

/** Only allowlisted codes/parameters select templates. Server details never act as ICU. */
export function localizedEntityError(cause: unknown, intl: IntlRuntime, fallback?: string): string {
  const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const root = object(cause), problem = object(root.problem ?? cause);
  const code = problem.code;
  if (code === "INVALID_FILTER_VALUE" || code === "INVALID_FILTER") return intl.message(`error.${code}`);
  if (code === "TOO_MANY_FILTERS") {
    const params = object(object(problem.errors).params ?? problem.params);
    if (typeof params.max === "number" && Number.isSafeInteger(params.max) && params.max >= 0)
      return intl.message("error.TOO_MANY_FILTERS", { max: params.max });
  }
  return fallback ?? intl.message("error.unavailable");
}
