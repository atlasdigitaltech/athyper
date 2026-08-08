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
  composeExecutionDescriptorGenerationKey,
  composeExecutionDescriptorGenerationKeys,
  composeGrantRevokePattern,
} from "@athyper/svc-metadata";

describe("execution descriptor generation keys", () => {
  it("addresses an exact plane, tenant, and entity without a scan pattern", () => {
    expect(composeExecutionDescriptorGenerationKey("neon", "t-1", "purchase_invoice"))
      .toBe("execdesc:gen:v1:neon:t-1:purchase_invoice");
  });

  it("uses an explicit sentinel for broad recovery scope", () => {
    expect(composeExecutionDescriptorGenerationKey("admin", "__all__", "__all__"))
      .toBe("execdesc:gen:v1:admin:__all__:__all__");
  });

  it("fans publication out to hierarchical generations for every plane", () => {
    expect(composeExecutionDescriptorGenerationKeys(null, "purchase_invoice", null)).toEqual([
      "execdesc:gen:v1:__all__:__all__:__all__",
      "execdesc:gen:v1:neon:__all__:__all__",
      "execdesc:gen:v1:neon:__all__:purchase_invoice",
      "execdesc:gen:v1:mesh:__all__:__all__",
      "execdesc:gen:v1:mesh:__all__:purchase_invoice",
      "execdesc:gen:v1:admin:__all__:__all__",
      "execdesc:gen:v1:admin:__all__:purchase_invoice",
    ]);
  });
});

describe("composeDescInvalidatePattern", () => {
  it("uses precise tenant + entity when both are supplied", () => {
    expect(composeDescInvalidatePattern("t-1", "purchase_invoice"))
      .toBe("desc:v5:*:t-1:*:purchase_invoice:*");
  });

  it("wildcards the tenant slot when tenant is null (broad invalidation)", () => {
    expect(composeDescInvalidatePattern(null, "purchase_invoice"))
      .toBe("desc:v5:*:*:*:purchase_invoice:*");
  });

  it("wildcards the entity slot when entity is null (whole-tenant invalidation)", () => {
    expect(composeDescInvalidatePattern("t-1", null))
      .toBe("desc:v5:*:t-1:*:*:*");
  });

  it("returns a fully-wildcarded glob when neither tenant nor entity is known", () => {
    expect(composeDescInvalidatePattern(null, null))
      .toBe("desc:v5:*:*:*:*:*");
  });
});

describe("composeGrantRevokePattern", () => {
  it("scopes to mesh plane only and uses tenant when supplied", () => {
    expect(composeGrantRevokePattern("t-1", "fp-abc"))
      .toBe("desc:v5:mesh:t-1:*:*:*");
  });

  it("wildcards the tenant slot when null", () => {
    expect(composeGrantRevokePattern(null, "fp-abc"))
      .toBe("desc:v5:mesh:*:*:*:*");
  });

  it("ignores fingerprint at the cache-key level (Phase 3 A1: principal-agnostic descriptors)", () => {
    expect(composeGrantRevokePattern("t-1", "fp-abc"))
      .toBe(composeGrantRevokePattern("t-1", "fp-different"));
    expect(composeGrantRevokePattern("t-1", null))
      .toBe(composeGrantRevokePattern("t-1", "anything"));
  });

  it("never matches neon or admin descriptors (mesh-only purge)", () => {
    const pattern = composeGrantRevokePattern("t-1", "fp-abc");
    expect(pattern.startsWith("desc:v5:mesh:")).toBe(true);
    expect(pattern.includes(":neon:")).toBe(false);
    expect(pattern.includes(":admin:")).toBe(false);
  });
});
