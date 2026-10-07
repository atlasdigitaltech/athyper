import { expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import {
  parsePublicationArtifactEnvelope,
  type PublicationCanonicalizer,
  type PublicationDeploymentBundle,
} from "@athyper/server-contract-publication";
import {
  compileEntityAuthoringResource,
  qualifyEntityAuthoringResource,
  type EntityAuthoringResourceSource,
} from "./entity-authoring-resource.js";
import { VerifiedPublicationArtifactLoader } from "../publication-artifact-loader.js";
import { projectionJson } from "../kysely-local-projection-repository.js";
const canonicalJson = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
const canonical: PublicationCanonicalizer = {
  canonicalBytes: (v) => Buffer.from(canonicalJson(v)),
  sha256: (b) => createHash("sha256").update(b).digest("hex"),
};
const hash = (v: unknown) => canonical.sha256(canonical.canonicalBytes(v));
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const descriptor = {
  schema: "entity.installed-authoring-descriptor/1",
  schemaVersion: 1,
  descriptor: { fixture: true },
  descriptorHash: hash({ fixture: true }),
};
const review = {
  schema: "entity.legacy-identity-review/1",
  reference: "fixture/review",
  entityId: id(1),
  changeSetId: id(2),
  tenantId: null,
  sourceHash: "a".repeat(64),
  authoringSchemaHash: "b".repeat(64),
  reviewedPlanHash: "c".repeat(64),
  proposerId: id(3),
  reviewerId: id(4),
  releases: [],
};
it.each(["entity_authoring_descriptor", "entity_identity_review"] as const)(
  "compiles, requalifies, verifies and projects %s through the shared envelope",
  async (kind) => {
    const source: EntityAuthoringResourceSource = {
      releaseId: id(5),
      publicationKey: "metadata.entity.fixture_resource",
      releaseNo: 1,
      generatedAt: "2026-10-08T00:00:00.000Z",
      kind,
      payload: kind === "entity_authoring_descriptor" ? descriptor : review,
    };
    const policy = {
      load: vi.fn(async () => source),
      qualify: vi.fn(async () => {}),
    };
    const unsigned = await compileEntityAuthoringResource(
      source,
      policy,
      canonical,
      "fixture-key",
    );
    await qualifyEntityAuthoringResource(unsigned, policy, canonical, "sign");
    await qualifyEntityAuthoringResource(
      unsigned,
      policy,
      canonical,
      "dispatch",
    );
    expect(policy.qualify.mock.calls.map((c) => (c as unknown[])[1])).toEqual([
      "compile",
      "sign",
      "dispatch",
    ]);
    const keys = generateKeyPairSync("ed25519"),
      signature = sign(
        null,
        canonical.canonicalBytes(unsigned),
        keys.privateKey,
      ).toString("base64"),
      document = { ...unsigned, signature },
      bytes = canonical.canonicalBytes(document);
    const deployment = {
      artifactUri: "fixture://artifact",
      artifactHash: canonical.sha256(bytes),
      publicationKey: source.publicationKey,
      sourceReleaseId: source.releaseId,
      sourceReleaseNo: 1,
      targetPlane: "studio",
      signatureAlgorithm: "Ed25519",
      signingKeyId: "fixture-key",
      signature,
    } as PublicationDeploymentBundle;
    const options = {
      store: { get: async () => bytes, putImmutable: async () => {} },
      verifier: {
        verify: async (input: { bytes: Uint8Array; signature: string }) =>
          verify(
            null,
            input.bytes,
            keys.publicKey,
            Buffer.from(input.signature, "base64"),
          ),
      },
      canonicalizer: canonical,
      runtimeVersion: "1.0.0",
    };
    await expect(
      new VerifiedPublicationArtifactLoader(options).load(deployment),
    ).rejects.toThrow();
    const qualify = vi.fn(async () => {});
    const loaded = await new VerifiedPublicationArtifactLoader({
      ...options,
      authoringResources: { qualify },
    }).load(deployment);
    expect(loaded.verification.signatureVerified).toBe(true);
    expect(qualify).toHaveBeenCalledWith(kind, source.payload);
    expect(projectionJson(document)).toMatchObject({
      applied_release_payload: {
        artifact_kind: kind,
        tenant_id: null,
        payload_json: source.payload,
        payload_hash: hash(source.payload),
        payload_schema_version: "1.0",
      },
    });
    policy.load.mockResolvedValueOnce({
      ...source,
      payload: { ...descriptor, schemaVersion: 2 },
    });
    await expect(
      qualifyEntityAuthoringResource(unsigned, policy, canonical, "dispatch"),
    ).rejects.toThrow();
  },
);
it("rejects wrong plane, self-review, ambiguous historical mappings and descriptor drift", async () => {
  const envelope = {
    schema: "athyper.publication-artifact.v1",
    publicationKey: "fixture.resource",
    releaseId: id(5),
    releaseNo: 1,
    targetPlane: "studio",
    artifactKind: "entity_identity_review",
    payload: review,
  };
  for (const patch of [
    { targetPlane: "neon" },
    { payload: { ...review, reviewerId: review.proposerId } },
    {
      payload: {
        ...review,
        releases: [
          {
            releaseId: id(8),
            previousSourceHash: "a".repeat(64),
            mappings: [{ currentFieldId: id(9), previousFieldId: id(10) }],
            rebindRequiredPreviousFieldIds: [id(10)],
          },
        ],
      },
    },
  ])
    expect(() =>
      parsePublicationArtifactEnvelope({ ...envelope, ...patch }),
    ).toThrow();
  await expect(
    compileEntityAuthoringResource(
      {
        releaseId: id(5),
        publicationKey: "fixture.resource",
        releaseNo: 1,
        generatedAt: "2026-10-08T00:00:00Z",
        kind: "entity_authoring_descriptor",
        payload: { ...descriptor, descriptorHash: "0".repeat(64) },
      },
      {
        load: async () => {
          throw Error("unused");
        },
        qualify: async () => {},
      },
      canonical,
      "key",
    ),
  ).rejects.toThrow();
});
