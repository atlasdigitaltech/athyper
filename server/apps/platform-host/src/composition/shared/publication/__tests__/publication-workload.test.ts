import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { tryGetRequestContext } from "@athyper/server-foundation/context";
import type { AuditRecordInput } from "@athyper/server-contract-audit";
import type { MetaEntityChangeSet } from "@athyper/server-contract-meta-entity-authoring";
import { createPermissionAuthorizer } from "@athyper/server-platform-iam";
import { buildSharedReferenceGraph, canonicalJson, compileGraph, validateGraph, runContractTests, type ReferenceOnboardingPolicy } from "@athyper/server-plane-studio-meta-entity-authoring";
import { createReferencePublicationWorkload, type ReferencePublicationWorkloadConfiguration, type ReferencePublicationWorkloadDependencies } from "../workload.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const base = buildSharedReferenceGraph({ entityCode: "test_reference", title: "Test", storageObject: "test_reference", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
  }, "studio");
  const graph = { ...base, surfaces: base.surfaces?.map(s => s.surfaceKind !== "list" ? s : { ...s, layoutConfig: { ...s.layoutConfig,
    systemReferenceProduct: { schema: "athyper.system-reference-source/1", productHash: "a".repeat(64), moduleCode: "ent", targetPlanes: ["studio", "neon", "mesh"] },
  } }) };
  const artifact = compileGraph(graph);
  const policy: ReferenceOnboardingPolicy = { schema: "athyper.dev-reference-onboarding/1", policyId: "test.publication", revision: 1, environment: "local", instance: "dev", preset: "devfull",
    changeSetId: id(1), entityId: id(2), productHash: "a".repeat(64), contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash, targetPlanes: ["studio", "neon", "mesh"], authorPrincipalId: id(3), publisherPrincipalId: id(4) };
  let current: MetaEntityChangeSet = { id: id(1), entityId: id(2), tenantId: null, entityCode: "test_reference", branchCode: "import", revision: 1, status: "draft", createdBy: id(3) };
  const credentials = { author: "x".repeat(43), publisher: "y".repeat(43) };
  const configuration: ReferencePublicationWorkloadConfiguration = { environment: "local", instance: "dev", domainSuffix: "dev.athyper.test", tenantId: id(5), realmKey: "test", policyHash: sha(canonicalJson(policy)), policy,
    author: { principalId: id(3), code: "test.author", authEpoch: 1, credentialSha256: sha(credentials.author) },
    publisher: { principalId: id(4), code: "test.publisher", authEpoch: 1, credentialSha256: sha(credentials.publisher) } };
  let epoch = 1, head = false;
  const query = vi.fn(async (text: string, _values?: unknown[]) => ({ rows: text.includes("information_schema.columns") ? [{ column_name: "id" }, { column_name: "code" }]
    : text.includes("SELECT s.scope_kind") ? [{ scope_kind: "tenant" }]
    : text.includes("AS admitted") ? [{ admitted: true }] : text.includes("FROM master.principal") ? [{ auth_epoch: epoch }]
    : text.includes("pg_try_advisory_xact_lock") ? [{ locked: true }] : text.includes("FROM metadata.entity_release") && head ? [{ id: id(9) }] : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const publish = vi.fn(async () => ({ release: { id: id(6), releaseNo: 1 }, artifact: { ...artifact, signatureAlgorithm: "Ed25519", signingKeyId: "test", signature: "fixture-only" } }));
  const service: ReferencePublicationWorkloadDependencies["service"] = {
    readGraph: async () => ({ changeSet: current, graph }),
    validate: async () => ({ ...validateGraph(graph), changeSetId: id(1), checkedRevision: current.revision }),
    test: async () => ({ ...runContractTests(graph), changeSetId: id(1), checkedRevision: current.revision }),
    submit: async input => { current = { ...current, status: "in_review", revision: 2, submittedBy: input.actorId }; return current; },
    approve: async input => { current = { ...current, status: "approved", revision: 3, approvedBy: input.actorId }; return current; }, publish,
  };
  const record = vi.fn(async (input: AuditRecordInput, transaction?: unknown) => {
    expect(transaction).toBeDefined(); expect(tryGetRequestContext()?.principalId).toBe(input.actor.principalId);
    return { ...input, id: id(7), occurredAt: "2026-09-26T00:00:00.000Z", severity: input.severity ?? "info" };
  });
  const authorize = vi.fn(async (_input: Parameters<ReferencePublicationWorkloadDependencies["authorizer"]["authorize"]>[0]) => ({ allowed: true as const, reason: "allowed" as const }));
  const assertAuthorized = vi.fn(async () => {});
  const dependencies: ReferencePublicationWorkloadDependencies = { database: db, service, audit: { record }, authorizer: { authorize }, policyAuthority: { assertAuthorized }, targets: {
    databases: { studio: db, neon: db, mesh: db }, runtime: { qualify: vi.fn() }, qualifyCapabilities: vi.fn(async () => {}),
  } };
  return { configuration, credentials, dependencies, query, db, publish, record, authorize, assertAuthorized, revoke: () => { epoch++; }, existing: () => { head = true; } };
}
it("authenticates both workloads, rechecks exact-source authority and records tenant-stamped machine evidence", async () => {
  const f = fixture();
  try {
    expect((await createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).status).toBe("dispatched");
    expect(f.authorize).toHaveBeenCalledTimes(4);
    expect(f.authorize.mock.calls.map(([input]) => input.permissionCode)).toEqual([
      "studio.metadata.contract.edit", "studio.metadata.contract.submit", "studio.metadata.contract.review", "studio.metadata.contract.publish",
    ]);
    for (const [input] of f.authorize.mock.calls) {
      expect(input).toMatchObject({ context: { planeKey: "studio", tenantId: id(5), authEpoch: 1 }, resource: { tenantId: id(5), recordId: id(1), entityId: id(2) } });
      expect(input.context.permissions.allowed).toEqual([]); // No permissions fabricated from policy or credentials.
      expect(input.context.authenticationMethods).toBeUndefined();
    }
    expect(f.query.mock.calls.some(([text]) => text.includes("WITH RECURSIVE scope_tree"))).toBe(true);
    expect(f.record.mock.calls.map(([input]) => input.actor.principalId)).toEqual([id(3), id(4), id(4)]);
    for (const [input] of f.record.mock.calls) {
      expect(input.metadata).toMatchObject({ mode: "development_auto_approval", sourceTenantId: null, policyHash: f.configuration.policyHash });
      expect(JSON.stringify(input)).not.toContain(f.credentials.author);
      expect(JSON.stringify(input)).not.toContain(f.credentials.publisher);
    }
    const authRead = f.query.mock.calls.find(([text]) => text.includes("FROM master.principal"))![0];
    expect(authRead).toContain("principal_type='service_account'"); expect(authRead).toContain("status='active'");
  } finally { await f.db.destroy(); }
});
it.each(["credentials", "policy", "environment"])("rejects invalid %s before database access", async kind => {
  const f = fixture();
  if (kind === "credentials") f.credentials.publisher = "z".repeat(43);
  if (kind === "policy") Object.assign(f.configuration, { policyHash: "f".repeat(64) });
  if (kind === "environment") Object.assign(f.configuration, { instance: "qa" });
  try {
    expect(() => createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies)).toThrow();
    expect(f.query).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("does not equate valid credentials with onboarding policy approval", async () => {
  const f = fixture(); f.assertAuthorized.mockRejectedValueOnce(Error("unreviewed policy"));
  try {
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow("unreviewed policy");
    expect(f.publish).not.toHaveBeenCalled(); expect(f.record).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("stops when a workload is revoked between qualification and review", async () => {
  const f = fixture();
  Object.assign(f.dependencies.targets, { qualifyCapabilities: async () => { f.revoke(); } });
  try {
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow("REVOKED");
    expect(f.publish).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("preserves IAM denials and never continues after an audit write fails", async () => {
  const f = fixture();
  try {
    f.authorize.mockRejectedValueOnce(Error("IAM denied"));
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow("IAM denied");
    f.record.mockRejectedValueOnce(Error("audit unavailable"));
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow("audit unavailable");
    expect(f.publish).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("does not replay onboarding over an existing release", async () => {
  const f = fixture(); f.existing();
  try {
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow("FIRST_RELEASE_REQUIRED");
    expect(f.publish).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("uses only explicit generic package boundaries", () => {
  const text = readFileSync(new URL("../workload.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("reference-workflow.ts", text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["node:crypto", "kysely", "@athyper/server-contract-audit", "@athyper/server-contract-auth", "@athyper/server-platform-iam", "@athyper/server-foundation/context", "@athyper/server-plane-studio-meta-entity-authoring", "./target-qualification.js", "./machine-policy.js", "./enrollment-contract.js", "./successor-targets.js"]);
  allowed.add("@athyper/server-contract-jobs");
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node)) expect(node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require").toBe(false);
    node.forEachChild(visit);
  }
  visit(ast); expect(text).not.toMatch(/business_partner|country|currency|mfaVerified/);
});
it("valid policy and credentials cannot replace persisted IAM grants", async () => {
  const f = fixture();
  Object.assign(f.dependencies, { authorizer: createPermissionAuthorizer() });
  try {
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow("REFERENCE_WORKLOAD_IAM_DENIED");
    expect(f.publish).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it.each(["database", "storage", "permission", "capability"])("stops publication when target %s qualification fails", async kind => {
  const f = fixture();
  if (kind === "database") Object.assign(f.dependencies.targets, { databases: { studio: f.db } });
  if (kind === "storage" || kind === "permission") {
    const original = f.query.getMockImplementation()!;
    f.query.mockImplementation((text, values) => text.includes(kind === "storage" ? "information_schema.columns" : "SELECT s.scope_kind") ? Promise.resolve({ rows: [] }) : original(text, values));
  }
  if (kind === "capability") Object.assign(f.dependencies.targets, { qualifyCapabilities: async () => { throw Error("capability unavailable"); } });
  try {
    await expect(createReferencePublicationWorkload(f.configuration, f.credentials, f.dependencies).run()).rejects.toThrow();
    expect(f.publish).not.toHaveBeenCalled();
  } finally { await f.db.destroy(); }
});
it("keeps target qualification free of product imports and direct activation", () => {
  const path = new URL("../target-qualification.ts", import.meta.url);
  const text = readFileSync(path, "utf8"), ast = ts.createSourceFile(path.pathname, text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["kysely", "@athyper/server-contract-metadata", "@athyper/server-plane-studio-meta-entity-authoring", "./relationship-qualification.js"]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node)) expect(node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require").toBe(false);
    node.forEachChild(visit);
  }
  visit(ast); expect(text).not.toMatch(/business_partner|country|currency|fn_activate|INSERT INTO/);
});
