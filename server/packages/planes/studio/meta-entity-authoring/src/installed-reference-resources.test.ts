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

it("decodes PostgreSQL bigint release numbers without accepting unsafe coordinates", async () => {
  const f = fixture();
  query.mockResolvedValue({ rows: [{ ...f.row, release_no: "1" }] });
  await expect(f.read(tx, f.pin)).resolves.toBeDefined();
  query.mockResolvedValue({
    rows: [{ ...f.row, release_no: "9007199254740993" }],
  });
  await expect(f.read(tx, f.pin)).rejects.toMatchObject({
    code: "REFERENCE_RESOURCE_NOT_QUALIFIED",
  });
});

it("native bootstrap host requires creation admission before reading the signed descriptor, including replay", async () => {
  const { createProductNativeBootstrapHost } =
    await import("./product-native-bootstrap-host.js");
  const f = fixture();
  const additionalAdmission = vi.fn(async () => {});
  const host = createProductNativeBootstrapHost({
    authorityTenantId: "00000000-0000-4000-8000-000000000003",
    maximumBytes: 10000,
    descriptorPin: f.pin,
    additionalAdmission,
    commands: {
      authoringSchemaHash: sha256(descriptor),
      maxMembers: 1000,
      maxBatchBytes: 10000,
      maxCommands: 1,
    },
    verifier: f.verifier,
    authorizeReview: f.authorizeReview,
  });
  const input = {
    actorId: "00000000-0000-4000-8000-000000000004",
    entityId: "00000000-0000-4000-8000-000000000005",
    changeSetId: "00000000-0000-4000-8000-000000000006",
    tenantId: null,
    batch: { contract: "entity.authoring-native-bootstrap/1" },
  };
  query.mockResolvedValueOnce({ rows: [{ admitted: false }] });
  await expect(host.admit(tx, input, "write")).rejects.toMatchObject({
    code: "PRODUCT_NATIVE_BOOTSTRAP_HOST_DENIED",
  });
  expect(f.verifier.verify).not.toHaveBeenCalled();
  query.mockResolvedValueOnce({ rows: [{ admitted: true }] });
  await host.admit(tx, input, "write");
  expect(f.authorizeReview).toHaveBeenCalledTimes(1);
  f.authorizeReview.mockRejectedValueOnce(Error("REVIEW_REVOKED"));
  query.mockResolvedValueOnce({ rows: [{ admitted: true }] });
  await expect(host.admit(tx, input, "write")).rejects.toThrow(
    "REVIEW_REVOKED",
  );
  expect(f.authorizeReview).toHaveBeenCalledTimes(2);
  expect(additionalAdmission).toHaveBeenCalledTimes(1);
  additionalAdmission.mockRejectedValueOnce(Error("OWNER_ADMISSION_REVOKED"));
  query.mockResolvedValueOnce({ rows: [{ admitted: true }] });
  await expect(host.admit(tx, input, "write")).rejects.toThrow(
    "OWNER_ADMISSION_REVOKED",
  );

  for (const altered of [
    { ...input, tenantId: input.actorId },
    { ...input, batch: { contract: "entity.authoring-label-commands/1" } },
    { ...input, batch: { ...input.batch, allow: true } },
  ])
    await expect(host.admit(tx, altered, "write")).rejects.toMatchObject({
      code: "PRODUCT_NATIVE_BOOTSTRAP_HOST_DENIED",
    });
  await expect(host.admit(tx, input, "history")).rejects.toMatchObject({
    code: "PRODUCT_NATIVE_BOOTSTRAP_HOST_DENIED",
  });
  await expect(host.admit(tx, input, "read")).rejects.toMatchObject({
    code: "PRODUCT_NATIVE_BOOTSTRAP_HOST_DENIED",
  });
  await expect(host.resolveInitializer(tx, input)).rejects.toMatchObject({
    code: "PRODUCT_NATIVE_BOOTSTRAP_HOST_ONLY",
  });
  expect(host.snapshotVersions).toEqual([2]);
});

it("native bootstrap host rejects another descriptor even when signed and installed", async () => {
  const { createProductNativeBootstrapHost } =
    await import("./product-native-bootstrap-host.js");
  const f = fixture();
  const host = createProductNativeBootstrapHost({
    authorityTenantId: "00000000-0000-4000-8000-000000000003",
    maximumBytes: 10000,
    descriptorPin: f.pin,
    additionalAdmission: vi.fn(async () => {}),
    commands: {
      authoringSchemaHash: "f".repeat(64),
      maxMembers: 1000,
      maxBatchBytes: 10000,
      maxCommands: 1,
    },
    verifier: f.verifier,
    authorizeReview: f.authorizeReview,
  });
  query.mockResolvedValueOnce({ rows: [{ admitted: true }] });
  await expect(
    host.admit(
      tx,
      {
        actorId: "00000000-0000-4000-8000-000000000004",
        entityId: "00000000-0000-4000-8000-000000000005",
        changeSetId: "00000000-0000-4000-8000-000000000006",
        tenantId: null,
        batch: { contract: "entity.authoring-native-bootstrap/1" },
      },
      "write",
    ),
  ).rejects.toMatchObject({ code: "REFERENCE_RESOURCE_NOT_QUALIFIED" });
});
