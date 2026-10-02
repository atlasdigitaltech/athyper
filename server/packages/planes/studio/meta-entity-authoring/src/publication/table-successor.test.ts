import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import type { DevEntitySuccessorPolicy } from "@athyper/server-contract-publication";
import { parseTableEntityProduct } from "../authoring/table-product.js";
import { compileGraph } from "../deterministic.js";
import { assertEntitySuccessorSource } from "./successor-source.js";
import { EntitySuccessorPublicationWorkflow, type EntitySuccessorPublicationPorts } from "./publication-workflow.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  const product = parseTableEntityProduct(JSON.parse(readFileSync(new URL("../../../../../../../metadata/products/shared/entities/principal/definition.json", import.meta.url), "utf8")));
  const graph = structuredClone(product.definition);
  const surface = graph.surfaces!.find(s => s.surfaceKind === "list")!;
  surface.layoutConfig = { ...surface.layoutConfig, tableEntityProduct: { schema: "athyper.table-entity-source/1", moduleCode: product.moduleCode, productHash: "a".repeat(64), targetPlanes: product.planes } };
  const artifact = compileGraph(graph);
  const policy: DevEntitySuccessorPolicy = {
    schema: "athyper.dev-entity-successor-policy/1", environment: "local", instance: "dev", authorityTenantId: id(1), policyId: "test.table.successor", revision: 1,
    entityId: id(2), changeSetId: id(3), contractHash: artifact.contractHash, descriptorHash: artifact.descriptorHash, authorPrincipalId: id(4), publisherPrincipalId: id(5),
    predecessor: { authoringReleaseId: id(6), authoringReleaseNo: 1, authoringReleaseHash: "b".repeat(64), publicationReleaseId: id(7), publicationReleaseNo: 1, publicationReleaseHash: "c".repeat(64), revisionId: id(8), contractHash: "d".repeat(64) },
    compiler: { name: "test", version: "1.1.0", buildHash: "e".repeat(64) },
    targets: product.planes.map((plane, i) => ({ plane, environment: "local", instance: "dev", publicationKey: "metadata.entity.principal", appliedReleaseId: id(20 + i), sourceReleaseId: id(7), sourceReleaseNo: 1, artifactHash: "f".repeat(64), headVersion: 1 })),
  };
  return { graph, policy };
}
it("admits a pinned Principal table successor through enrollment source qualification", async () => {
  const { graph, policy } = fixture();
  const query = vi.fn(async (text: string) => ({ rows: text.includes("fn_entity_successor_enrollment_source") ? [{ graph }] : [] }));
  const db = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  try {
    await expect(db.transaction().execute(tx => assertEntitySuccessorSource(tx, policy, policy.authorityTenantId))).resolves.toBeUndefined();
    await expect(db.transaction().execute(tx => assertEntitySuccessorSource(tx, { ...policy, contractHash: "0".repeat(64) }, policy.authorityTenantId))).rejects.toThrow("SOURCE_PIN_CHANGED");
  } finally { await db.destroy(); }
});
it("qualifies table targets with identity permissions and stops before submission when a target fails", async () => {
  const { graph, policy } = fixture();
  const submit = vi.fn();
  const qualify = vi.fn(async (target) => {
    expect(target.graph.operationPermissions.every((p: { permissionCode: string }) => p.permissionCode === "common.identity.principal.read")).toBe(true);
    if (target.targetPlane === policy.targets.at(-1)!.plane) throw Error("TARGET_UNAVAILABLE");
  });
  const ports = {
    assertPolicyAuthorized: vi.fn(async () => {}), withSuccessorPublication: async (_policy: unknown, work: () => Promise<unknown>) => work(),
    asWorkload: async (principalId: string, work: (actor: unknown) => Promise<unknown>) => work({ principalId, authorize: async () => {}, service: { readGraph: async () => ({ graph, changeSet: { id: policy.changeSetId, entityId: policy.entityId, tenantId: null, entityCode: graph.entity.entityCode, status: "draft", createdBy: policy.authorPrincipalId } }), submit } }),
    qualify, record: vi.fn(),
  } as unknown as EntitySuccessorPublicationPorts;
  await expect(new EntitySuccessorPublicationWorkflow(policy, ports).run()).rejects.toThrow("TARGET_UNAVAILABLE");
  expect(qualify).toHaveBeenCalledTimes(policy.targets.length);
  expect(submit).not.toHaveBeenCalled();
});
