export interface ClassicWriteAttempt {
  idempotencyKey: string;
}

export function createClassicWriteSignature(input: {
  entityCode: string;
  recordId: string;
  expectedVersion: string;
  data: Record<string, unknown>;
}): string {
  return canonicalJson(input);
}

export function resolveClassicWriteAttempt(
  attempts: Map<string, ClassicWriteAttempt>,
  signature: string,
): ClassicWriteAttempt {
  const existing = attempts.get(signature);
  if (existing) return existing;
  if (attempts.size >= 50) {
    const oldest = attempts.keys().next().value as string | undefined;
    if (oldest) attempts.delete(oldest);
  }
  const nonce = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const attempt = { idempotencyKey: `classic-patch:${nonce}` };
  attempts.set(signature, attempt);
  return attempt;
}

export function completeClassicWriteAttempt(
  attempts: Map<string, ClassicWriteAttempt>,
  signature: string,
): void {
  attempts.delete(signature);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
