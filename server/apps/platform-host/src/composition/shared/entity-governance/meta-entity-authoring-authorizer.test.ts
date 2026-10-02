import { expect, it, vi } from "vitest";
import express from "express";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { registerMetaEntityAuthoringRoutes } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createMetaEntityInspectionAuthorizer,
  createAtlasLearningReviewAuthorizer,
  createMetaEntityAuthoringAuthorizer,
  type AuthoringReviewEvidence,
} from "./meta-entity-authoring-authorizer.js";
const id = "10000000-0000-4000-8000-000000000001";
function context(operation: string): VerifiedRequestContext {
  const permission =
    operation === "metadata.entity.activate"
      ? "studio.metadata.contract.publish"
      : operation.replace("metadata.entity.", "studio.metadata.contract.");
  return {
    planeKey: "studio",
    realmKey: "athyper",
    tenantId: "tenant",
    principalId: "reviewer",
    authEpoch: 1,
    profileHash: "p",
    requestId: "r",
    assurance: "elevated",
    permissions: {
      planeKey: "studio",
      tenantId: "tenant",
      principalId: "reviewer",
      principalFingerprint: "f",
      profileHash: "p",
      schemaHash: "s",
      resolvedAt: 1,
      allowed: [permission],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
      requirements: [
        {
          permissionCode: permission,
          moduleId: "m",
          riskTier: "high",
          requiresMfa: true,
          requiresSod: true,
          entitled: true,
        },
      ],
    },
  };
}
const base: AuthoringReviewEvidence = {
  tenantId: "tenant",
  status: "in_review",
  createdBy: "author",
  submittedBy: "author",
  approvedBy: null,
};
const fallback = {
  authorize: vi.fn(async () => ({ allowed: false, reason: "fallback" })),
};
it("permits only a separately authorized reviewer with tenant evidence", async () => {
  const a = createMetaEntityAuthoringAuthorizer(fallback, async () => base);
  expect(
    await a.authorize({
      context: context("metadata.entity.review"),
      permissionCode: "metadata.entity.review",
      resource: { changeSetId: id },
    }),
  ).toMatchObject({ allowed: true });
});
for (const [label, row] of [
  ["author reviews", { ...base, createdBy: "reviewer" }],
  ["submitter reviews", { ...base, submittedBy: "reviewer" }],
  ["wrong tenant", { ...base, tenantId: "other" }],
  ["wrong status", { ...base, status: "draft" }],
  ["missing row", null],
] as const)
  it(`denies ${label}`, async () => {
    const a = createMetaEntityAuthoringAuthorizer(fallback, async () => row);
    expect(
      await a.authorize({
        context: context("metadata.entity.review"),
        permissionCode: "metadata.entity.review",
        resource: { changeSetId: id },
      }),
    ).toMatchObject({ allowed: false });
  });
it("does not bypass MFA, missing permissions or explicit denials", async () => {
  const load = vi.fn(async () => base),
    a = createMetaEntityAuthoringAuthorizer(fallback, load),
    c = context("metadata.entity.review");
  for (const x of [
    { ...c, assurance: undefined },
    { ...c, permissions: { ...c.permissions, allowed: [] } },
    {
      ...c,
      permissions: {
        ...c.permissions,
        denied: ["studio.metadata.contract.review"],
      },
    },
  ])
    expect(
      await a.authorize({
        context: x as VerifiedRequestContext,
        permissionCode: "metadata.entity.review",
        resource: { changeSetId: id },
      }),
    ).toMatchObject({ allowed: false });
  expect(load).not.toHaveBeenCalled();
});
for (const permission of [
  "metadata.entity.publish",
  "metadata.entity.activate",
])
  it(`requires durable independent approval for ${permission}`, async () => {
    const row = {
      ...base,
      status: permission.endsWith("publish") ? "approved" : "published",
      approvedBy: "reviewer",
    };
    const input = {
      context: context(permission),
      permissionCode: permission,
      resource: permission.endsWith("publish")
        ? { changeSetId: id }
        : { releaseId: id },
    };
    expect(
      await createMetaEntityAuthoringAuthorizer(
        fallback,
        async () => row,
      ).authorize(input),
    ).toMatchObject({ allowed: true });
    expect(
      await createMetaEntityAuthoringAuthorizer(fallback, async () => ({
        ...row,
        approvedBy: "author",
      })).authorize(input),
    ).toMatchObject({ allowed: false });
  });
it("does not accept caller supplied separation claims without coordinates", async () => {
  const a = createMetaEntityAuthoringAuthorizer(fallback, async () => base);
  expect(
    await a.authorize({
      context: context("metadata.entity.review"),
      permissionCode: "metadata.entity.review",
      resource: { sodSatisfied: true },
    }),
  ).toMatchObject({ allowed: false });
});

it("inspection accepts a qualified reviewer without approval coordinates but retains assurance and grant checks", async () => {
  const a = createMetaEntityInspectionAuthorizer(fallback),
    c = context("metadata.entity.review");
  expect(
    await a.authorize({
      context: c,
      permissionCode: "metadata.entity.review",
      resource: { tenantId: "tenant" },
    }),
  ).toMatchObject({ allowed: true });
  for (const x of [
    { ...c, assurance: undefined },
    { ...c, planeKey: "neon" },
    { ...c, permissions: { ...c.permissions, allowed: [] } },
    {
      ...c,
      permissions: {
        ...c.permissions,
        denied: ["studio.metadata.contract.review"],
      },
    },
  ])
    expect(
      await a.authorize({
        context: x as VerifiedRequestContext,
        permissionCode: "metadata.entity.review",
      }),
    ).toMatchObject({ allowed: false });
  // The approval gate still refuses this coordinate-free request.
  expect(
    await createMetaEntityAuthoringAuthorizer(
      fallback,
      async () => base,
    ).authorize({ context: c, permissionCode: "metadata.entity.review" }),
  ).toMatchObject({ allowed: false });
});

for (const [operation, permission] of [
  ["author", "edit"],
  ["validate", "edit"],
  ["test", "edit"],
  ["submit", "submit"],
] as const)
  it(`resolves ${operation} to its canonical grant without bypassing constraints`, async () => {
    const code = `studio.metadata.contract.${permission}`,
      c = context(code);
    const requirements = c.permissions.requirements!.map((r) => ({
      ...r,
      requiresSod: false,
    }));
    const actor = { ...c, permissions: { ...c.permissions, requirements } };
    const a = createMetaEntityAuthoringAuthorizer(fallback, async () => null);
    const request = {
      context: actor,
      permissionCode: `metadata.entity.${operation}`,
      resource: { tenantId: "tenant" },
    };
    expect(await a.authorize(request)).toMatchObject({ allowed: true });
    for (const permissions of [
      { ...actor.permissions, allowed: [`metadata.entity.${operation}`] },
      { ...actor.permissions, denied: [code] },
      { ...actor.permissions, planLocked: [code] },
      { ...actor.permissions, planeExcluded: [code] },
      { ...actor.permissions, requirements: c.permissions.requirements },
    ])
      expect(
        await a.authorize({ ...request, context: { ...actor, permissions } }),
      ).toMatchObject({ allowed: false });
    expect(
      await a.authorize({ ...request, resource: { tenantId: "other" } }),
    ).toMatchObject({ allowed: false });
    expect(
      await a.authorize({
        ...request,
        context: { ...actor, assurance: undefined },
      }),
    ).toMatchObject({ allowed: false });
    for (const planeKey of ["neon", "mesh"] as const)
      expect(
        await a.authorize({
          ...request,
          context: {
            ...actor,
            planeKey,
            permissions: { ...actor.permissions, planeKey },
          },
        }),
      ).toMatchObject({ allowed: false });
  });

it("author inspection resolves canonical edit without requiring review coordinates", async () => {
  const c = context("studio.metadata.contract.edit");
  const actor = {
    ...c,
    permissions: {
      ...c.permissions,
      requirements: c.permissions.requirements!.map((r) => ({
        ...r,
        requiresSod: false,
      })),
    },
  };
  expect(
    await createMetaEntityInspectionAuthorizer(fallback).authorize({
      context: actor,
      permissionCode: "metadata.entity.author",
      resource: { tenantId: "tenant" },
    }),
  ).toMatchObject({ allowed: true });
});

it("serves the real collection-provider route with canonical grants and denies missing grants", async () => {
  const c = context("studio.metadata.contract.edit");
  let actor = {
    ...c,
    permissions: {
      ...c.permissions,
      requirements: c.permissions.requirements!.map((r) => ({
        ...r,
        requiresMfa: false,
        requiresSod: false,
      })),
    },
  };
  const app = express();
  registerMetaEntityAuthoringRoutes(app, {
    authenticate: (_q, _s, next) => next(),
    readContext: () => actor,
    authorizer: createMetaEntityAuthoringAuthorizer(
      createPermissionAuthorizer(),
      async () => null,
    ),
    service: {} as never,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/meta-entity-authoring/collection-providers`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toHaveProperty("providers");
    actor = { ...actor, permissions: { ...actor.permissions, allowed: [] } };
    const denied = await fetch(url);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ reason: "missing_permission" });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

it("rollback requires its own canonical permission and approved change set", async () => {
  const a = createMetaEntityAuthoringAuthorizer(fallback, async () => ({
    ...base,
    status: "approved",
    approvedBy: "checker",
  }));
  const request = {
    context: context("studio.metadata.contract.rollback"),
    permissionCode: "metadata.entity.rollback",
    resource: { changeSetId: id },
  };
  expect(await a.authorize(request)).toMatchObject({ allowed: true });
  expect(
    await a.authorize({
      ...request,
      context: context("studio.metadata.contract.publish"),
    }),
  ).toMatchObject({ allowed: false });
  expect(await a.authorize({ ...request, resource: {} })).toMatchObject({
    allowed: false,
  });
});

it("maps learning inspection to the canonical grant without approving a change set", async () => {
  const load = vi.fn(async () => null);
  const a = createAtlasLearningReviewAuthorizer(fallback, load);
  expect(await a.authorize({ context: context("metadata.entity.review"), permissionCode: "metadata.entity.review", resource: { learningOperation: "list" } })).toMatchObject({ allowed: true });
  expect(load).not.toHaveBeenCalled();
});
for (const [label, row, allowed] of [
  ["independent reviewer", { tenantId: "tenant", submittedBy: "proposer", state: "pending" }, true],
  ["requalification", { tenantId: "tenant", submittedBy: "proposer", state: "drafted" }, true],
  ["same proposer", { tenantId: "tenant", submittedBy: "reviewer", state: "pending" }, false],
  ["foreign tenant", { tenantId: "other", submittedBy: "proposer", state: "pending" }, false],
  ["rejected proposal", { tenantId: "tenant", submittedBy: "proposer", state: "rejected" }, false],
  ["missing proposal", null, false],
] as const) it(`learning stage: ${label}`, async () => {
  const a = createAtlasLearningReviewAuthorizer(fallback, async () => row);
  expect(await a.authorize({ context: context("metadata.entity.review"), permissionCode: "metadata.entity.review", resource: { learningOperation: "stage", learningInboxId: id } })).toMatchObject({ allowed });
});
it("learning review never bypasses MFA, missing grants, explicit denies or ordinary release authority", async () => {
  const load = vi.fn(async () => ({ tenantId: "tenant", submittedBy: "proposer", state: "pending" }));
  const a = createAtlasLearningReviewAuthorizer(fallback, load), c = context("metadata.entity.review");
  for (const changed of [
    { ...c, assurance: undefined },
    { ...c, permissions: { ...c.permissions, allowed: [] } },
    { ...c, permissions: { ...c.permissions, denied: ["studio.metadata.contract.review"] } },
  ]) expect(await a.authorize({ context: changed as VerifiedRequestContext, permissionCode: "metadata.entity.review", resource: { learningOperation: "stage", learningInboxId: id } })).toMatchObject({ allowed: false });
  expect(load).not.toHaveBeenCalled();
  const input = { context: c, permissionCode: "metadata.entity.review", resource: { changeSetId: id } };
  await a.authorize(input);
  expect(fallback.authorize).toHaveBeenLastCalledWith(input);
});
