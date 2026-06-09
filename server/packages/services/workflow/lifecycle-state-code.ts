export function normalizeLifecycleStateCode(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, "_");
}
