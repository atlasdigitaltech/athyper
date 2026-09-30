import { expect, it } from "vitest";
import { buildSharedReferenceGraph, compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring";
import { parseCompilationRecoveryPolicy, type DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { validateCompilationRecoverySource } from "../compilation-recovery-source.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const graph = buildSharedReferenceGraph({ entityCode: "reference_example", title: "Example", storageObject: "reference_example", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }] }, "studio");
  const compiled = compileGraph(graph);
  const original: DevEntitySuccessorPolicy = { schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: id(1), policyId: "example.successor", revision: 1,
    entityId: id(2), changeSetId: id(3), contractHash: compiled.contractHash, descriptorHash: compiled.descriptorHash, authorPrincipalId: id(4), publisherPrincipalId: id(5),
    predecessor: { authoringReleaseId: id(6), authoringReleaseNo: 1, authoringReleaseHash: "c".repeat(64), publicationReleaseId: id(7), publicationReleaseNo: 1, publicationReleaseHash: "d".repeat(64), revisionId: id(8), contractHash: "e".repeat(64) },
    compiler: { name: "example.compiler", version: "1.1.0", buildHash: "f".repeat(64) },
    targets: [{ plane: "studio", environment: "local", instance: "dev", publicationKey: "metadata.entity.example", appliedReleaseId: id(10), sourceReleaseId: id(7), sourceReleaseNo: 1, artifactHash: "f".repeat(64), headVersion: 1 }] };
  const policy = parseCompilationRecoveryPolicy({ ...original, schema: "athyper.dev-compilation-recovery-policy/1", policyId: "example.recovery",
    failedReleaseId: id(20), failedReleaseHash: "b".repeat(64), failedJobId: id(21), originalCompilerHash: original.compiler.buildHash,
    compiler: { ...original.compiler, buildHash: "a".repeat(64) }, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  return { policy, evidence: { graph, originalPolicy: original, releaseId: id(20), releaseHash: "b".repeat(64) } };
}
it("recovers only the original immutable source, not a modified graph", () => {
  const f = fixture();
  expect(validateCompilationRecoverySource(f.policy, f.evidence)).toEqual(f.evidence.graph);
  expect(() => validateCompilationRecoverySource(f.policy, null)).toThrow("SOURCE_UNAVAILABLE");
  expect(() => validateCompilationRecoverySource(f.policy, { ...f.evidence, releaseHash: "0".repeat(64) })).toThrow();
  const graph = { ...f.evidence.graph, surfaces: f.evidence.graph.surfaces!.map(s => ({ ...s, title: "Changed" })) };
  expect(() => validateCompilationRecoverySource(f.policy, { ...f.evidence, graph })).toThrow("GRAPH_CHANGED");
});
it.each(["authorityTenantId", "entityId", "changeSetId", "contractHash", "descriptorHash", "authorPrincipalId", "publisherPrincipalId", "targets", "predecessor"] as const)("rejects changed original %s", key => {
  const f = fixture();
  const originalPolicy = { ...f.evidence.originalPolicy, [key]: key === "targets" ? f.evidence.originalPolicy.targets.map(t => ({ ...t, headVersion: 2 }))
    : key === "predecessor" ? { ...f.evidence.originalPolicy.predecessor, authoringReleaseHash: "0".repeat(64) }
    : key.endsWith("Id") ? id(99) : "0".repeat(64) };
  expect(() => validateCompilationRecoverySource(f.policy, { ...f.evidence, originalPolicy })).toThrow();
});
it("rejects expired authority and a different original compiler", () => {
  const f = fixture();
  expect(() => validateCompilationRecoverySource({ ...f.policy, expiresAt: new Date(Date.now() - 1).toISOString() }, f.evidence)).toThrow("EXPIRED");
  expect(() => validateCompilationRecoverySource({ ...f.policy, originalCompilerHash: "0".repeat(64) }, f.evidence)).toThrow("COMPILER_CHANGED");
});
