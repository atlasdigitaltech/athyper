import { describe, it, expect } from "vitest";
import {
  checkPermission,
  checkPermissions,
  checkAnyPermission,
  checkPermissionForEntity,
  checkDelegationPermission,
  type ActiveDelegation,
} from "../types";

describe("checkPermission", () => {
  it("returns true when permission is granted", () => {
    expect(checkPermission({ "invoice.create": true }, "invoice.create")).toBe(true);
  });

  it("returns false when permission is explicitly denied", () => {
    expect(checkPermission({ "invoice.create": false }, "invoice.create")).toBe(false);
  });

  it("returns false when permission is absent", () => {
    expect(checkPermission({}, "invoice.create")).toBe(false);
  });

  it("returns false when permissions map is undefined", () => {
    expect(checkPermission(undefined, "invoice.create")).toBe(false);
  });
});

describe("checkPermissions", () => {
  const perms = { "invoice.create": true, "invoice.approve": true, "invoice.delete": false };

  it("returns true when ALL permissions are granted", () => {
    expect(checkPermissions(perms, ["invoice.create", "invoice.approve"])).toBe(true);
  });

  it("returns false when ANY permission is denied", () => {
    expect(checkPermissions(perms, ["invoice.create", "invoice.delete"])).toBe(false);
  });

  it("returns false when any permission is absent", () => {
    expect(checkPermissions(perms, ["invoice.create", "invoice.void"])).toBe(false);
  });

  it("returns true for empty code list", () => {
    expect(checkPermissions(perms, [])).toBe(true);
  });
});

describe("checkAnyPermission", () => {
  const perms = { "invoice.create": false, "invoice.approve": true };

  it("returns true when at least one permission is granted", () => {
    expect(checkAnyPermission(perms, ["invoice.create", "invoice.approve"])).toBe(true);
  });

  it("returns false when no permissions are granted", () => {
    expect(checkAnyPermission(perms, ["invoice.create", "invoice.delete"])).toBe(false);
  });

  it("returns false for empty code list", () => {
    expect(checkAnyPermission(perms, [])).toBe(false);
  });
});

describe("checkPermissionForEntity", () => {
  const perms = { "invoice.create": true };
  const scopeAll = { all: true, company_codes: [] };
  const scopeRestricted = { all: false, company_codes: ["ATHQ", "SG01"] };

  it("returns true when permission is granted and scope is all", () => {
    expect(checkPermissionForEntity(perms, "invoice.create", scopeAll, "ANY")).toBe(true);
  });

  it("returns true when permission is granted and entityCode is in scope", () => {
    expect(checkPermissionForEntity(perms, "invoice.create", scopeRestricted, "ATHQ")).toBe(true);
  });

  it("returns false when entityCode is outside scope", () => {
    expect(checkPermissionForEntity(perms, "invoice.create", scopeRestricted, "MY01")).toBe(false);
  });

  it("returns false when permission is not granted regardless of scope", () => {
    expect(checkPermissionForEntity({}, "invoice.create", scopeAll, "ATHQ")).toBe(false);
  });
});

describe("checkDelegationPermission", () => {
  const delegation: ActiveDelegation = {
    delegation_id: "d1",
    delegator_name: "Alice",
    merged_permissions: ["invoice.approve", "payment.release"],
  };

  it("returns true when permission is in merged_permissions", () => {
    expect(checkDelegationPermission(delegation, "invoice.approve")).toBe(true);
  });

  it("returns false when permission is not in merged_permissions", () => {
    expect(checkDelegationPermission(delegation, "invoice.create")).toBe(false);
  });

  it("returns false when activeDelegation is undefined", () => {
    expect(checkDelegationPermission(undefined, "invoice.approve")).toBe(false);
  });
});
