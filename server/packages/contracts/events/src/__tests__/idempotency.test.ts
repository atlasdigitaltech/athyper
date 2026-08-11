import { describe, expect, it } from "vitest";
import { fingerprintCommand, parseIdempotencyKey } from "../index.js";

describe("command idempotency contract", () => {
  it("normalizes valid keys and rejects missing or weak keys", () => {
    expect(parseIdempotencyKey(" request-2026-0001 ")).toEqual({ ok: true, value: "request-2026-0001" });
    expect(parseIdempotencyKey(undefined)).toEqual({ ok: false, reason: "required" });
    expect(parseIdempotencyKey("short")).toEqual({ ok: false, reason: "invalid" });
  });

  it("fingerprints objects independent of property order", () => {
    expect(fingerprintCommand({ a: 1, nested: { b: 2, a: 1 } }))
      .toBe(fingerprintCommand({ nested: { a: 1, b: 2 }, a: 1 }));
  });
});
