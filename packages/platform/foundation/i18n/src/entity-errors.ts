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

/** Localize safe presentation categories; never render server error details as UI copy. */
export function localizeEntityErrorModel<T extends { readonly kind: string; readonly title: string; readonly description: string }>(model: T, intl: IntlRuntime): T {
  const key = model.kind === "permission-denied" ? "denied"
    : model.kind === "not-found" ? "notFound"
    : model.kind === "service-unavailable" ? "serviceUnavailable"
    : model.kind === "network" || model.kind === "offline" ? "network"
    : model.kind === "unexpected" ? "unavailable"
    : undefined;
  return key ? { ...model, title: intl.message(`error.surface.${key}.title`), description: intl.message(`error.surface.${key}.description`) } : model;
}
