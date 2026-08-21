import type { ObjectStorage } from "@athyper/server-contract-object-storage";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ImmutablePublicationArtifactStore, publicationArtifactKey, publicationArtifactUri } from "../publication-artifact-store.js";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("immutable Publication artifact storage", () => {
  it("creates the required immutable key and stable URI", () => {
    const key = publicationArtifactKey({ publicationKey: "metadata.entity.invoice", releaseNo: 2, releaseId: "release-id", targetPlane: "neon", contentHash: "a".repeat(64) });
    expect(key).toBe(`publication/v1/metadata.entity.invoice/releases/2-release-id/neon/entity-runtime-${"a".repeat(64)}.json`);
    expect(publicationArtifactUri("publication", key)).toBe(`s3://publication/${key}`);
  });

  it("writes once and treats a same-checksum replay as success", async () => {
    const bytes = Uint8Array.of(1, 2, 3);
    const first = fixture();
    await first.store.putImmutable({ key: "publication/item", bytes, contentType: "application/json", sha256: hash(bytes), metadata: { release: "2" } });
    expect(first.storage.putIfAbsent).toHaveBeenCalledOnce();

    const replay = fixture(bytes);
    await expect(replay.store.putImmutable({ key: "publication/item", bytes, contentType: "application/json", sha256: hash(bytes), metadata: {} })).resolves.toBeUndefined();
  });

  it("rejects conflicting immutable writes and corrupted reads", async () => {
    const expected = Uint8Array.of(1, 2, 3);
    const conflicting = fixture(Uint8Array.of(9));
    await expect(conflicting.store.putImmutable({ key: "publication/item", bytes: expected, contentType: "application/json", sha256: hash(expected), metadata: {} })).rejects.toMatchObject({ code: "ARTIFACT_STORAGE_IMMUTABILITY_CONFLICT" });
    await expect(conflicting.store.get({ uri: "s3://publication/publication/item", expectedSha256: hash(expected) })).rejects.toMatchObject({ code: "ARTIFACT_STORAGE_IMMUTABILITY_CONFLICT" });
  });

  it("rejects foreign buckets and reports health without writing data", async () => {
    const f = fixture();
    await expect(f.store.get({ uri: "s3://other/publication/item", expectedSha256: "a".repeat(64) })).rejects.toMatchObject({ code: "ARTIFACT_STORAGE_URI_INVALID" });
    await expect(f.store.health()).resolves.toEqual({ healthy: true });
    expect(f.storage.exists).toHaveBeenCalledWith("publication/.health-access-probe");
    expect(f.storage.put).not.toHaveBeenCalled();
  });
});

function fixture(existing?: Uint8Array) {
  const storage: ObjectStorage = {
    put: vi.fn(async () => undefined),
    putIfAbsent: vi.fn(async () => existing === undefined),
    get: vi.fn(async () => existing ?? new Uint8Array()),
    delete: vi.fn(async () => undefined),
    exists: vi.fn(async () => false),
    createDownloadUrl: vi.fn(async () => ""),
    createUploadUrl: vi.fn(async () => ""),
    copy: vi.fn(async () => undefined),
  };
  return { storage, store: new ImmutablePublicationArtifactStore({ storage, bucket: "publication", canonicalizer: { sha256: hash } }) };
}
