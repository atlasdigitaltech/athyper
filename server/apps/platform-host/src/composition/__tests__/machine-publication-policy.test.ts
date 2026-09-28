import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { calculateDefinitionHash } from "@athyper/server-platform-policy";
import { snapshotFromEvidence } from "@athyper/server-platform-iam";
import { canonicalJson, type ReferenceOnboardingPolicy } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createMachinePublicationPolicy, MACHINE_PUBLICATION_PERMISSION } from "../shared/publication/machine-policy.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const policy: ReferenceOnboardingPolicy = { schema: "athyper.dev-reference-onboarding/1", policyId: "test.enrollment", revision: 1,
    environment: "local", instance: "dev", preset: "devfull", entityId: id(1), changeSetId: id(2), authorPrincipalId: id(3), publisherPrincipalId: id(4),
    productHash: "a".repeat(64), contractHash: "b".repeat(64), descriptorHash: "c".repeat(64), targetPlanes: ["studio", "neon", "mesh"] };
  const hash = createHash("sha256").update(canonicalJson(policy)).digest("hex");
  const definition = { id: id(5), tenantId: id(6), name: "test.enrollment", entityType: "metadata.publication", versionNo: 1, priority: 100, evaluationMode: "first_match" as const, effectiveFrom: "2026-01-01",
    rules: [{ id: id(7), priority: 10, condition: { "==": [{ var: "environment" }, "dev"] }, action: "allow" as const,
      actionConfig: { schema: "athyper.machine-publication-enrollment/1", environment: "dev", permissionCode: MACHINE_PUBLICATION_PERMISSION, tenantId: id(6), policy }, metadata: {} }] };
  const definitionHash = calculateDefinitionHash(definition);
  let active = true, altered = false;
  let reviewed: { created_by: string; submitted_by: string; approved_by: string }[] = [];
  const query = vi.fn(async (text: string) => ({ rows: text.includes("definition.id AS definition_id") ? [{
    definition_id: definition.id, tenant_id: definition.tenantId, entity_type: definition.entityType, policy_name: definition.name,
    definition_priority: 100, evaluation_mode: "first_match", effective_from: definition.effectiveFrom, effective_until: null, version_no: 1, definition_hash: definitionHash,
    rule_id: id(7), rule_priority: 10, condition_expr: definition.rules[0]!.condition, action_code: altered ? "deny" : "allow", action_config: definition.rules[0]!.actionConfig,
    score: null, confidence: null, explanation: null, approver_rules: null, sla_hours: null, rule_metadata: {},
  }] : text.includes("FROM metadata.entity_change_set") ? reviewed : text.includes("publication_policy_enrollment_is_active") ? [{ active }] : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const options = { database: db, tenantId: id(6), environment: "local", instance: "dev", domainSuffix: "dev.athyper.test", pin: { id: id(5), version: 1, hash: definitionHash } };
  return { db, query, options, policy, hash, review: (rows: typeof reviewed) => { reviewed = rows; }, revoke: () => { active = false; }, alter: () => { altered = true; } };
}
it("reads the exact policy, independent activation and current revocation state", async () => {
  const f = fixture();
  try {
    const authority = createMachinePublicationPolicy(f.options);
    await expect(authority.assertAuthorized(f.hash, f.policy)).resolves.toBeUndefined();
    expect(f.query.mock.calls.some(([q]) => q.includes("publication_policy_enrollment_is_active"))).toBe(true);
    const activationSql = readFileSync(new URL("../../../../../db/ddl/planes/studio/control/13_publication_policy_evidence.sql", import.meta.url), "utf8");
    expect(activationSql).toContain("d.updated_by<>d.created_by");
    expect(activationSql).toContain("newer.version_no>=d.version_no");
    f.revoke(); await expect(authority.assertAuthorized(f.hash, f.policy)).rejects.toThrow("NOT_ACTIVE");
  } finally { await f.db.destroy(); }
});
it.each(["qa", "staging", "production"])("rejects %s before querying policy storage", async environment => {
  const f = fixture();
  try {
    expect(() => createMachinePublicationPolicy({ ...f.options, environment: environment === "qa" ? "local" : environment, instance: environment })).toThrow("DEV_ONLY");
    expect(f.query).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("rejects tampered definitions and changed source pins", async () => {
  const f = fixture();
  try {
    const authority = createMachinePublicationPolicy(f.options);
    await expect(authority.assertAuthorized(f.hash, { ...f.policy, contractHash: "d".repeat(64) })).rejects.toThrow("MISMATCH");
    f.alter(); await expect(authority.assertAuthorized(f.hash, f.policy)).rejects.toThrow("UNAVAILABLE");
  } finally { await f.db.destroy(); }
});
it("does not grant machine publication from policy alone or reuse human permission", async () => {
  const f = fixture();
  const identity = { planeKey: "studio" as const, realmKey: "studio", tenantId: id(6), principalId: id(4), authEpoch: 0 };
  const permissions = snapshotFromEvidence(identity, [], Date.now());
  const context = { ...identity, permissions, profileHash: permissions.profileHash, requestId: id(10) };
  try {
    const authorizer = createMachinePublicationPolicy(f.options).authorizer(f.hash, f.policy);
    expect((await authorizer.authorize({ context, permissionCode: MACHINE_PUBLICATION_PERMISSION })).allowed).toBe(false);
    expect((await authorizer.authorize({ context, permissionCode: "studio.metadata.contract.publish" })).allowed).toBe(false);
  } finally { await f.db.destroy(); }
});

it.each(["edit", "submit", "review"] as const)("requires enrolled actor, grant and source for %s", async action => {
  const f = fixture();
  const permissionCode = `studio.metadata.contract.${action}`;
  const principalId = action === "review" ? id(4) : id(3);
  const identity = { planeKey: "studio" as const, realmKey: "studio", tenantId: id(6), principalId, authEpoch: 0 };
  const permissions = snapshotFromEvidence(identity, [{ permissionCode, effect: "allow", proof: "role", scopeKind: "tenant",
    scopeTargetId: id(6), targetId: id(6), propagationMode: "exact" }], Date.now(),
    [{ permissionCode, moduleId: id(11), riskTier: "high", requiresMfa: false, requiresSod: false, entitled: true }]);
  const context = { ...identity, permissions, profileHash: permissions.profileHash, requestId: id(10) };
  const resource = { tenantId: id(6), changeSetId: f.policy.changeSetId, entityId: f.policy.entityId };
  try {
    const authorizer = createMachinePublicationPolicy(f.options).authorizer(f.hash, f.policy);
    expect((await authorizer.authorize({ context, resource, permissionCode })).allowed).toBe(false);
    f.review([{ created_by: id(9), submitted_by: action === "review" ? id(3) : "", approved_by: "" }]);
    expect((await authorizer.authorize({ context, resource, permissionCode })).allowed).toBe(true);
    expect((await authorizer.authorize({ context, resource: { ...resource, changeSetId: id(99) }, permissionCode })).allowed).toBe(false);
    expect((await authorizer.authorize({ context: { ...context, principalId: id(8) }, resource, permissionCode })).allowed).toBe(false);
    f.review([{ created_by: id(4), submitted_by: id(3), approved_by: "" }]);
    expect((await authorizer.authorize({ context, resource, permissionCode })).allowed).toBe(false);
  } finally { await f.db.destroy(); }
});

it.each([
  ["original workload maker", id(3), id(3), id(4), true],
  ["trusted importer maker", id(9), id(3), id(4), true],
  ["reviewer is original maker", id(4), id(3), id(4), false],
  ["wrong submitter", id(9), id(8), id(4), false],
  ["wrong reviewer", id(9), id(3), id(8), false],
  ["missing maker", "", id(3), id(4), false],
] as const)("checks persisted actor separation: %s", async (_name, maker, submitter, reviewer, allowed) => {
  const f = fixture();
  const identity = { planeKey: "studio" as const, realmKey: "studio", tenantId: id(6), principalId: id(4), authEpoch: 0 };
  const permissions = snapshotFromEvidence(identity, [{ permissionCode: MACHINE_PUBLICATION_PERMISSION,
    effect: "allow", proof: "role", scopeKind: "tenant", scopeTargetId: id(6), targetId: id(6), propagationMode: "exact" }], Date.now(),
    [{ permissionCode: MACHINE_PUBLICATION_PERMISSION, moduleId: id(11), riskTier: "critical", requiresMfa: false, requiresSod: true, entitled: true }]);
  const context = { ...identity, permissions, profileHash: permissions.profileHash, requestId: id(10) };
  const resource = { tenantId: id(6), changeSetId: f.policy.changeSetId, entityId: f.policy.entityId };
  try {
    const authorizer = createMachinePublicationPolicy(f.options).authorizer(f.hash, f.policy);
    // Real grants and an active policy still cannot supply missing review evidence.
    expect((await authorizer.authorize({ context, resource, permissionCode: MACHINE_PUBLICATION_PERMISSION })).allowed).toBe(false);
    f.review([{ created_by: maker, submitted_by: submitter, approved_by: reviewer }]);
    expect((await authorizer.authorize({ context, resource, permissionCode: MACHINE_PUBLICATION_PERMISSION })).allowed).toBe(allowed);
    const sourceSql = f.query.mock.calls.find(([q]) => q.includes("FROM metadata.entity_change_set"))![0];
    expect(sourceSql).toContain("tenant_id IS NULL AND status='approved'");
    expect(sourceSql).toContain("entity_id=");
    f.review([{ created_by: maker, submitted_by: submitter, approved_by: reviewer }, { created_by: maker, submitted_by: submitter, approved_by: reviewer }]);
    expect((await authorizer.authorize({ context, resource, permissionCode: MACHINE_PUBLICATION_PERMISSION })).allowed).toBe(false);
  } finally { await f.db.destroy(); }
});
