/** Reject PostgreSQL's permissive date syntax and JavaScript's rollover dates. */
export function dateInput(
  value: unknown,
  name: string,
  invalid: (message: string) => Error,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw invalid(`${name} must be a valid YYYY-MM-DD date`);
  }
  return value;
}
export function timestampInput(
  value: unknown,
  name: string,
  invalid: (message: string) => Error,
): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw invalid(`${name} must be a valid timestamp with a timezone`);
  }
  dateInput(value.slice(0, 10), name, invalid);
  return value;
}
