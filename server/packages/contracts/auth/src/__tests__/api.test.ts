import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  Authorizer,
  Authenticator,
  EffectivePermissionSnapshot,
  TokenVerifier,
  VerifiedRequestContext,
} from "../index.js";

describe("auth contract API", () => {
  it("keeps verified request context transport and framework independent", () => {
    const permissions = {
      planeKey: "neon",
      tenantId: "tenant-1",
      principalId: "principal-1",
      principalFingerprint: "fingerprint",
      profileHash: "profile",
      schemaHash: "schema",
      resolvedAt: 1,
      allowed: ["records.read"],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
    } as const satisfies EffectivePermissionSnapshot;

    const context = {
      planeKey: "neon",
      realmKey: "athyper",
      tenantId: "tenant-1",
      principalId: "principal-1",
      authEpoch: 1,
      permissions,
      profileHash: permissions.profileHash,
      requestId: "request-1",
    } as const satisfies VerifiedRequestContext;

    expect(context.permissions.allowed).toEqual(["records.read"]);
    expectTypeOf<TokenVerifier>().toHaveProperty("verify");
    expectTypeOf<Authorizer>().toHaveProperty("authorize");
    expectTypeOf<Authenticator>().toHaveProperty("authenticate");
  });
});
