import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import type { DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { buildSharedReferenceGraph } from "../authoring/graph-builder.js";
import { compileGraph } from "../deterministic.js";
import { assertEntitySuccessorSource } from "../publication/successor-source.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const base = buildSharedReferenceGraph({ entityCode: "example", title: "Examples", storageObject: "example", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }] }, "studio");
  const graph = { ...base, surfaces: base.surfaces?.map(s => s.surfaceKind !== "list" ? s : { ...s, layoutConfig: { ...s.layoutConfig,
    systemReferenceProduct: { schema: "athyper.system-reference-source/1", productHash: "a".repeat(64), moduleCode: "ent", targetPlanes: ["studio", "neon", "mesh"] } } }) };
  const artifact = compileGraph(graph);
  const policy: DevEntitySuccessorPolicy = { schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: id(1),
    policyId: "example.successor", revision: 1, entityId: id(2), changeSetId: id(3), contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash,
    authorPrincipalId: id(4), publisherPrincipalId: id(5), predecessor: { authoringReleaseId: id(6), authoringReleaseNo: 1, authoringReleaseHash: "b".repeat(64),
      publicationReleaseId: id(7), publicationReleaseNo: 1, publicationReleaseHash: "c".repeat(64), revisionId: id(8), contractHash: "d".repeat(64) },
    compiler: { name: "example.compiler", version: "1.1.0", buildHash: "e".repeat(64) }, targets: [{ plane: "studio", environment: "local", instance: "dev",
      publicationKey: "metadata.reference.example", appliedReleaseId: id(9), sourceReleaseId: id(7), sourceReleaseNo: 1, artifactHash: "f".repeat(64), headVersion: 1 }] };
  let present = true;
  const query = vi.fn(async (text: string) => ({ rows: text.includes("fn_entity_successor_enrollment_source") && present ? [{ graph }] : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  return { policy, graph, query, db, missing: () => { present = false; } };
}
it("reads current persisted graph and recompiles source pins inside the allocation-lock transaction", async () => {
  const f = fixture();
  try {
    await f.db.transaction().execute(tx => assertEntitySuccessorSource(tx, f.policy, f.policy.authorityTenantId));
    expect(f.query.mock.calls[1]![0]).toContain("pg_advisory_xact_lock");
    expect(f.query.mock.calls.some(([q]) => q.includes("fn_entity_successor_enrollment_source"))).toBe(true);
  } finally { await f.db.destroy(); }
});
it.each(["authority", "predecessor", "saved", "contract", "descriptor"])("denies %s drift without publication writes", async kind => {
  const f = fixture();
  try {
    if (kind === "predecessor") f.missing();
    if (kind === "saved") f.query.mockImplementation(async text => ({ rows: text.includes("fn_entity_successor_enrollment_source") ? [{ graph: { ...f.graph, entity: { ...f.graph.entity, entityCode: "changed" } } }] : [] }));
    const input = { ...f.policy, ...(kind === "contract" ? { contractHash: "0".repeat(64) } : {}), ...(kind === "descriptor" ? { descriptorHash: "0".repeat(64) } : {}) };
    await expect(f.db.transaction().execute(tx => assertEntitySuccessorSource(tx, input, kind === "authority" ? id(99) : input.authorityTenantId))).rejects.toThrow(kind === "saved" ? "META_ENTITY_GRAPH_INVALID" : "ENTITY_SUCCESSOR_");
    expect(f.query.mock.calls.some(([q]) => /INSERT|UPDATE metadata|fn_activate/.test(q))).toBe(false);
  } finally { await f.db.destroy(); }
});
it("requires a caller-owned transaction", async () => {
  const f = fixture();
  try { await expect(assertEntitySuccessorSource(f.db, f.policy, f.policy.authorityTenantId)).rejects.toThrow("TRANSACTION_REQUIRED"); }
  finally { await f.db.destroy(); }
});
it("enforces source-check import ownership, including dynamic-import bypasses", () => {
  const text = readFileSync(new URL("../publication/successor-source.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("successor-source.ts", text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["kysely", "@athyper/server-contract-publication", "@athyper/server-contract-meta-entity-authoring", "../deterministic.js", "../compilation/target-compiler.js"]);
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(tree) === "require"))) throw Error("Import bypass");
    node.forEachChild(visit);
  }
  visit(tree); expect(text).not.toMatch(/country|currency|business_partner/);
});
