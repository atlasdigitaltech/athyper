import { HttpError, validateRuntimeSchema, type RuntimeSchema } from "@athyper/server-runtime-http";

export function validateCycleValue(schema: RuntimeSchema, value: unknown): void {
  try { json(value); validateRuntimeSchema(schema, value); }
  catch { throw cycleError("CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID"); }
}
export function cycleError(code: string, details?: Readonly<Record<string, unknown>>): HttpError {
  const status = code === "CONTROL_ADMIN_PERMISSION_DENIED" || code === "CONTROL_ADMIN_DESIRED_STATE_TARGET_MISMATCH" || code === "CONTROL_ADMIN_DESIRED_STATE_SIGNATURE_INVALID" ? 403
    : code === "CONTROL_ADMIN_CYCLE_TYPE_NOT_FOUND" || code === "CONTROL_ADMIN_CYCLE_TEMPLATE_NOT_FOUND" ? 404
    : code === "CONTROL_ADMIN_IDEMPOTENCY_CONFLICT" ? 409
    : code === "CONTROL_ADMIN_CYCLE_REPOSITORY_UNAVAILABLE" ? 503 : 400;
  return new HttpError(status, code, code, details);
}
// Reject values that JSON serialization would silently change before hashing.
function json(value: unknown, depth = 0, ancestors = new Set<object>()): void {
  if (depth > 64) throw new TypeError("JSON depth exceeded");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (!value || typeof value !== "object" || ancestors.has(value) || !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new TypeError("JSON required");
  ancestors.add(value);
  if (Array.isArray(value)) for (const item of value) json(item, depth + 1, ancestors);
  else for (const item of Object.values(value)) if (item !== undefined) json(item, depth + 1, ancestors);
  ancestors.delete(value);
}
