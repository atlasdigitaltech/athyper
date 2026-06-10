/**
 * Phase 5 — Three-Plane Permission Stack.
 *
 * Unit tests for the pure pattern composers used by the cache-invalidation
 * listener. The LISTEN client + Redis side-effects are exercised by the
 * Phase 7 integration suite against a real DB + Redis; here we lock the
 * key-shape contract so a future cache-key bump can't silently break the
 * glob the listener uses.
 */

import { describe, expect, it } from "vitest";

import {
  composeDescInvalidatePattern,
  composeGrantRevokePattern,
} from "../listener.js";

describe("composeDescInvalidatePattern", () => {
  it("uses precise tenant + entity when both are supplied", () => {
    expect(composeDescInvalidatePattern("t-1", "purchase_invoice"))
      .toBe("desc:v4:*:t-1:*:purchase_invoice:*");
  });

  it("wildcards the tenant slot when tenant is null (broad invalidation)", () => {
    expect(composeDescInvalidatePattern(null, "purchase_invoice"))
      .toBe("desc:v4:*:*:*:purchase_invoice:*");
  });

  it("wildcards the entity slot when entity is null (whole-tenant invalidation)", () => {
    expect(composeDescInvalidatePattern("t-1", null))
      .toBe("desc:v4:*:t-1:*:*:*");
  });

  it("returns a fully-wildcarded glob when neither tenant nor entity is known", () => {
    expect(composeDescInvalidatePattern(null, null))
      .toBe("desc:v4:*:*:*:*:*");
  });
});

describe("composeGrantRevokePattern", () => {
  it("scopes to mesh plane only and uses tenant when supplied", () => {
    expect(composeGrantRevokePattern("t-1", "fp-abc"))
      .toBe("desc:mesh:v4:t-1:*:*:*:*");
  });

  it("wildcards the tenant slot when null", () => {
    expect(composeGrantRevokePattern(null, "fp-abc"))
      .toBe("desc:mesh:v4:*:*:*:*:*");
  });

  it("ignores fingerprint at the cache-key level (Phase 3 A1: principal-agnostic descriptors)", () => {
    expect(composeGrantRevokePattern("t-1", "fp-abc"))
      .toBe(composeGrantRevokePattern("t-1", "fp-different"));
    expect(composeGrantRevokePattern("t-1", null))
      .toBe(composeGrantRevokePattern("t-1", "anything"));
  });

  it("never matches neon or admin descriptors (mesh-only purge)", () => {
    const pattern = composeGrantRevokePattern("t-1", "fp-abc");
    expect(pattern.startsWith("desc:mesh:v4:")).toBe(true);
    expect(pattern.includes(":neon:")).toBe(false);
    expect(pattern.includes(":admin:")).toBe(false);
  });
});
