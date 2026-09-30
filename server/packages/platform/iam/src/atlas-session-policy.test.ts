import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createPermissionAuthorizer } from "./permission-authorizer.js";

it.each(["neon", "studio", "mesh"] as const)(
  "%s Atlas admission accepts baseline authentication, retains grants and operation-specific MFA",
  async (planeKey) => {
    const pack = JSON.parse(
      readFileSync(
        new URL(
          `../../../../db/seed/packs/authorization-v2/${planeKey}/seed-pack.v1.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const permissionCode = `${planeKey}.ai.agent.use`;
    const p = pack.permissionCatalog.operations.find(
      (p: { canonicalPermissionCode: string }) =>
        p.canonicalPermissionCode === permissionCode,
    );
    expect(p.requiresMfa).toBe(false);
    const context: VerifiedRequestContext = {
      planeKey,
      realmKey: planeKey,
      tenantId: "tenant",
      principalId: "actor",
      authEpoch: 1,
      profileHash: "profile",
      requestId: "r",
      assurance: "baseline",
      permissions: {
        planeKey,
        tenantId: "tenant",
        principalId: "actor",
        profileHash: "profile",
        principalFingerprint: "actor",
        schemaHash: "schema",
        resolvedAt: 1,
        allowed: [permissionCode, "protected.reveal"],
        denied: [],
        planLocked: [],
        planeExcluded: [],
        entries: [],
        authorizationScopes: [],
        requirements: [
          {
            permissionCode,
            moduleId: "atlas",
            riskTier: p.riskTier,
            requiresMfa: p.requiresMfa,
            requiresSod: p.requiresSod,
            entitled: true,
          },
          {
            permissionCode: "protected.reveal",
            moduleId: "records",
            riskTier: "medium",
            requiresMfa: true,
            requiresSod: false,
            entitled: true,
          },
        ],
      },
    };
    const authorizer = createPermissionAuthorizer();
    const request = {
      context,
      permissionCode,
      resource: { tenantId: "tenant" },
    };
    expect(await authorizer.authorize(request)).toMatchObject({
      allowed: true,
    });
    expect(
      await authorizer.authorize({
        ...request,
        context: { ...context, assurance: "elevated" },
      }),
    ).toMatchObject({ allowed: true });
    expect(
      await authorizer.authorize({
        ...request,
        permissionCode: "protected.reveal",
      }),
    ).toMatchObject({ allowed: false, reason: "mfa_required" });
    expect(
      await authorizer.authorize({
        ...request,
        resource: { tenantId: "other" },
      }),
    ).toMatchObject({ allowed: false });
    for (const change of [
      { allowed: [] },
      { denied: [permissionCode] },
      { planLocked: [permissionCode] },
      { planeExcluded: [permissionCode] },
    ])
      expect(
        await authorizer.authorize({
          ...request,
          context: {
            ...context,
            permissions: { ...context.permissions, ...change },
          },
        }),
      ).toMatchObject({ allowed: false });
  },
);
