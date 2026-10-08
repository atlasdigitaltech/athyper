import { expect, it } from "vitest";
import { nativeReleaseFixture } from "../native-release-compilation.fixtures.js";
import { sha256 } from "../deterministic.js";
import { nativePublicationTargets } from "./native-publication-targets.js";
function fixture() {
  const f = nativeReleaseFixture();
  f.graph.entity.ownershipModel = "system";
  f.graph.entity.entityClass = "reference";
  return {
    ...f,
    artifact: f.run(),
  };
}
it("uses typed enrollment and exact native compiled bytes without layout markers", () => {
  const f = fixture();
  const before = structuredClone(f.graph);
  expect(nativePublicationTargets(f.graph, f.artifact)).toEqual([
    {
      sourceContractHash: f.artifact.contractHash,
      targetPlane: "studio",
      graph: f.graph,
      artifact: f.artifact,
    },
  ]);
  expect(f.graph).toEqual(before);
});
it("rejects source and compiled-byte drift", () => {
  const f = fixture();
  f.graph.entity.entityCode = "changed";
  expect(() => nativePublicationTargets(f.graph, f.artifact)).toThrow(
    "SOURCE_MISMATCH",
  );
  const g = fixture();
  g.artifact.descriptorHash = "a".repeat(64);
  expect(() => nativePublicationTargets(g.graph, g.artifact)).toThrow(
    "SOURCE_MISMATCH",
  );
});
it("does not manufacture cross-plane contexts from a single compiled target", () => {
  const f = fixture();
  f.graph.referenceMembers!.members.target[0]!.targetPlane = "mesh";
  const artifact = { ...f.artifact, contractHash: sha256(f.graph) };
  expect(() => nativePublicationTargets(f.graph, artifact)).toThrow();
});

import { Kysely, PostgresDialect } from "kysely";
import { vi } from "vitest";
import { prepareSystemReferenceRelease } from "./prepare-release.js";
function preparation() {
  const f = fixture();
  const artifact = {
    ...f.artifact,
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test-key",
    signature: "fixture-signature",
  };
  const source = {
    contract_json: f.graph,
    revision_id: "revision",
    entity_id: f.graph.authoringSource.entityId,
    entity_code: f.graph.entity.entityCode,
    change_set_id: f.graph.ownedLabels!.changeSetId,
    release_no: 1,
    release_hash: artifact.descriptorHash,
    contract_hash: artifact.contractHash,
    target_planes: ["studio"],
    contract_signature: artifact.signature,
    signature_algorithm: "Ed25519",
    signing_key_id: "test-key",
    published_by: "publisher",
    approved_by: "reviewer",
    authority_tenant_id: "authority",
  };
  const query = vi.fn(async (text: string, _parameters?: unknown[]) => ({
    rows: text.includes("to_regprocedure")
      ? [{ available: true }]
      : text.includes("fn_human_publication_preparation_source")
        ? [{ source }]
        : text.includes("fn_system_entity_execution_metadata")
          ? [{ metadata: { humanExecutionPolicy: { fixture: true } } }]
          : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  return {
    db,
    query,
    source,
    input: { releaseId: "release", artifact, targetPlanes: ["studio"] },
  };
}
it("prepares native immutable target bytes and links review inside the release transaction", async () => {
  const f = preparation();
  try {
    await expect(
      f.db
        .transaction()
        .execute((tx) => prepareSystemReferenceRelease(tx, f.input)),
    ).resolves.toBe(true);
    const stores = f.query.mock.calls.filter(([text]) =>
      text.includes("fn_store_system_entity_artifact"),
    );
    expect(stores).toHaveLength(1);
    const [, params] = stores[0]!;
    expect(params?.[1]).toBe("studio");
    expect(JSON.parse(String(params?.[2]))).toEqual(
      f.input.artifact.descriptor,
    );
    expect(JSON.parse(String(params?.[3]))).toMatchObject({
      schema: "athyper.native-entity-compilation-source/1",
      productHash: f.input.artifact.contractHash,
    });
    expect(
      f.query.mock.calls.some(([text]) => text.includes("runtime_meta")),
    ).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("commit");
  } finally {
    await f.db.destroy();
  }
});
it("rolls back changed signed source pins before writing native targets", async () => {
  const f = preparation();
  f.source.release_hash = "0".repeat(64);
  try {
    await expect(
      f.db
        .transaction()
        .execute((tx) => prepareSystemReferenceRelease(tx, f.input)),
    ).rejects.toThrow("SIGNED_SOURCE_MISMATCH");
    expect(
      f.query.mock.calls.some(([text]) =>
        text.includes("fn_store_system_entity_artifact"),
      ),
    ).toBe(false);
    expect(f.query.mock.calls.at(-1)?.[0]).toBe("rollback");
  } finally {
    await f.db.destroy();
  }
});
