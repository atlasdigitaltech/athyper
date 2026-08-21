import { createHash } from "node:crypto";

const encoder = new TextEncoder();

export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  return serialize(value, ancestors);
}

export function canonicalBytes(value: unknown): Uint8Array {
  return encoder.encode(canonicalJson(value));
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON cannot encode non-finite numbers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError(`Canonical JSON cannot encode ${typeof value}`);
  if (ancestors.has(value)) throw new TypeError("Canonical JSON cannot encode cyclic values");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((entry) => serialize(entry, ancestors)).join(",")}]`;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Canonical JSON requires plain objects");
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serialize(record[key], ancestors)}`).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}
