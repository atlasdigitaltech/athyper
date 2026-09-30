/** Validation shared by HTTP commands and lifecycle callers. */
export class OnboardingValidationError extends TypeError {}
export function invalid(message: string): never {
  throw new OnboardingValidationError(message);
}
export function object(value: unknown, name = "body"): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    invalid(`${name} must be an object`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    invalid(`${name} must be a nonempty string`);
  return value.trim();
}
export function uuid(value: unknown, name: string): string {
  const result = text(value, name);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result,
    )
  )
    invalid(`${name} must be a UUID`);
  return result.toLowerCase();
}
export function choice<T extends string>(
  value: unknown,
  choices: readonly T[],
  name: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T))
    invalid(`Invalid ${name}`);
  return value as T;
}
export const statuses = [
  "draft",
  "submitted",
  "qualifying",
  "awaiting_approval",
  "approved",
  "provisioning",
  "reconciling",
  "active",
  "rejected",
  "cancelled",
  "failed",
  "offboarding",
  "offboarded",
] as const;
export const criticalities = ["activation_critical", "independent"] as const;
export function version(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 2147483647
  )
    invalid("expectedDesiredVersion must be a positive database integer");
  return value;
}
