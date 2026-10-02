import { readFileSync } from "node:fs";
import { canonicalBytes, sha256 as hashBytes } from "@athyper/server-adapter-publication-signing";
import ts from "typescript";
import { Kysely, PostgresDialect } from "kysely";
import { afterEach, expect, it, vi } from "vitest";
import * as recoveryAuthority from "../compilation-recovery-authority.js";
import * as successorTargets from "../successor-targets.js";
import { compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { buildSharedReferenceGraph, compileSystemReferenceTarget, validateGraph, canonicalJson as graphCanonicalJson, sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";
import { compileCompiledEntityArtifacts, compiledEntityRuntimeProjection } from "@athyper/server-service-publication";
import { createCompiledRuntimePublication } from "../compiled-runtime.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
afterEach(() => vi.restoreAllMocks());
function fixture(advanced = false) {
  const capabilities = advanced ? JSON.parse(readFileSync(new URL("../../../../../../../../metadata/products/shared/entities/country/capabilities.json", import.meta.url), "utf8").replaceAll('"country"', '"test_dictionary"').replaceAll('country/operation#', 'test_dictionary/operation#')) : [];
  const graph = buildSharedReferenceGraph({ entityCode: "test_dictionary", title: "Dictionary", storageObject: "test_dictionary", codeField: "code", titleField: "code",
    capabilities,
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true },
      { key: "z_enabled", label: "Enabled", type: "boolean", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
    runtimeBindings: [ { operation: "list", handler: "entity.record.list.v1", resolver: "tenant.record.v1" },
      { operation: "read", handler: "entity.record.read.v1", resolver: "tenant.record.v1" } ],
  }, "studio");
  const saved = { ...graph,
    operationPermissions: graph.operationPermissions!.map((b, i) => ({ ...b, id: id(10 + i) })),
    operationScopeBindings: graph.operationScopeBindings!.map((b, i) => ({ ...b, id: id(20 + i) })),
    surfaces: graph.surfaces?.map(s => s.surfaceKind !== "list" ? s : { ...s, layoutConfig: { ...s.layoutConfig,
    systemReferenceProduct: { schema: "athyper.system-reference-source/1", productHash: "a".repeat(64), moduleCode: "ent", targetPlanes: ["studio", "neon", "mesh"] } } }) };
  const generatedAt = "2026-09-27T00:00:00.000Z";
  expect(validateGraph(saved).issues).toEqual([]);
  let available = true;
  const rows = (["studio", "neon", "mesh"] as const).map(plane => ({ publication_release_id: id(1), release_key: "metadata.reference.test_dictionary", release_no: 1,
    source_tenant_id: null, source_entity_id: id(6), source_release_hash: "e".repeat(64), revision_id: id(2), entity_code: "test_dictionary", contract_json: saved,
    compiled_json: compileSystemReferenceTarget(saved, plane).artifact.descriptor, plane_key: plane, created_at: generatedAt, target_planes: ["studio", "neon", "mesh"] }));
  const query = vi.fn(async (text: string) => ({ rows: text.includes("FROM master.principal") ? [{ id: id(4) }]
    : text.includes("fn_compiled_entity_compilation_source") ? available ? rows : []
    : text.includes("information_schema.columns") ? [{ column_name: "id" }, { column_name: "code" }, { column_name: "z_enabled" }]
    : text.includes("information_schema.tables") ? [{ name: "shared.test_dictionary" }]
    : text.includes("SELECT s.scope_kind") ? [{ scope_kind: "tenant" }]
    : text.includes("p.canonical_code code") ? ["common.platform.reference.view", ...new Set<string>(graph.capabilities?.flatMap(c => c.binding?.actions.map(a => a.permissionCode) ?? []) ?? [])].map((code, i) => ({ id: id(100 + i), kind: "capability", code, scopeKinds: ["tenant"] })) : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const runtime = { qualify: vi.fn() }, qualifyCapabilities = vi.fn(async () => {});
  const adapter = createCompiledRuntimePublication({ authority: db, configuration: { environment: "local", instance: "dev", domainSuffix: "dev.athyper.test", tenantId: id(5), realmKey: "test",
    author: { principalId: id(3), code: "dev.metadata.author", authEpoch: 0, credentialSha256: "a".repeat(64) },
    publisher: { principalId: id(4), code: "dev.metadata.publisher", authEpoch: 0, credentialSha256: "b".repeat(64) } },
    targets: () => ({ databases: { studio: db, neon: db, mesh: db }, runtime, qualifyCapabilities }) });
  const source = { releaseId: id(1), releaseNo: 1, publicationKey: rows[1]!.release_key, plane: "neon" as const, tenantId: null,
    entityCode: "test_dictionary", sourceEntityId: id(6), sourceReleaseHash: "e".repeat(64), revisionId: id(2), sourceContractHash: sha256(saved), sourceDescriptorHash: sha256(rows[1]!.compiled_json),
    generatedAt, native: rows[1]!.compiled_json as unknown as Record<string, unknown>, contract: saved as unknown as Record<string, unknown> };
  return { db, rows, query, adapter, source, runtime, qualifyCapabilities, revoke: () => { available = false; } };
}
it("lowers only persisted approved source and requalifies each phase against that source", async () => {
  const f = fixture();
  try {
    const lowered = await f.adapter.lower(f.source);
    const projection = compiledEntityRuntimeProjection(compileCompiledEntityArtifacts({ ...lowered, registry: await f.adapter.registry("neon"),
      canonicalizer: { canonicalBytes, sha256: b => `sha256:${hashBytes(b)}` } }), f.source.generatedAt, f.source.entityCode);
    const pins = { releaseId: f.source.releaseId, publicationKey: f.source.publicationKey, plane: f.source.plane, projection,
      sourceRevisionId: f.source.revisionId, sourceContractHash: f.source.sourceContractHash, sourceDescriptorHash: f.source.sourceDescriptorHash };
    // The graph canonicalizer sorts arrays that are ordered in runtime artifacts.
    // This regression must cross the actual signing/qualification boundary.
    const graphNormalizedProjection = compiledEntityRuntimeProjection(compileCompiledEntityArtifacts({ ...lowered,
      registry: await f.adapter.registry("neon"), canonicalizer: {
        canonicalBytes: value => Buffer.from(graphCanonicalJson(value)), sha256: bytes => `sha256:${hashBytes(bytes)}`,
      } }), f.source.generatedAt, f.source.entityCode);
    expect(graphNormalizedProjection).not.toEqual(projection);
    await expect(f.adapter.qualify({ ...pins, projection: graphNormalizedProjection, phase: "compile" })).rejects.toThrow("PROJECTION_SOURCE_MISMATCH");
    const receipts = [];
    for (const phase of ["compile", "sign", "dispatch"] as const) receipts.push(await f.adapter.qualify({ ...pins, phase }));
    expect(new Set(receipts.map(r => r.receiptSha256)).size).toBe(1);
    expect(f.runtime.qualify).toHaveBeenCalledTimes(5);
    expect(f.qualifyCapabilities).toHaveBeenCalledTimes(5);
    await expect(f.adapter.qualify({ ...pins, phase: "sign", projection: { ...projection, generatedAt: "2026-09-28T00:00:00.000Z" } })).rejects.toThrow("PROJECTION_SOURCE_MISMATCH");
    f.revoke();
    await expect(f.adapter.qualify({ ...pins, phase: "dispatch" })).rejects.toThrow("APPROVED_SOURCE_REQUIRED");
  } finally { await f.db.destroy(); }
});
it.each(["pin", "native", "target", "runtime", "capability"])("rejects changed or unavailable %s", async failure => {
  const f = fixture();
  try {
    const source = structuredClone(f.source);
    if (failure === "pin") source.revisionId = id(90);
    if (failure === "native") source.native = {};
    if (failure === "target") f.rows.pop();
    if (failure === "runtime") f.runtime.qualify.mockImplementation(() => { throw Error("runtime unavailable"); });
    if (failure === "capability") f.qualifyCapabilities.mockRejectedValue(Error("capability unavailable"));
    await expect(f.adapter.lower(source)).rejects.toThrow();
  } finally { await f.db.destroy(); }
});
it.each(["studio", "neon", "mesh"] as const)("%s: advanced capabilities cross the real worker registry and qualification boundary", async plane => {
  const f = fixture(true);
  try {
    const row = f.rows.find(r => r.plane_key === plane)!;
    const source = { ...f.source, plane, native: row.compiled_json as unknown as Record<string, unknown>, sourceDescriptorHash: sha256(row.compiled_json) };
    const lowered = await f.adapter.lower(source);
    const registry = await f.adapter.registry(plane);
    const canonicalizer = { canonicalBytes, sha256: (b: Uint8Array) => `sha256:${hashBytes(b)}` };
    const projection = compiledEntityRuntimeProjection(compileCompiledEntityArtifacts({ ...lowered, registry, canonicalizer }), source.generatedAt, source.entityCode);
    await expect(f.adapter.qualify({ releaseId: source.releaseId, publicationKey: source.publicationKey, plane, projection,
      sourceRevisionId: source.revisionId, sourceContractHash: source.sourceContractHash, sourceDescriptorHash: source.sourceDescriptorHash, phase: "compile" })).resolves.toHaveProperty("receiptSha256");
    const handlers = new Set(registry.handlers);
    handlers.delete("platform.comments.reply.v1");
    expect(() => compileCompiledEntityArtifacts({ ...lowered, registry: { ...registry, handlers }, canonicalizer })).toThrow(/unregistered handler/);
    const permissions = new Set(registry.permissions);
    permissions.delete("common.collaboration.attachment.download");
    expect(() => compileCompiledEntityArtifacts({ ...lowered, registry: { ...registry, permissions }, canonicalizer })).toThrow(/unregistered handler/);
  } finally { await f.db.destroy(); }
});
it("rechecks recovery at every phase and binds its approval into the qualification receipt", async () => {
  const f = fixture();
  const graph = f.rows[0]!.contract_json;
  const compiled = compileGraph(graph);
  const targets = (["studio", "neon", "mesh"] as const).map(plane => ({ plane, environment: "local" as const, instance: "dev" as const,
    publicationKey: f.source.publicationKey, appliedReleaseId: id(50), sourceReleaseId: id(51), sourceReleaseNo: 1, artifactHash: "a".repeat(64), headVersion: 1 }));
  const policy: DevEntitySuccessorPolicy = { schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev",
    authorityTenantId: id(5), policyId: "example.successor", revision: 1, entityId: id(6), changeSetId: id(7),
    contractHash: compiled.contractHash, descriptorHash: compiled.descriptorHash, authorPrincipalId: id(3), publisherPrincipalId: id(4),
    compiler: { name: "example.compiler", version: "1.0.0", buildHash: "0".repeat(64) }, targets,
    predecessor: { authoringReleaseId: id(50), authoringReleaseNo: 1, authoringReleaseHash: "a".repeat(64), publicationReleaseId: id(51),
      publicationReleaseNo: 1, publicationReleaseHash: "b".repeat(64), revisionId: id(52), contractHash: "c".repeat(64) } };
  f.rows.forEach(row => Object.assign(row, { release_no: 2, successor_policy: policy }));
  const source = { ...f.source, releaseNo: 2, expectedPredecessor: targets[1]! };
  const evidence = { id: id(60), version: 1, hash: "d".repeat(64), policyHash: "e".repeat(64), compilerHash: "f".repeat(64) };
  const find = vi.spyOn(recoveryAuthority, "findCompilationRecovery").mockResolvedValue({ graph, evidence });
  vi.spyOn(successorTargets, "assertSuccessorTargetHeads").mockResolvedValue();
  try {
    const lowered = await f.adapter.lower(source);
    const projection = compiledEntityRuntimeProjection(compileCompiledEntityArtifacts({ ...lowered, registry: await f.adapter.registry("neon"),
      canonicalizer: { canonicalBytes, sha256: b => `sha256:${hashBytes(b)}` } }), source.generatedAt, source.entityCode);
    const pins = { releaseId: source.releaseId, publicationKey: source.publicationKey, plane: source.plane, projection,
      sourceRevisionId: source.revisionId, sourceContractHash: source.sourceContractHash, sourceDescriptorHash: source.sourceDescriptorHash,
      expectedPredecessor: source.expectedPredecessor };
    const receipts = [];
    for (const phase of ["compile", "sign", "dispatch"] as const) {
      const before = find.mock.calls.length;
      receipts.push(await f.adapter.qualify({ ...pins, phase }));
      expect(find.mock.calls.length).toBeGreaterThan(before);
    }
    expect(new Set(receipts.map(r => r.receiptSha256)).size).toBe(1);
    find.mockResolvedValue({ graph, evidence: { ...evidence, hash: "9".repeat(64) } });
    expect((await f.adapter.qualify({ ...pins, phase: "sign" })).receiptSha256).not.toBe(receipts[0]!.receiptSha256);
    find.mockRejectedValue(Error("COMPILATION_RECOVERY_EXACT_AUTHORITY_REQUIRED"));
    for (const phase of ["compile", "sign", "dispatch"] as const)
      await expect(f.adapter.qualify({ ...pins, phase })).rejects.toThrow("EXACT_AUTHORITY_REQUIRED");
  } finally { await f.db.destroy(); }
});
it("keeps the host adapter product-free with an explicit import boundary", () => {
  const source = readFileSync(new URL("../compiled-runtime.ts", import.meta.url), "utf8");
  const allowed = new Set(["@athyper/server-platform-ai", "@athyper/server-adapter-publication-signing", "kysely", "@athyper/server-contract-meta-entity-authoring", "@athyper/server-contract-publication", "@athyper/server-plane-studio-meta-entity-authoring", "@athyper/server-service-publication", "./target-qualification.js", "./workload-configuration.js", "./compiler-build.js", "./successor-targets.js", "./compilation-recovery-authority.js"]);
  for (const node of ts.createSourceFile("adapter.ts", source, ts.ScriptTarget.Latest, true).statements)
    if (ts.isImportDeclaration(node)) expect(allowed.has((node.moduleSpecifier as ts.StringLiteral).text)).toBe(true);
  expect(source).not.toMatch(/country|currency|business_partner/);
});

it("registers the installed UI Profile mutation policy without admitting arbitrary handler keys", async () => {
  const f = fixture();
  try {
    for (const plane of ["studio", "neon", "mesh"] as const) {
      const registry = await f.adapter.registry(plane);
      expect(registry.handlers.has("platform.experience.ui_profile.v1")).toBe(true);
      expect(registry.handlers.has("untrusted.ui_profile.v1")).toBe(false);
    }
  } finally { await f.db.destroy(); }
});
