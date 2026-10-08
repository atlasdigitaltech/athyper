import { verifyLocalLiveReadResource } from "../live-read-resource-verification.js";
import { expect, it, vi } from "vitest";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import {
  parsePublicationArtifactEnvelope,
  type EntityAuthoringResourceSource,
  type PublicationCanonicalizer,
  type PublicationDeploymentBundle,
} from "@athyper/server-contract-publication";
import {
  compileEntityAuthoringResource,
  qualifyEntityAuthoringResource,
} from "./entity-authoring-resource.js";
import { VerifiedPublicationArtifactLoader } from "../publication-artifact-loader.js";
import { projectionJson } from "../kysely-local-projection-repository.js";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const json = (v: unknown) =>
  JSON.stringify(v, (_k, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
const canonical: PublicationCanonicalizer = {
  canonicalBytes: (v) => Buffer.from(json(v)),
  sha256: (b) => createHash("sha256").update(b).digest("hex"),
};
const hash = (v: unknown) => canonical.sha256(canonical.canonicalBytes(v));
function fixture(
  kind: "entity_security_manifest" | "entity_storage_authority",
  plane: "studio" | "neon" | "mesh",
) {
  const source = {
    entityId: id(1),
    releaseId: id(2),
    contractHash: "a".repeat(64),
    tenantId: null,
  };
  const pin = {
    owner: "platform",
    namespace: "entity",
    key: "reference.security",
    version: 1,
    hash: "b".repeat(64),
  };
  const content =
    kind === "entity_security_manifest"
      ? {
          schema: "entity.effective-security-manifest/1",
          entityCode: "sample_reference",
          source,
          plane,
          scope: { contract: "tenant.record.v1", tenantId: id(3) },
          operations: [
            {
              identityId: id(4),
              semanticHash: "c".repeat(64),
              key: "read",
              target: "collection",
              requirement: { state: "none" },
            },
          ],
          fields: [
            {
              identityId: id(5),
              semanticHash: "d".repeat(64),
              key: "code",
              readOperationId: id(4),
              representation: "plain",
              mask: null,
              queryUses: [],
            },
          ],
          unsupportedControls: [],
        }
      : {
          schema: "entity.storage-authority/1",
          source,
          plane,
          tenantId: id(3),
          storage: {
            schema: "shared",
            object: "reference_object",
            provider: { ...pin, key: "provider" },
          },
          owners: [
            {
              source,
              security: pin,
              readOperationId: id(4),
              fields: [{ fieldIdentityId: id(5), ownerFieldIdentityId: id(5) }],
            },
          ],
        };
  const resource = {
    schema: "entity.installed-live-read-resource/1",
    pin: { ...pin, key: kind, hash: hash(content) },
    content,
  };
  const proposal: EntityAuthoringResourceSource = {
    releaseId: id(6),
    publicationKey: "metadata.resource.example",
    releaseNo: 1,
    generatedAt: "2026-10-08T00:00:00.000Z",
    kind,
    payload: resource,
  };
  return { proposal, resource };
}
it.each(
  (["entity_security_manifest", "entity_storage_authority"] as const).flatMap(
    (kind) =>
      (["studio", "neon", "mesh"] as const).map(
        (plane) => [kind, plane] as const,
      ),
  ),
)(
  "qualifies and verifies %s for exact %s plane without granting record access",
  async (kind, plane) => {
    const f = fixture(kind, plane),
      policy = {
        load: vi.fn(async () => f.proposal),
        qualify: vi.fn(async () => {}),
      };
    const unsigned = await compileEntityAuthoringResource(
      f.proposal,
      policy,
      canonical,
      "fixture-key",
    );
    expect(unsigned.envelope.targetPlane).toBe(plane);
    for (const phase of ["sign", "dispatch"] as const)
      await qualifyEntityAuthoringResource(unsigned, policy, canonical, phase);
    const keys = generateKeyPairSync("ed25519"),
      signature = sign(
        null,
        canonical.canonicalBytes(unsigned),
        keys.privateKey,
      ).toString("base64");
    const document = { ...unsigned, signature },
      bytes = canonical.canonicalBytes(document);
    const deployment = {
      artifactUri: "fixture://resource",
      artifactHash: hash(document),
      publicationKey: f.proposal.publicationKey,
      sourceReleaseId: f.proposal.releaseId,
      sourceReleaseNo: 1,
      targetPlane: plane,
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
      liveReadResources: { qualify },
    }).load(deployment);
    expect(loaded.verification.signatureVerified).toBe(true);
    const installation = {
      publicationKey: f.proposal.publicationKey,
      releaseId: f.proposal.releaseId,
      releaseNo: 1,
      artifactHash: hash(document),
      payloadHash: hash(f.resource),
      payload: f.resource,
      signedDocument: document,
    };
    const verification = {
      installation,
      pin: f.resource.pin,
      tenantId: id(3),
      plane,
      runtimeVersion: "1.0.0",
      verifier: options.verifier,
      canonical,
    };
    expect(await verifyLocalLiveReadResource(verification)).toEqual(f.resource);
    for (const manifestChange of [
      { mediaType: "unsupported" },
      { descriptorSchemaVersion: "99" },
      { minimumRuntimeVersion: "99.0.0" },
    ]) {
      const changed = {
        ...document,
        manifest: { ...document.manifest, ...manifestChange },
      };
      await expect(
        verifyLocalLiveReadResource({
          ...verification,
          installation: {
            ...installation,
            artifactHash: hash(changed),
            signedDocument: changed,
          },
          verifier: { verify: async () => true },
        }),
      ).rejects.toThrow();
    }
    await expect(
      verifyLocalLiveReadResource({ ...verification, tenantId: id(9) }),
    ).rejects.toThrow();
    await expect(
      verifyLocalLiveReadResource({
        ...verification,
        pin: { ...f.resource.pin, version: 2 },
      }),
    ).rejects.toThrow();
    await expect(
      verifyLocalLiveReadResource({
        ...verification,
        installation: { ...installation, payload: {} },
      }),
    ).rejects.toThrow();
    await expect(
      verifyLocalLiveReadResource({
        ...verification,
        verifier: { verify: async () => false },
      }),
    ).rejects.toThrow();

    expect(qualify).toHaveBeenCalledExactlyOnceWith(unsigned.envelope);
    expect(projectionJson(document)).toMatchObject({
      applied_release_payload: {
        tenant_id: id(3),
        payload_json: f.resource,
        coordinates: { signed_document: document },
      },
    });
    expect(() =>
      parsePublicationArtifactEnvelope({
        ...unsigned.envelope,
        targetPlane: plane === "studio" ? "mesh" : "studio",
      }),
    ).toThrow();
    policy.load.mockResolvedValueOnce({
      ...f.proposal,
      generatedAt: "2026-10-09T00:00:00.000Z",
    });
    await expect(
      qualifyEntityAuthoringResource(unsigned, policy, canonical, "dispatch"),
    ).rejects.toThrow();
    qualify.mockRejectedValueOnce(Error("resource revoked"));
    await expect(
      new VerifiedPublicationArtifactLoader({
        ...options,
        liveReadResources: { qualify },
      }).load(deployment),
    ).rejects.toThrow("resource revoked");
  },
);
it("rejects substituted hashes and mismatched tenant scope before qualification", async () => {
  const f = fixture("entity_security_manifest", "studio"),
    policy = { load: vi.fn(), qualify: vi.fn() };
  f.resource.pin.hash = "f".repeat(64);
  await expect(
    compileEntityAuthoringResource(f.proposal, policy, canonical, "key"),
  ).rejects.toThrow();
  expect(policy.qualify).not.toHaveBeenCalled();
  f.resource.content.source.tenantId = id(9) as never;
  await expect(
    compileEntityAuthoringResource(f.proposal, policy, canonical, "key"),
  ).rejects.toThrow();
});
