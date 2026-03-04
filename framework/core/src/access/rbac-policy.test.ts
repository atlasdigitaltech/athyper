import { describe, it, expect } from "vitest";

import { RbacPolicy } from "./rbac-policy.js";

describe("RbacPolicy", () => {
  it("should deny by default with empty rules", () => {
    const policy = new RbacPolicy({});
    const ctx = { userId: "u1", tenantId: "t1", roles: ["user"] };

    expect(policy.can("read", "document", ctx)).toBe(false);
  });

  it("should allow admin wildcard permission", () => {
    const policy = new RbacPolicy();
    const ctx = { userId: "u1", tenantId: "t1", roles: ["admin"] };

    expect(policy.can("read", "document", ctx)).toBe(true);
    expect(policy.can("write", "document", ctx)).toBe(true);
    expect(policy.can("delete", "document", ctx)).toBe(true);
  });

  it("should allow user to read", () => {
    const policy = new RbacPolicy();
    const ctx = { userId: "u1", tenantId: "t1", roles: ["user"] };

    expect(policy.can("read", "document", ctx)).toBe(true);
    expect(policy.can("write", "document", ctx)).toBe(false);
  });
});
