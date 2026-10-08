// Parsing helpers shared by the layout contracts (Calendar, Gantt). Internal:
// not re-exported from the package index.

export function fail(path: string, reason: string): never {
  throw new TypeError(`${path} ${reason}`);
}
export function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "must be an object");
  return value as Record<string, unknown>;
}
export function allowKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
  what: string,
): void {
  for (const key of Object.keys(value))
    if (!keys.includes(key))
      fail(`${path}.${key}`, `is not a ${what} property`);
}
export function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    fail(path, "must be readable text");
  return value;
}
export function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}
export function member<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  reason: string,
): T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  )
    fail(path, reason);
  return value as T;
}
