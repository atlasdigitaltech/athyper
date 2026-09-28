import { generateKeyPairSync, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import type { MetaEntityAuthoringRepository, MetaEntityChangeSet } from "@athyper/server-contract-meta-entity-authoring";
import { MetaEntityAuthoringService } from "../authoring-service.js";
import { buildSharedReferenceGraph } from "../authoring/graph-builder.js";
import { canonicalJson, compileGraph } from "../deterministic.js";
import { ReferenceFirstPublicationWorkflow, EntitySuccessorPublicationWorkflow, type ReferenceFirstPublicationPorts, type ReferenceOnboardingPolicy } from "../publication/publication-workflow.js";
import type { DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  let graph = buildSharedReferenceGraph({ entityCode: "sample_reference", title: "Samples", storageObject: "sample_reference", codeField: "code", titleField: "code",
    fields: [{ key: "id", label: "ID", type: "uuid", required: true }, { key: "code", label: "Code", type: "string", required: true }],
    columns: ["code"], searchFields: ["code"], sections: [{ key: "main", label: "Main", fields: ["code"] }],
  }, "studio");
  graph = { ...graph, surfaces: graph.surfaces?.map(s => s.surfaceKind !== "list" ? s : { ...s, layoutConfig: { ...s.layoutConfig,
    systemReferenceProduct: { schema: "athyper.system-reference-source/1", productHash: "a".repeat(64), moduleCode: "ent", targetPlanes: ["studio", "neon", "mesh"] },
  } }) };
  const artifact = compileGraph(graph);
  const policy: ReferenceOnboardingPolicy = { schema: "athyper.dev-reference-onboarding/1", policyId: "test.onboarding", revision: 1, environment: "local", instance: "dev", preset: "devfull",
    changeSetId: id(1), entityId: id(2), productHash: "a".repeat(64), contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash,
    targetPlanes: ["studio", "neon", "mesh"], authorPrincipalId: id(3), publisherPrincipalId: id(4) };
  let current: MetaEntityChangeSet = { id: id(1), entityId: id(2), tenantId: null, entityCode: graph.entity.entityCode, status: "draft", revision: 1, branchCode: "import", createdBy: id(3) };
  const transition = vi.fn<MetaEntityAuthoringRepository["transition"]>(async input => {
    if (current.revision !== input.expectedRevision || current.status !== input.from) throw Error("stale");
    current = { ...current, status: input.to, revision: current.revision + 1,
      ...(input.to === "in_review" ? { submittedBy: input.actorId } : {}), ...(input.to === "approved" ? { approvedBy: input.actorId } : {}) };
    return current;
  });
  const createRelease = vi.fn<MetaEntityAuthoringRepository["createRelease"]>(async () => ({ id: id(5), releaseNo: 1 }));
  const unused = async (): Promise<never> => { throw Error("unexpected repository call"); };
  const repository: MetaEntityAuthoringRepository = {
    get: async () => current, loadGraph: async () => structuredClone(graph), transition, createRelease,
    recordValidation: vi.fn(async () => {}), recordTestRun: vi.fn(async () => {}), createDraft: unused, replaceGraph: unused, getSignedRelease: unused,
  };
  const keys = generateKeyPairSync("ed25519");
  const signer = { sign: vi.fn(async (value: typeof artifact) => ({ signatureAlgorithm: "Ed25519", signingKeyId: "test-key", signature: sign(null, Buffer.from(canonicalJson(value)), keys.privateKey).toString("base64") })) };
  const publication = { publish: vi.fn(async () => {}) };
  const service = new MetaEntityAuthoringService({ repository, signer, publication });
  const authorize = vi.fn(async (_permission: string, _changeSetId: string) => {});
  const ports: ReferenceFirstPublicationPorts = {
    assertPolicyAuthorized: vi.fn(async () => {}), withFirstPublication: async (_entityId, work) => work(),
    asWorkload: async (principalId, work) => work({ principalId, service, authorize }),
    qualify: vi.fn(async () => {}), record: vi.fn(async () => {}),
  };
  return { policy, ports, service, authorize, signer, publication, createRelease, transition, artifact, keys,
    changeGraph: () => { graph = { ...graph, entity: { ...graph.entity, entityCode: "changed" } }; },
    changeState: (change: Partial<MetaEntityChangeSet>) => { current = { ...current, ...change }; } };
}
it("uses real validation, independent review and Ed25519 signing before dispatch; never claims activation", async () => {
  const f = fixture();
  const result = await new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run();
  expect(result).toEqual({ status: "dispatched", release: { id: id(5), releaseNo: 1 }, targetPlanes: ["studio", "neon", "mesh"] });
  expect(f.authorize.mock.calls.map(c => c[0])).toEqual(["metadata.entity.author", "metadata.entity.submit", "metadata.entity.review", "metadata.entity.publish"]);
  expect(f.ports.qualify).toHaveBeenCalledTimes(3);
  expect(f.createRelease).toHaveBeenCalledWith(expect.objectContaining({ expectedSourceReleaseId: null, expectedContractHash: f.policy.contractHash, expectedRevision: 3 }));
  const signed = f.createRelease.mock.calls[0]![0].artifact;
  expect(verify(null, Buffer.from(canonicalJson(f.artifact)), f.keys.publicKey, Buffer.from(signed.signature, "base64"))).toBe(true);
  expect(f.publication.publish).toHaveBeenCalledOnce();
  expect(f.ports.record).toHaveBeenCalledWith(expect.objectContaining({ event: "qualified", embeddedTestCount: 0 }));
});
it("successor workflow passes an exact predecessor to ordinary release creation, not first-release authority", async () => {
  const f = fixture();
  const policy: DevEntitySuccessorPolicy = { schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: id(90),
    policyId: "example.successor", revision: 1, entityId: f.policy.entityId, changeSetId: f.policy.changeSetId,
    contractHash: f.policy.contractHash, descriptorHash: f.policy.descriptorHash, authorPrincipalId: f.policy.authorPrincipalId, publisherPrincipalId: f.policy.publisherPrincipalId,
    predecessor: { authoringReleaseId: id(80), authoringReleaseNo: 1, authoringReleaseHash: "a".repeat(64), publicationReleaseId: id(81), publicationReleaseNo: 1, publicationReleaseHash: "b".repeat(64), revisionId: id(82), contractHash: "c".repeat(64) },
    compiler: { name: "example.compiler", version: "1.1.0", buildHash: "d".repeat(64) },
    targets: f.policy.targetPlanes.map((plane, i) => ({ plane, environment: "local", instance: "dev", publicationKey: "metadata.reference.example", appliedReleaseId: id(100 + i), sourceReleaseId: id(81), sourceReleaseNo: 1, artifactHash: "e".repeat(64), headVersion: 1 })) };
  f.createRelease.mockResolvedValue({ id: id(5), releaseNo: 2 });
  const authorized = vi.fn(async () => {}), locked = vi.fn(async (_p, work) => work());
  const workflow = new EntitySuccessorPublicationWorkflow(policy, { ...f.ports, assertPolicyAuthorized: authorized, withSuccessorPublication: locked });
  await expect(workflow.run()).resolves.toMatchObject({ status: "dispatched", release: { releaseNo: 2 } });
  expect(authorized).toHaveBeenCalledWith(policy);
  expect(locked).toHaveBeenCalledWith(policy, expect.any(Function));
  expect(f.createRelease).toHaveBeenCalledWith(expect.objectContaining({ expectedSourceReleaseId: id(80), expectedContractHash: policy.contractHash }));
  expect(f.ports.record).toHaveBeenCalledWith(expect.objectContaining({ schema: "athyper.dev-entity-successor-evidence/1", event: "dispatched" }));
  authorized.mockRejectedValueOnce(Error("ENROLLMENT_REVOKED"));
  await expect(workflow.run()).rejects.toThrow("ENROLLMENT_REVOKED");
  expect(f.createRelease).toHaveBeenCalledTimes(1);
});
it.each(["production", "staging", "qa"])("rejects %s before any authority call", environment => {
  const f = fixture();
  expect(() => new ReferenceFirstPublicationWorkflow({ ...f.policy, environment } as ReferenceOnboardingPolicy, f.ports)).toThrow("DEV_ONLY");
  expect(f.ports.assertPolicyAuthorized).not.toHaveBeenCalled();
});
it("rejects untrusted onboarding policy before reading or mutating source", async () => {
  const f = fixture();
  f.ports.assertPolicyAuthorized = async () => { throw Error("policy not authorized"); };
  await expect(new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run()).rejects.toThrow("policy not authorized");
  expect(f.authorize).not.toHaveBeenCalled(); expect(f.signer.sign).not.toHaveBeenCalled();
});
it("requires qualification of every target before submission", async () => {
  const f = fixture();
  f.ports.qualify = async target => { if (target.targetPlane === "mesh") throw Error("missing capability"); };
  await expect(new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run()).rejects.toThrow("missing capability");
  expect(f.transition).not.toHaveBeenCalled(); expect(f.signer.sign).not.toHaveBeenCalled();
});
it("does not authorize a subset of the enrolled planes", async () => {
  const f = fixture();
  await expect(new ReferenceFirstPublicationWorkflow({ ...f.policy, targetPlanes: ["studio"] }, f.ports).run()).rejects.toThrow("ENROLLMENT_MISMATCH");
  expect(f.signer.sign).not.toHaveBeenCalled();
});
it("rejects a changed source between qualification and review", async () => {
  const f = fixture();
  f.ports.record = async event => { if (event.event === "qualified") f.changeGraph(); };
  await expect(new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run()).rejects.toThrow("SOURCE_MISMATCH");
  expect(f.signer.sign).not.toHaveBeenCalled();
});
it("enforces workload identity and does not treat reviewer permissions as proof of authentication", async () => {
  const f = fixture();
  f.ports.asWorkload = async (_principal, work) => work({ principalId: id(99), service: f.service, authorize: f.authorize });
  await expect(new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run()).rejects.toThrow("WORKLOAD_MISMATCH");
  expect(f.authorize).not.toHaveBeenCalled(); expect(f.signer.sign).not.toHaveBeenCalled();
});
it("requires durable review attribution before approval", async () => {
  const f = fixture();
  f.ports.record = async event => { if (event.event === "review_authorized") throw Error("evidence unavailable"); };
  await expect(new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run()).rejects.toThrow("evidence unavailable");
  expect(f.transition.mock.calls.map(c => c[0].to)).toEqual(["in_review"]);
  expect(f.signer.sign).not.toHaveBeenCalled();
});
it("resumes an independently approved source without manufacturing another approval", async () => {
  const f = fixture();
  f.changeState({ status: "approved", revision: 3, submittedBy: id(3), approvedBy: id(4) });
  await new ReferenceFirstPublicationWorkflow(f.policy, f.ports).run();
  expect(f.transition).not.toHaveBeenCalled(); expect(f.publication.publish).toHaveBeenCalledOnce();
});
it("checks the reviewed hash before invoking the actual signer", async () => {
  const f = fixture();
  f.changeState({ status: "approved", revision: 3, submittedBy: id(3), approvedBy: id(4) });
  await expect(f.service.publish({ changeSetId: id(1), expectedRevision: 3, actorId: id(4), targetPlanes: ["studio"], expectedSourceReleaseId: null, expectedContractHash: "b".repeat(64) })).rejects.toThrow("reviewed snapshot");
  expect(f.signer.sign).not.toHaveBeenCalled(); expect(f.createRelease).not.toHaveBeenCalled();
});
it("enforces explicit import boundaries for generic reference orchestration", () => {
  const text = readFileSync(new URL("../publication/publication-workflow.ts", import.meta.url), "utf8");
  const ast = ts.createSourceFile("publication-workflow.ts", text, ts.ScriptTarget.Latest, true);
  const allowed = new Set(["@athyper/server-contract-meta-entity-authoring", "@athyper/server-contract-publication", "../authoring-service.js", "../deterministic.js", "../compilation/target-compiler.js"]);
  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) expect(allowed.has(node.moduleSpecifier.text)).toBe(true);
    if (ts.isCallExpression(node)) expect(node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(ast) === "require").toBe(false);
    node.forEachChild(visit);
  }
  visit(ast);
  expect(text).not.toMatch(/country|currency|business_partner|process\.env/);
});
