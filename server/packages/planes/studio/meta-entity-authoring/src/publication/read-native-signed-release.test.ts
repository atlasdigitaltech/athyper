import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
import { nativeReleaseFixture } from "../native-release-compilation.fixtures.js";
import { KyselyMetaEntityAuthoringRepository } from "../kysely-authoring-repository.js";
import { readNativeSignedRelease } from "./read-native-signed-release.js";
function fixture() {
  const f = nativeReleaseFixture();
  f.graph.entity.ownershipModel = "system";
  f.graph.entity.entityClass = "reference";
  const artifact = {
    ...f.run(),
    signature: "original-signature",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "original-key",
  };
  const row = {
    contract_json: f.graph,
    source_contract_hash: artifact.contractHash,
    source_descriptor_hash: artifact.descriptorHash,
    target_planes: ["studio"],
    contract_signature: artifact.signature,
    signature_algorithm: artifact.signatureAlgorithm,
    signing_key_id: artifact.signingKeyId,
    artifacts: [
      {
        plane: "studio",
        descriptor: artifact.descriptor,
        compliance: {
          schema: "athyper.native-entity-compilation-source/1",
          sourceContractHash: artifact.contractHash,
          sourceDescriptorHash: artifact.descriptorHash,
          targetDescriptorHash: artifact.descriptorHash,
        },
      },
    ],
  };
  return { row, artifact };
}
it("repository redispatch reads the immutable native artifact and original signature without legacy compilation", async () => {
  const { row, artifact } = fixture();
  const query = vi.fn(async () => ({ rows: [row] }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  try {
    expect(
      await new KyselyMetaEntityAuthoringRepository(db).getSignedRelease(
        "00000000-0000-4000-8000-000000000001",
      ),
    ).toEqual(artifact);
    expect(query).toHaveBeenCalledTimes(1);
  } finally {
    await db.destroy();
  }
});
it.each([
  "source",
  "descriptor",
  "missing",
  "duplicate",
  "target",
  "compliance",
  "signature",
])("rejects %s drift in immutable native release", (kind) => {
  const { row } = fixture();
  if (kind === "source") row.source_contract_hash = "0".repeat(64);
  if (kind === "descriptor") row.artifacts[0]!.descriptor = {};
  if (kind === "missing") row.artifacts = [];
  if (kind === "duplicate") row.artifacts.push(row.artifacts[0]!);
  if (kind === "target") row.target_planes = ["mesh"];
  if (kind === "compliance")
    row.artifacts[0]!.compliance.sourceContractHash = "0".repeat(64);
  if (kind === "signature") row.contract_signature = "";
  expect(() => readNativeSignedRelease(row)).toThrow();
});
