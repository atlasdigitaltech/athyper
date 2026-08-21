import { describe, expect, it } from "vitest";
import { isTenantId, requireTenantId, toTenantId } from "../index.js";

describe("tenant identifiers", () => {
  const tenantId = "11111111-1111-4111-8111-111111111111";

  it("accepts and brands UUID tenant identifiers", () => {
    expect(isTenantId(tenantId)).toBe(true);
    expect(toTenantId(tenantId)).toBe(tenantId);
  });

  it("rejects missing and malformed identifiers", () => {
    expect(() => requireTenantId(undefined, "test")).toThrow("in test");
    expect(() => toTenantId("tenant-x")).toThrow("Invalid tenant ID");
  });
});
