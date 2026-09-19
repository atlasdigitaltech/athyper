import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { strict as assert } from "node:assert";
import {
  parseEntityAuthorizationProfile,
  entityScopeResolvers,
} from "../../../server/packages/contracts/metadata/src/entity-authorization.js";
import { createPermissionAuthorizer } from "../../../server/packages/platform/iam/src/permission-authorizer.js";
import {
  createEntityAccessEvaluator,
  authorizeEntityRelationship,
} from "../../../server/packages/services/records/src/entity-authorization.js";
import type {
  EntityScopeAdapter,
  EntityScopeCoordinates,
} from "../../../server/packages/services/records/src/entity-authorization.js";
import { entityAuthorizationProfileHash } from "../../../server/packages/services/records/src/entity-authorization-rollout.js";
import type {
  VerifiedRequestContext,
  EffectiveAuthorizationEvidence,
} from "../../../server/packages/contracts/auth/src/index.js";

const output = process.argv[2];
if (!output)
  throw new Error(
    "Usage: pnpm exec tsx qualify-entity-authorization.mts <output.json>",
  );
const load = (name: string) =>
  parseEntityAuthorizationProfile(
    JSON.parse(
      readFileSync(
        `packages/contracts/platform/fixtures/entity-authorization/${name}.v1.json`,
        "utf8",
      ),
    ),
  );
const bp = load("business-partner"),
  company = load("company-invoice"),
  child = load("independent-document"),
  authority = createPermissionAuthorizer();
const scopeKind = (key: string) =>
  ({
    companyCodeId: "company_code",
    operatingOrganizationId: "operating_organization",
    workspaceId: "workspace",
    networkRelationshipId: "network_relationship",
  })[key];
function identity(
  profile: typeof bp,
  grants: readonly {
    permission: string;
    kind: string;
    target: string;
    deny?: boolean;
  }[],
): VerifiedRequestContext {
  const evidence: EffectiveAuthorizationEvidence[] = grants.map((g) => ({
    permissionCode: g.permission,
    effect: g.deny ? "deny" : "allow",
    proof: g.deny ? "deny" : "role",
    scopeKind: g.kind,
    targetId: g.target,
    scopeTargetId: `scope-${g.kind}-${g.target}`,
    propagationMode: "exact",
  }));
  return {
    planeKey: "neon",
    tenantId: "tenant",
    principalId: "synthetic-persona",
    realmKey: "athyper",
    authEpoch: 1,
    profileHash: "profile",
    requestId: "synthetic-request",
    permissions: {
      planeKey: "neon",
      tenantId: "tenant",
      principalId: "synthetic-persona",
      principalFingerprint: "synthetic",
      profileHash: "profile",
      schemaHash: "schema",
      resolvedAt: 1,
      allowed: [
        ...new Set(grants.filter((g) => !g.deny).map((g) => g.permission)),
      ],
      denied: [],
      planLocked: [],
      planeExcluded: [],
      entries: [],
      authorizationScopes: [],
      evidence,
      operationBindings: profile.operations.map((o) => ({
        entityCode: profile.entityCode,
        operationKey: o.key,
        permissionCode: o.permissionCode,
        decisionMode: "authorize",
        requiredScopeKinds: entityScopeResolvers[o.scope].map((key) =>
          scopeKind(key)!,
        ),
      })),
    },
  };
}
const adapter = (coordinates: EntityScopeCoordinates): EntityScopeAdapter => ({
  async resolve(input) {
    return {
      state: "resolved",
      coordinates: input.resolver === "tenant.record.v1" ? {} : coordinates,
    };
  },
  async preflight() {
    return "allowed";
  },
});
const read = "neon.relationship.business_partner.read",
  create = "neon.relationship.entity_case.create";
const scenarios = [
  {
    persona: "organization_requester",
    operation: "read",
    coordinates: {},
    grants: [
      { permission: read, kind: "operating_organization", target: "org-a" },
      { permission: create, kind: "operating_organization", target: "org-a" },
    ],
    expectedLegacy: "allowed",
    expectedTarget: "denied",
  },
  {
    persona: "organization_requester_unscoped_action",
    operation: "amend_partner",
    coordinates: {},
    grants: [
      { permission: read, kind: "operating_organization", target: "org-a" },
      { permission: create, kind: "operating_organization", target: "org-a" },
    ],
    expectedLegacy: "denied",
    expectedTarget: "denied",
  },
  {
    persona: "prospective_steward_requester_not_provisioned",
    operation: "amend_partner",
    coordinates: {},
    grants: [
      { permission: read, kind: "tenant", target: "tenant" },
      {
        permission: "neon.relationship.business_partner.enter",
        kind: "tenant",
        target: "tenant",
      },
      { permission: create, kind: "operating_organization", target: "org-a" },
    ],
    expectedLegacy: "denied",
    expectedTarget: "context_required",
  },
  {
    persona: "explicit_deny",
    operation: "read",
    coordinates: {},
    grants: [
      { permission: read, kind: "tenant", target: "tenant" },
      { permission: read, kind: "tenant", target: "tenant", deny: true },
    ],
    expectedLegacy: "denied",
    expectedTarget: "denied",
  },
];
const comparisons = [];
for (const scenario of scenarios) {
  const context = identity(bp, scenario.grants),
    permissionCode = bp.operations.find(
      (o) => o.key === scenario.operation,
    )!.permissionCode;
  let legacy = await authority.authorize({
    context,
    permissionCode,
    resource: {
      tenantId: "tenant",
      businessPartnerId: "partner",
      ...scenario.coordinates,
    },
  });
  // Reproduce the existing BP directory-admitted read fallback only; never a mutation fallback.
  if (
    scenario.operation === "read" &&
    !legacy.allowed &&
    legacy.reason === "scope_not_contained"
  )
    legacy = await authority.authorize({ context, permissionCode });
  const evaluator = createEntityAccessEvaluator({
    profile: bp,
    authorityRevision: entityAuthorizationProfileHash(bp),
    authorizer: authority,
    scopes: adapter(scenario.coordinates),
  });
  const target = await evaluator.evaluate({
    context,
    operationKey: scenario.operation,
    recordId: "partner",
    phase: "discover",
    coordinates: scenario.coordinates,
  });
  assert.equal(legacy.allowed ? "allowed" : "denied", scenario.expectedLegacy);
  assert.equal(target.state, scenario.expectedTarget);
  comparisons.push({
    persona: scenario.persona,
    operation: scenario.operation,
    legacyState: legacy.allowed ? "allowed" : "denied",
    targetState: target.state,
    differs: (legacy.allowed ? "allowed" : "denied") !== target.state,
  });
}
// A context prompt is discoverability only: selected targets are independently reauthorized.
const prospective = scenarios.find(s => s.persona === "prospective_steward_requester_not_provisioned")!;
for (const organization of ["org-a", "org-b"]) {
  const evaluator = createEntityAccessEvaluator({profile: bp, authorityRevision: entityAuthorizationProfileHash(bp), authorizer: authority, scopes: adapter({operatingOrganizationId: organization})});
  const decision = await evaluator.evaluate({context: identity(bp, prospective.grants), operationKey: "amend_partner", recordId: "partner", phase: "execute", coordinates: {operatingOrganizationId: organization}});
  assert.equal(decision.state, organization === "org-a" ? "allowed" : "denied");
}
const companyContext = identity(company, [
  {
    permission: "qualification.invoice.read",
    kind: "company_code",
    target: "company-a",
  },
]);
const companyEvaluator = createEntityAccessEvaluator({
  profile: company,
  authorityRevision: entityAuthorizationProfileHash(company),
  authorizer: authority,
  scopes: adapter({ companyCodeId: "company-a" }),
});
assert.equal(
  (
    await companyEvaluator.evaluate({
      context: companyContext,
      operationKey: "read",
      recordId: "invoice",
      phase: "execute",
    })
  ).state,
  "allowed",
);
assert.equal(
  (
    await companyEvaluator.evaluate({
      context: companyContext,
      operationKey: "read",
      recordId: "invoice",
      phase: "execute",
      coordinates: { companyCodeId: "company-b" },
    })
  ).state,
  "denied",
);
const childContext = identity(child, [
  {
    permission: "qualification.document.read",
    kind: "workspace",
    target: "workspace-other",
  },
]);
const childEvaluator = createEntityAccessEvaluator({
  profile: child,
  authorityRevision: entityAuthorizationProfileHash(child),
  authorizer: authority,
  scopes: adapter({ workspaceId: "workspace-a" }),
});
assert.equal(
  await authorizeEntityRelationship({
    parent: companyEvaluator,
    parentInput: {
      context: companyContext,
      operationKey: "read",
      recordId: "invoice",
      phase: "execute",
    },
    child: childEvaluator,
    childInput: {
      context: childContext,
      operationKey: "read",
      recordId: "evidence",
      phase: "execute",
    },
  }),
  false,
);
const report = {
  schemaVersion: 1,
  kind: "synthetic_policy_qualification",
  generatedAt: new Date().toISOString(),
  scope:
    "Actual IAM evaluator with synthetic snapshots and storage adapters. Not live-session, database-row, workflow, browser or production qualification.",
  effectiveGrantsChanged: false,
  profileHashes: {
    businessPartner: entityAuthorizationProfileHash(bp),
    companyInvoice: entityAuthorizationProfileHash(company),
    independentDocument: entityAuthorizationProfileHash(child),
  },
  comparisons,
  rawDifferenceCount: comparisons.filter((c) => c.differs).length,
  dispositionStatus: "not_assessed",
  fixtureChecks: {
    selectedOrganizationReauthorized: true,
    unauthorizedOrganizationDenied: true,
    hypotheticalPersonaNotProvisioned: true,
    companyOwnership: true,
    companyConflictDenied: true,
    independentChildDenied: true,
  },
  activationEligible: false,
};
mkdirSync(dirname(resolve(output)), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({
    output,
    comparisons: comparisons.length,
    rawDifferenceCount: report.rawDifferenceCount,
    activationEligible: false,
  }),
);
