// packages/shared/platform-auth/auth-common/src/__tests__/roles.test.ts

import { describe, expect, it } from "vitest";

import {
  clientHasRole,
  clientRolesFromAccess,
  hasAuthorizedRoleForPlane,
  realmRolesFromAccess,
} from "../roles.js";

describe("clientRolesFromAccess", () => {
  it("returns [] when resource_access is missing", () => {
    expect(clientRolesFromAccess(undefined, "neon-web")).toEqual([]);
    expect(clientRolesFromAccess(null, "neon-web")).toEqual([]);
  });

  it("returns [] when the client is absent", () => {
    expect(
      clientRolesFromAccess({ "admin-web": { roles: ["AUTHORIZED"] } }, "neon-web"),
    ).toEqual([]);
  });

  it("returns the role list when shape is correct", () => {
    expect(
      clientRolesFromAccess({ "neon-web": { roles: ["AUTHORIZED", "NEON_USER"] } }, "neon-web"),
    ).toEqual(["AUTHORIZED", "NEON_USER"]);
  });

  it("filters non-string entries silently", () => {
    expect(
      clientRolesFromAccess(
        { "neon-web": { roles: ["AUTHORIZED", 42, null, "NEON_USER"] } },
        "neon-web",
      ),
    ).toEqual(["AUTHORIZED", "NEON_USER"]);
  });

  it("returns [] when roles is not an array", () => {
    expect(
      clientRolesFromAccess({ "neon-web": { roles: "AUTHORIZED" } }, "neon-web"),
    ).toEqual([]);
  });
});

describe("clientHasRole", () => {
  const ra = { "neon-web": { roles: ["AUTHORIZED"] } };

  it("true when role is present", () => {
    expect(clientHasRole(ra, "neon-web", "AUTHORIZED")).toBe(true);
  });

  it("false when role is missing", () => {
    expect(clientHasRole(ra, "neon-web", "ADMIN")).toBe(false);
  });

  it("false when client is missing", () => {
    expect(clientHasRole(ra, "admin-web", "AUTHORIZED")).toBe(false);
  });
});

describe("hasAuthorizedRoleForPlane", () => {
  it("looks up `${planeKey}-web`", () => {
    const ra = { "mesh-web": { roles: ["AUTHORIZED"] } };
    expect(hasAuthorizedRoleForPlane(ra, "mesh")).toBe(true);
    expect(hasAuthorizedRoleForPlane(ra, "neon")).toBe(false);
  });
});

describe("realmRolesFromAccess", () => {
  it("returns realm_access.roles when present", () => {
    expect(realmRolesFromAccess({ roles: ["NEON_USER", "GLOBAL_ADMIN"] })).toEqual([
      "NEON_USER",
      "GLOBAL_ADMIN",
    ]);
  });

  it("returns [] otherwise", () => {
    expect(realmRolesFromAccess(undefined)).toEqual([]);
    expect(realmRolesFromAccess({})).toEqual([]);
    expect(realmRolesFromAccess({ roles: "NEON_USER" })).toEqual([]);
  });
});
