import { expect, it } from "vitest";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import {
  reconcileTenantSuccessor,
  type SuccessorSnapshot,
} from "./reconcile-successor.js";
import type { CompiledEntityArtifactV2 } from "@athyper/server-contract-publication";
const canonicalizer = { canonicalBytes, sha256 };
const member = (name: string, value: string, artifactHash = "a".repeat(64)) =>
  ({
    artifactKey: `${name}/core`,
    artifactType: "core",
    entityCode: name,
    plane: "neon",
    artifactHash,
    content: {
      artifactKey: `${name}/core`,
      artifactType: "core",
      entityCode: name,
      plane: "neon",
      value,
      artifactHash,
    },
  }) as unknown as CompiledEntityArtifactV2;
function fixture() {
  const baseline: SuccessorSnapshot = {
    publicationKey: "product",
    sourceReleaseId: "old-product",
    sourceReleaseNo: 1,
    artifactHash: "a".repeat(64),
    tenantId: null,
    entityCode: "shipment",
    plane: "neon",
    artifacts: [member("shipment", "old")],
  };
  const tenant = {
    ...baseline,
    publicationKey: "tenant",
    sourceReleaseId: "old-tenant",
    tenantId: "tenant-one",
  };
  return {
    baseline,
    tenant,
    proposedProduct: [member("shipment", "new")],
    canonicalizer,
  };
}
it("takes a new baseline while retaining tenant-only artifacts and input identities", () => {
  const f = fixture();
  f.tenant.artifacts = [
    ...f.tenant.artifacts,
    member("inspection", "tenant-only"),
  ];
  const result = reconcileTenantSuccessor(f);
  expect(result.conflicts).toHaveLength(0);
  expect(result.authoringArtifacts?.map((a) => a.content.value)).toEqual([
    "tenant-only",
    "new",
  ]);
  expect(result.tenant.sourceReleaseId).toBe("old-tenant");
  expect(result.publicationReady).toBe(false);
  expect(f.baseline.artifacts[0]!.content.value).toBe("old");
  expect(
    result.authoringArtifacts?.every(
      (a) => !Object.hasOwn(a.content, "artifactHash"),
    ),
  ).toBe(true);
});
it("retains tenant changes when product content did not change even if stored hashes differ", () => {
  const f = fixture();
  f.tenant.artifacts = [member("shipment", "tenant")];
  f.proposedProduct = [member("shipment", "old", "b".repeat(64))];
  expect(
    reconcileTenantSuccessor(f).authoringArtifacts?.[0]?.content.value,
  ).toBe("tenant");
});
it("withholds a usable successor on divergent authorities and retains all three versions", () => {
  const f = fixture();
  f.tenant.artifacts = [member("shipment", "tenant")];
  const result = reconcileTenantSuccessor(f);
  expect(result.authoringArtifacts).toBeNull();
  expect(result.conflicts[0]?.baseline?.content.value).toBe("old");
  expect(result.conflicts[0]?.tenant?.content.value).toBe("tenant");
  expect(result.conflicts[0]?.proposedProduct?.content.value).toBe("new");
});
it("admits converged content but blocks add/add and delete/edit conflicts", () => {
  const f = fixture();
  f.tenant.artifacts = [member("shipment", "new")];
  expect(reconcileTenantSuccessor(f).conflicts).toHaveLength(0);
  f.baseline = { ...f.baseline, artifacts: [] };
  f.tenant.artifacts = [member("shipment", "tenant")];
  expect(reconcileTenantSuccessor(f).conflicts).toHaveLength(1);
  const g = fixture();
  g.tenant.artifacts = [];
  expect(reconcileTenantSuccessor(g).conflicts).toHaveLength(1);
});
it("rejects cross-authority coordinates, duplicate members and plane changes", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.tenant.tenantId = null as any;
    },
    (f: ReturnType<typeof fixture>) => {
      f.tenant.entityCode = "inspection";
    },
    (f: ReturnType<typeof fixture>) => {
      f.proposedProduct.push(f.proposedProduct[0]!);
    },
    (f: ReturnType<typeof fixture>) => {
      f.tenant.plane = "mesh";
    },
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => reconcileTenantSuccessor(f)).toThrow();
  }
});
