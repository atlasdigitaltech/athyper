import { createHash } from "node:crypto";

const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._~:/+-]{15,127}$/;

export type IdempotencyKeyResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly reason: "required" | "invalid" };

/** Validates the transport-independent idempotency-key contract. */
export function parseIdempotencyKey(value: string | undefined): IdempotencyKeyResult {
  if (value === undefined || value.trim() === "") return { ok: false, reason: "required" };
  const normalized = value.trim();
  return IDEMPOTENCY_KEY.test(normalized)
    ? { ok: true, value: normalized }
    : { ok: false, reason: "invalid" };
}

/** Stable SHA-256 fingerprint used to detect a key reused with another request. */
export function fingerprintCommand(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const serialized = JSON.stringify(value);
    if (serialized === undefined) throw new TypeError("Idempotency input must be JSON serializable");
    return serialized;
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}
