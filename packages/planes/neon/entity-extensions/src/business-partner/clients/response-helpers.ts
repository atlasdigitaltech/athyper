export function revealClaim() {
  return { revealId: crypto.randomUUID(), purposeExpiresAt: new Date(Date.now() + 30_000).toISOString() };
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Business Partner response must be an object");
  }
  return value as Record<string, unknown>;
}
