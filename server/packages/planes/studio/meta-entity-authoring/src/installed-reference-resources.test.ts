import { beforeEach, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign, verify } from "node:crypto";
import type { Transaction } from "kysely";
import { canonicalJson, sha256 } from "./deterministic.js";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("kysely", () => ({ sql: () => ({ execute: query }) }));
import {
  createInstalledReferenceResourceReader,
  createInstalledIdentityReviewStore,
  resolveInstalledAuthoringDescriptor,
} from "./installed-reference-resources.js";
const tx = { isTransaction: true } as Transaction<Record<string, never>>;
const keys = generateKeyPairSync("ed25519");
const descriptor = { contract: "fixture-descriptor" };
const document = {
  schema: "entity.installed-authoring-descriptor/1",
  schemaVersion: 1,
  descriptor,
  descriptorHash: sha256(descriptor),
};
function fixture(value: Record<string, unknown> = document) {
  const payload = value;
  const kind =
    payload.schema === "entity.legacy-identity-review/1"
      ? "entity_identity_review"
      : "entity_authoring_descriptor";
  value = {
    envelope: {
      schema: "athyper.publication-artifact.v1",
      publicationKey: "fixture.resource",
      releaseId: "release",
      releaseNo: 1,
      targetPlane: "studio",
      artifactKind: kind,
      payload,
    },
    manifest: {
      publicationKey: "fixture.resource",
      releaseId: "release",
      releaseNo: 1,
      targetPlane: "studio",
      artifactKind: kind,
      payloadSha256: sha256(payload),
      signingKeyId: "fixture-key",
      signatureAlgorithm: "Ed25519",
    },
  };
  const signature = sign(
    null,
    Buffer.from(canonicalJson(value)),
    keys.privateKey,
  ).toString("base64");
  const row = {
    document: value,
    release_no: 1,
    unsigned_hash: sha256(value),
    signature,
    algorithm: "Ed25519",
    key_id: "fixture-key",
    author_id: "00000000-0000-4000-8000-000000000001",
    reviewer_id: "00000000-0000-4000-8000-000000000002",
  };
  query.mockResolvedValue({ rows: [row] });
  const authorizeReview = vi.fn(async () => {});
  const verifier = {
    verify: vi.fn(async (input: { bytes: Uint8Array; signature: string }) =>
      verify(
        null,
        input.bytes,
        keys.publicKey,
        Buffer.from(input.signature, "base64"),
      ),
    ),
  };
  const read = createInstalledReferenceResourceReader({
    authorityTenantId: "authority",
    maximumBytes: 10000,
    verifier,
    authorizeReview,
  });
  const pin = {
    publicationKey: "fixture.resource",
    releaseId: "release",
    unsignedHash: sha256(value),
    artifactHash: sha256({ ...value, signature }),
    kind: "entity_authoring_descriptor" as const,
  };
  return { read, pin, row, verifier, authorizeReview };
}
beforeEach(() => vi.resetAllMocks());
it("resolves exact signed descriptor content and requires current human review authority", async () => {
  const f = fixture();
  expect(
    await resolveInstalledAuthoringDescriptor(
      tx,
      f.pin,
      f.read,
      sha256(descriptor),
    ),
  ).toMatchObject({
    schemaVersion: 1,
    authoringSchemaHash: sha256(descriptor),
    descriptor,
  });
  f.authorizeReview.mockRejectedValueOnce(new Error("REVIEW_REVOKED"));
  await expect(f.read(tx, f.pin)).rejects.toThrow("REVIEW_REVOKED");
});
it("rejects missing/ambiguous installation and byte/hash/signature drift", async () => {
  for (const variant of [
    "missing",
    "duplicate",
    "document",
    "signature",
    "artifact",
    "trust",
  ]) {
    const f = fixture();
    if (variant === "missing") query.mockResolvedValue({ rows: [] });
    if (variant === "duplicate")
      query.mockResolvedValue({ rows: [f.row, f.row] });
    if (variant === "document")
      f.row.document = { ...document, schemaVersion: 2 };
    if (variant === "signature") f.row.signature = "bad";
    if (variant === "artifact") f.pin.artifactHash = "0".repeat(64);
    if (variant === "trust") f.verifier.verify.mockResolvedValue(false);
    await expect(f.read(tx, f.pin)).rejects.toThrow();
    expect(f.authorizeReview).not.toHaveBeenCalled();
  }
});
it("binds identity review principals and source coordinates to the installed decision", async () => {
  const receipt = {
    schema: "entity.legacy-identity-review/1",
    reference: "fixture-review",
    tenantId: null,
    authoringSchemaHash: "b".repeat(64),
    reviewedPlanHash: "c".repeat(64),
    releases: [],
    proposerId: "00000000-0000-4000-8000-000000000001",
    reviewerId: "00000000-0000-4000-8000-000000000002",
    entityId: "00000000-0000-4000-8000-000000000003",
    changeSetId: "00000000-0000-4000-8000-000000000004",
    sourceHash: "a".repeat(64),
  };
  const f = fixture(receipt);
  const store = createInstalledIdentityReviewStore({
    read: f.read,
    pin: { ...f.pin, kind: "entity_identity_review" },
  });
  const input = {
    entityId: "00000000-0000-4000-8000-000000000003",
    changeSetId: "00000000-0000-4000-8000-000000000004",
    expectedSourceHash: "a".repeat(64),
  } as Parameters<typeof store.load>[1];
  const loaded = await store.load(tx, input);
  expect(loaded?.hash).toBe(sha256(receipt));
  await expect(
    store.load(tx, { ...input, changeSetId: "other" }),
  ).rejects.toThrow();
  query.mockResolvedValue({ rows: [] });
  await expect(
    store.authorize(tx, loaded!.receipt, loaded!.hash),
  ).rejects.toThrow();
});
it("rejects wrong resource kind and unpinned descriptor bodies", async () => {
  const f = fixture();
  await expect(
    resolveInstalledAuthoringDescriptor(
      tx,
      { ...f.pin, kind: "entity_identity_review" },
      f.read,
      sha256(descriptor),
    ),
  ).rejects.toThrow();
  await expect(
    resolveInstalledAuthoringDescriptor(tx, f.pin, f.read, "0".repeat(64)),
  ).rejects.toThrow();
});
