import { expect, it, vi } from "vitest";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { AtlasLearningHandoff } from "@athyper/server-contract-metadata";
import { compileGraph, sha256 } from "./deterministic.js";
import { compileEntityAi } from "./entity-ai.js";
import { applyLearningCorrection } from "./learning-inbox.js";
import { cloneGraphIds } from "./graph-identity.js";
import { compileTenantLearningDescriptor, parseTenantLearningAncestry, prepareTenantLearningExtensionDraft, tenantLearningAncestry, type ProductLearningSource } from "./tenant-learning-extension.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const graph: MetaEntityGraph = { contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "country", entityClass: "reference", ownershipModel: "system" },
    runtimeProfiles: [{ profileKey: "default", backingKind: "virtual", apiExposure: "catalog_only", readMode: "none", writeMode: "none" }],
    fields: [{ id: id(20), fieldKey: "code", dataType: "string", typeConfig: { kind: "string" } }],
    operations: [{ operationKey: "read", operationKind: "read", label: "Read", auditEventCode: "country.read" }],
    surfaces: [{ surfaceKey: "detail", surfaceKind: "detail", title: "Country", layoutConfig: { ai: {
      schemaVersion: 1, enabled: true, aliases: ["country"], summaryFieldKeys: ["code"], searchFieldKeys: [],
      relationshipKeys: [], contextKinds: ["record"], insightProviders: [{ id: "entity_read_record", version: 1 }], actions: [], presentationProfiles: [],
    } } }] };
  const descriptor = { schema: "athyper.entity-runtime-descriptor/1.0", entityCode: "country", planeKey: "neon",
    storage: { schema: "shared", object: "country" }, authorization: { permission: "country.read" },
    ai: compileEntityAi(graph)!, controls: { export: false } };
  const source: ProductLearningSource = { sourceTenantId: null, entityId: id(1), entityCode: "country", moduleCode: "fnd",
    authoringReleaseId: id(2), publicationReleaseId: id(3), releaseNo: 13, plane: "neon",
    releaseHash: "e".repeat(64), contractHash: sha256(graph), descriptorHash: sha256(descriptor), graph, descriptor };
  const proposal: AtlasLearningHandoff = { schemaVersion: 1, candidateId: id(4), feedbackId: id(5), tenantId: id(6), submittedBy: id(7),
    originPlane: "neon", locale: "en", phrase: "country snapshot", capabilityId: "entity_read_record", entityCode: "country",
    sourceReleaseId: source.publicationReleaseId, sourceDescriptorHash: "a".repeat(64), sourceContractHash: "b".repeat(64),
    proposalHash: "c".repeat(64), expiresAt: "2099-01-01T00:00:00.000Z" };
  const ancestry = tenantLearningAncestry(source, proposal);
  const baselineGraph = cloneGraphIds(graph);
  const candidateGraph = applyLearningCorrection(baselineGraph, { ...proposal, sourceContractHash: compileGraph(baselineGraph).contractHash });
  return { graph, source, proposal, ancestry, baselineGraph, candidateGraph, tenantId: proposal.tenantId };
}

it("pins product and origin hashes separately and rejects caller-invented ancestry fields", () => {
  const f = fixture();
  expect(f.ancestry.productDescriptorHash).not.toBe(f.ancestry.originDescriptorHash);
  expect(parseTenantLearningAncestry(f.ancestry)).toEqual(f.ancestry);
  for (const value of [{ ...f.ancestry, approved: true }, { ...f.ancestry, productReleaseNo: 0 },
    { ...f.ancestry, productReleaseNo: "13" }, { ...f.ancestry, tenantId: null }, { ...f.ancestry, plane: "other" },
    { ...f.ancestry, productContractHash: "not-a-hash" }, { ...f.ancestry, originDescriptorHash: undefined }])
    expect(() => parseTenantLearningAncestry(value)).toThrow();
});
it("adds only one pinned vocabulary term while preserving the product descriptor and graph", () => {
  const f = fixture(), before = structuredClone(f.source);
  const result = compileTenantLearningDescriptor(f);
  expect(result.ai.vocabulary?.terms).toHaveLength(1);
  expect(result.tenantLearningAncestry).toEqual(f.ancestry);
  const { ai: _ai, tenantLearningAncestry: _pin, ...unchanged } = result;
  const { ai: _baseAi, ...base } = f.source.descriptor;
  expect(unchanged).toEqual(base);
  expect(f.source).toEqual(before);
  expect(compileTenantLearningDescriptor(f)).toEqual(result);
});
it.each(["tenantId", "productEntityId", "productAuthoringReleaseId", "productPublicationReleaseId", "productReleaseNo", "productContractHash", "productDescriptorHash", "plane"])("rejects changed ancestry coordinate %s", key => {
  const f = fixture();
  const value = key === "productReleaseNo" ? 14 : key === "plane" ? "mesh" : key.endsWith("Hash") ? "d".repeat(64) : id(99);
  expect(() => compileTenantLearningDescriptor({ ...f, ancestry: { ...f.ancestry, [key]: value } })).toThrow();
});
it("rejects corruption even when the source claims the original descriptor hash", () => {
  const f = fixture();
  expect(() => compileTenantLearningDescriptor({ ...f, source: { ...f.source, descriptor: { ...f.source.descriptor, storage: { object: "other" } } } })).toThrow();
});
it.each(["field", "operation", "ownership", "AI policy", "provenance"])("rejects a tenant extension changing %s", change => {
  const f = fixture(); let next = structuredClone(f.candidateGraph);
  if (change === "field") next = { ...next, fields: [{ ...next.fields[0]!, fieldKey: "other" }] };
  if (change === "operation") next = { ...next, operations: [{ ...next.operations[0]!, operationKey: "other" }] };
  if (change === "ownership") next = { ...next, entity: { ...next.entity, ownershipModel: "overlay" } };
  const ai = next.surfaces![0]!.layoutConfig!.ai as { aliases: string[]; vocabulary: { terms: { origin: { proposalHash: string } }[] } };
  if (change === "AI policy") ai.aliases.push("unauthorized alias");
  if (change === "provenance") ai.vocabulary.terms[0]!.origin.proposalHash = "d".repeat(64);
  expect(() => compileTenantLearningDescriptor({ ...f, candidateGraph: next })).toThrow();
});
it("requires Studio tenant author authority before opening a transaction", async () => {
  const f = fixture(), transaction = vi.fn();
  for (const context of [{ planeKey: "neon", tenantId: f.tenantId }, { planeKey: "studio", tenantId: id(99) }, { planeKey: "studio", tenantId: f.tenantId }]) {
    await expect(prepareTenantLearningExtensionDraft({ database: { transaction } as never,
      authorizer: { authorize: async () => ({ allowed: false }) } as never, context: context as never,
      proposal: f.proposal, sourceCurrent: vi.fn() })).rejects.toMatchObject({ code: "FORBIDDEN" });
  }
  expect(transaction).not.toHaveBeenCalled();
});
