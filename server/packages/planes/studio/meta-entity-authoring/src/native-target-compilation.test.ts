import { expect, it } from "vitest";
import type { AuthoringPlane } from "@athyper/server-contract-meta-entity-authoring";
import { nativeReleaseFixture } from "./native-release-compilation.fixtures.js";
import { compileNativeReleaseTargets } from "./native-target-compilation.js";
import { sha256 } from "./deterministic.js";
import { compileNativeRuntimeProjection } from "../../../../platform/metadata/src/native-runtime-projection.js";

function fixture() {
  const f = nativeReleaseFixture();
  const planes: AuthoringPlane[] = ["studio", "neon", "mesh"];
  const members = f.graph.referenceMembers!.members;
  let id = 900;
  const next = () =>
    `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`;
  for (const kind of [
    "target",
    "authorizationProfile",
    "fieldAccess",
  ] as const) {
    const rows = members[kind];
    Reflect.set(
      members,
      kind,
      planes.flatMap((targetPlane, position) =>
        rows.map((row) => ({
          ...row,
          id: next(),
          targetPlane,
          ...(kind === "target" ? { position: position + 1 } : {}),
        })),
      ),
    );
  }
  f.graph.operationScopeBindings = planes.flatMap((targetPlane) =>
    f.graph.operationScopeBindings!.map((row) => ({ ...row, targetPlane })),
  );
  const contexts = planes.map((plane) => ({
    ...structuredClone(f.c),
    graphHash: sha256(f.graph),
    core: {
      ...structuredClone(f.c.core),
      catalogues: f.c.core.catalogues.map((row) => ({
        ...row,
        plane,
        hash: plane === "studio" ? row.hash : sha256({ plane, catalogue: row }),
      })),
    },
    authorization: {
      ...structuredClone(f.c.authorization),
      plane,
      permissions: f.c.authorization.permissions.map((row) => ({
        ...row,
        plane,
      })),
      scopes: f.c.authorization.scopes.map((row) => ({ ...row, plane })),
    },
  }));
  return { ...f, contexts };
}
it("compiles all declared planes independently and passes each target through the shared reader", () => {
  const f = fixture(),
    before = structuredClone(f.graph);
  const targets = compileNativeReleaseTargets(f.graph, f.contexts, f.controls);
  expect(targets.map((t) => t.targetPlane)).toEqual(["studio", "neon", "mesh"]);
  expect(new Set(targets.map((t) => t.artifact.descriptorHash)).size).toBe(3);
  for (const target of targets) {
    expect(target.sourceContractHash).toBe(sha256(f.graph));
    expect(target.artifact.contractHash).toBe(sha256(target.graph));
    expect(target.artifact.descriptor.authorization).toMatchObject({
      planeKey: target.targetPlane,
    });
    const runtime = compileNativeRuntimeProjection({
      native: target.artifact.descriptor,
      registration: {
        entityCode: f.graph.entity.entityCode,
        plane: target.targetPlane,
        storage: {
          schema: "shared",
          object: "synthetic_reference",
          idField: "id",
        },
        columns: ["id", "code", "name"],
      },
      permissions: [],
    });
    expect(runtime.listPresentation).toMatchObject({ identityField: "code" });
  }
  expect(f.graph).toEqual(before);
});
it.each([
  "missing",
  "duplicate",
  "source-drift",
  "wrong-catalogue",
  "missing-field",
])("rejects incomplete or mismatched target evidence: %s", (kind) => {
  const f = fixture();
  if (kind === "missing") f.contexts.pop();
  if (kind === "duplicate") f.contexts[2] = f.contexts[0]!;
  if (kind === "source-drift") f.contexts[1]!.graphHash = "0".repeat(64);
  if (kind === "wrong-catalogue")
    f.contexts[1]!.core.catalogues[0]!.plane = "studio";
  if (kind === "missing-field") {
    f.graph.referenceMembers!.members.fieldAccess =
      f.graph.referenceMembers!.members.fieldAccess.filter(
        (row) => row.targetPlane !== "mesh",
      );
    f.contexts.forEach((context) => {
      context.graphHash = sha256(f.graph);
    });
  }
  expect(() =>
    compileNativeReleaseTargets(f.graph, f.contexts, f.controls),
  ).toThrow();
});

import { compileNativePublication } from "./native-publication-compilation.js";
import { nativePublicationTargets } from "./publication/native-publication-targets.js";
import { readNativeSignedRelease } from "./publication/read-native-signed-release.js";

function envelopeFixture() {
  const f = fixture();
  f.graph.entity.ownershipModel = "system";
  f.contexts.forEach((context) => {
    context.graphHash = sha256(f.graph);
  });
  const artifact = compileNativePublication({
    graph: f.graph,
    compiler: f.contexts[0]!,
    targetCompilers: f.contexts,
    controls: f.controls,
  });
  const targets = nativePublicationTargets(f.graph, artifact);
  const row = {
    contract_json: f.graph,
    source_contract_hash: artifact.contractHash,
    source_descriptor_hash: artifact.descriptorHash,
    target_planes: targets.map((target) => target.targetPlane),
    signature_algorithm: "Ed25519",
    signing_key_id: "test-key",
    contract_signature: "test-signature",
    artifacts: targets.map((target) => ({
      plane: target.targetPlane,
      descriptor: target.artifact.descriptor,
      compliance: {
        schema: "athyper.native-entity-compilation-source/1",
        sourceContractHash: artifact.contractHash,
        sourceDescriptorHash: artifact.descriptorHash,
        targetDescriptorHash: target.artifact.descriptorHash,
        sourceArtifact: artifact,
      },
    })),
  };
  return { ...f, artifact, targets, row };
}
it("pins every destination in one source envelope and reconstructs unchanged signed bytes", () => {
  const f = envelopeFixture();
  expect(f.artifact.compiler.version).toBe("native-reference/2");
  expect(f.targets.map((target) => target.targetPlane)).toEqual([
    "mesh",
    "neon",
    "studio",
  ]);
  expect(
    f.targets.every(
      (target) => target.sourceContractHash === f.artifact.contractHash,
    ),
  ).toBe(true);
  expect(readNativeSignedRelease(f.row)).toEqual({
    ...f.artifact,
    signature: f.row.contract_signature,
    signingKeyId: f.row.signing_key_id,
    signatureAlgorithm: "Ed25519",
  });
});
it.each([
  "missing-plane",
  "target-bytes",
  "source-bytes",
  "target-hash",
  "extra-plane",
])("rejects immutable target-envelope corruption: %s", (kind) => {
  const f = envelopeFixture();
  if (kind === "missing-plane") f.row.artifacts.pop();
  if (kind === "target-bytes")
    f.row.artifacts[0]!.descriptor = {
      ...f.row.artifacts[0]!.descriptor,
      changed: true,
    };
  if (kind === "source-bytes")
    f.row.artifacts[0]!.compliance.sourceArtifact = {
      ...f.artifact,
      descriptorHash: "0".repeat(64),
    };
  if (kind === "target-hash")
    f.row.artifacts[0]!.compliance.targetDescriptorHash = "0".repeat(64);
  if (kind === "extra-plane") f.row.artifacts.push(f.row.artifacts[0]!);
  expect(() => readNativeSignedRelease(f.row)).toThrow();
});
it("requires independently resolved contexts for a multi-plane review", () => {
  const f = fixture();
  expect(() =>
    compileNativePublication({
      graph: f.graph,
      compiler: f.c,
      controls: f.controls,
    }),
  ).toThrow("NATIVE_PUBLICATION_TARGET_CONTEXT_REQUIRED");
});

import { generateKeyPairSync, sign, verify } from "node:crypto";
import { canonicalJson } from "./deterministic.js";
import { createProductReviewService } from "./product-review.js";
import type { MetaEntityAuthoringRepository } from "@athyper/server-contract-meta-entity-authoring";
it("review reports all target pins and the signature covers every destination", async () => {
  const f = envelopeFixture();
  const service = createProductReviewService({
    repository: {
      get: async () => ({
        id: f.graph.ownedLabels!.changeSetId,
        tenantId: null,
        entityId: f.graph.authoringSource.entityId,
        entityCode: f.graph.entity.entityCode,
        revision: 1,
        status: "draft",
      }),
    } as unknown as MetaEntityAuthoringRepository,
    nativeSource: async () => ({
      graph: f.graph,
      compiler: f.contexts[0]!,
      targetCompilers: f.contexts,
      controls: f.controls,
    }),
    receipt: async () => null,
    submitted: async () => false,
    record: async () => {},
  });
  const review = await service.inspect(f.graph.ownedLabels!.changeSetId);
  expect(review.descriptorHash).toBe(f.artifact.descriptorHash);
  expect(review.targets).toEqual(
    f.targets.map((t) => ({
      plane: t.targetPlane,
      contractHash: t.artifact.contractHash,
      descriptorHash: t.artifact.descriptorHash,
    })),
  );
  const keys = generateKeyPairSync("ed25519");
  const signature = sign(
    null,
    Buffer.from(canonicalJson(f.artifact)),
    keys.privateKey,
  );
  f.row.contract_signature = signature.toString("base64");
  const {
    signature: restoredSignature,
    signingKeyId: _key,
    signatureAlgorithm: _algorithm,
    ...restored
  } = readNativeSignedRelease(f.row);
  expect(
    verify(
      null,
      Buffer.from(canonicalJson(restored)),
      keys.publicKey,
      Buffer.from(restoredSignature, "base64"),
    ),
  ).toBe(true);
  const altered = structuredClone(restored);
  const entries = altered.descriptor.targets as { plane: string }[];
  entries[0]!.plane = "studio";
  altered.descriptorHash = sha256(altered.descriptor);
  expect(
    verify(
      null,
      Buffer.from(canonicalJson(altered)),
      keys.publicKey,
      signature,
    ),
  ).toBe(false);
});

import { qualifyNativeBootstrapCompilation } from "./native-bootstrap-compilation-proof.js";
function bootstrapFixture() {
  const f = fixture();
  const targetReaders = f.contexts.map((context) => ({
    storagePlane: context.authorization.plane,
    registration: {
      entityCode: f.graph.entity.entityCode,
      plane: context.authorization.plane,
      storage: {
        schema: "shared",
        object: "synthetic_reference",
        idField: "id",
      },
      columns: ["id", "code", "name"],
    },
    permissions: [],
  }));
  return {
    graph: f.graph,
    compiler: f.contexts[0]!,
    controls: f.controls,
    reader: targetReaders[0]!,
    targetCompilers: f.contexts,
    targetReaders,
  };
}
it("qualifies the complete bootstrap envelope through all destination readers", () => {
  const f = bootstrapFixture();
  expect(qualifyNativeBootstrapCompilation(f)).toMatchObject({
    compiler: { version: "native-reference/2" },
    contractHash: sha256(f.graph),
  });
});
it.each([
  "missing",
  "duplicate",
  "wrong-storage",
  "wrong-entity",
  "presentation-fallback",
  "missing-compilers",
])("rejects an incomplete bootstrap reader closure: %s", (kind) => {
  const f = bootstrapFixture();
  if (kind === "missing") f.targetReaders.pop();
  if (kind === "duplicate") f.targetReaders[2] = f.targetReaders[0]!;
  if (kind === "wrong-storage")
    f.targetReaders[2]!.registration.storage.object = "other";
  if (kind === "wrong-entity")
    f.targetReaders[2]!.registration.entityCode = "other";
  if (kind === "presentation-fallback")
    Object.assign(f.targetReaders[2]!.registration, {
      presentationDefaults: {},
    });
  if (kind === "missing-compilers")
    Reflect.deleteProperty(f, "targetCompilers");
  expect(() => qualifyNativeBootstrapCompilation(f)).toThrow(
    "Every target requires",
  );
});
