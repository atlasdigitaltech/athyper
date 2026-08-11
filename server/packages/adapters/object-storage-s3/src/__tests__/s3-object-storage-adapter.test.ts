import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createS3ObjectStorageAdapter,
  S3ObjectStorageRuntime,
} from "../s3-object-storage-adapter.js";

const sdkMocks = vi.hoisted(() => ({
  signedUrl: vi.fn(),
  uploadDone: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: sdkMocks.signedUrl,
}));

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class MockUpload {
    done = sdkMocks.uploadDone;
  },
}));

describe("S3 object-storage adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sdkMocks.signedUrl.mockResolvedValue("https://signed.athyper.test/object");
    sdkMocks.uploadDone.mockResolvedValue({ ETag: "stream-etag" });
  });

  it("supports managed S3 without forcing an endpoint or static credentials", () => {
    const adapter = createS3ObjectStorageAdapter({
      region: "us-east-1",
      bucket: "athyper-documents",
    });

    expect(adapter).toBeDefined();
    adapter.close();
  });

  it("rejects invalid endpoint, partial credentials, and multipart settings", () => {
    expect(() =>
      createS3ObjectStorageAdapter({
        region: "us-east-1",
        bucket: "documents",
        endpoint: "ftp://storage.test",
      }),
    ).toThrow("HTTP");
    expect(() =>
      createS3ObjectStorageAdapter({
        region: "us-east-1",
        bucket: "documents",
        accessKeyId: "key-only",
      }),
    ).toThrow("configured together");
    expect(() =>
      createS3ObjectStorageAdapter({
        region: "us-east-1",
        bucket: "documents",
        multipartPartSizeMb: 4,
      }),
    ).toThrow("at least 5 MiB");
  });

  it("puts objects with metadata and enforces maximum upload size", async () => {
    const { adapter, send } = runtime({ maxUploadBytes: 4 });

    await adapter.put("tenant/file.txt", "data", {
      contentType: "text/plain",
      metadata: { tenant: "one" },
    });

    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Bucket: "documents",
      Key: "tenant/file.txt",
      Body: "data",
      ContentType: "text/plain",
      Metadata: { tenant: "one" },
    });
    await expect(adapter.put("too-large", "12345")).rejects.toThrow(
      "maximum size",
    );
  });

  it("atomically creates immutable objects without overwriting existing keys", async () => {
    const created = runtime();
    await expect(created.adapter.putIfAbsent("publication/release.json", Uint8Array.of(1))).resolves.toBe(true);
    expect((created.send.mock.calls[0]?.[0] as PutObjectCommand).input.IfNoneMatch).toBe("*");

    const existing = runtime();
    existing.send.mockRejectedValueOnce({ name: "PreconditionFailed", $metadata: { httpStatusCode: 412 } });
    await expect(existing.adapter.putIfAbsent("publication/release.json", Uint8Array.of(1))).resolves.toBe(false);
  });

  it("uploads streams with bounded multipart configuration", async () => {
    const { adapter } = runtime();

    await expect(
      adapter.putStream("large.bin", Readable.from([Buffer.from("data")]), {
        contentLength: 4,
      }),
    ).resolves.toEqual({ etag: "stream-etag" });
    await expect(
      adapter.putStream("large.bin", Readable.from([]), { partSizeBytes: 1 }),
    ).rejects.toThrow("at least 5 MiB");
  });

  it("buffers downloads and exposes Node streams explicitly", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const first = runtime();
    first.send.mockResolvedValueOnce({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(bytes) },
    });
    await expect(first.adapter.get("file.bin")).resolves.toEqual(Buffer.from(bytes));

    const stream = Readable.from(["hello"]);
    const second = runtime();
    second.send.mockResolvedValueOnce({ Body: stream });
    await expect(second.adapter.getStream("file.txt")).resolves.toBe(stream);
  });

  it("distinguishes missing objects from transport failures", async () => {
    const missing = runtime();
    missing.send.mockRejectedValueOnce({ name: "NotFound", $metadata: { httpStatusCode: 404 } });
    await expect(missing.adapter.exists("missing")).resolves.toBe(false);

    const failed = runtime();
    failed.send.mockRejectedValueOnce(new Error("network failed"));
    await expect(failed.adapter.exists("unknown")).rejects.toThrow("network failed");
  });

  it("paginates listings and preserves stable metadata defaults", async () => {
    const { adapter, send } = runtime();
    send
      .mockResolvedValueOnce({
        IsTruncated: true,
        NextContinuationToken: "next",
        Contents: [{ Key: "a", Size: 2 }],
      })
      .mockResolvedValueOnce({
        IsTruncated: false,
        Contents: [{ Key: "b", ETag: "etag-b" }],
      });

    await expect(adapter.list("tenant/")).resolves.toEqual([
      { key: "a", size: 2, lastModified: new Date(0) },
      { key: "b", size: 0, lastModified: new Date(0), etag: "etag-b" },
    ]);
    expect((send.mock.calls[1]?.[0] as ListObjectsV2Command).input).toMatchObject({
      ContinuationToken: "next",
    });
  });

  it("chunks batch deletion and surfaces per-object errors", async () => {
    const success = runtime();
    success.send.mockResolvedValue({});
    await success.adapter.deleteMany(
      Array.from({ length: 1_001 }, (_, index) => `object-${index}`),
    );
    expect(success.send).toHaveBeenCalledTimes(2);
    expect(success.send.mock.calls[0]?.[0]).toBeInstanceOf(DeleteObjectsCommand);

    const failed = runtime();
    failed.send.mockResolvedValueOnce({ Errors: [{ Key: "blocked", Code: "AccessDenied" }] });
    await expect(failed.adapter.deleteMany(["blocked"])).rejects.toThrow("blocked");
  });

  it("URL-encodes copy sources", async () => {
    const { adapter, send } = runtime();

    await adapter.copy("folder/a file#.pdf", "copied.pdf");

    const command = send.mock.calls[0]?.[0] as CopyObjectCommand;
    expect(command).toBeInstanceOf(CopyObjectCommand);
    expect(command.input.CopySource).toBe("documents/folder/a%20file%23.pdf");
  });

  it("creates bounded download and upload URLs", async () => {
    const { adapter } = runtime();

    await expect(adapter.createDownloadUrl("download.pdf", 60)).resolves.toContain(
      "signed",
    );
    await expect(adapter.createUploadUrl("upload.pdf")).resolves.toContain("signed");
    expect(sdkMocks.signedUrl.mock.calls[0]?.[1]).toBeInstanceOf(GetObjectCommand);
    expect(sdkMocks.signedUrl.mock.calls[1]?.[1]).toBeInstanceOf(PutObjectCommand);
    await expect(adapter.createDownloadUrl("file", 604_801)).rejects.toThrow(
      "604800",
    );
  });

  it("characterizes health and access-probe behavior", async () => {
    const healthy = runtime();
    await expect(healthy.adapter.health()).resolves.toEqual({ healthy: true });
    expect(healthy.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadBucketCommand);

    const probe = runtime();
    await probe.adapter.validateAccess();
    expect(probe.send.mock.calls.map((call) => call[0].constructor)).toEqual([
      HeadBucketCommand,
      PutObjectCommand,
      DeleteObjectCommand,
    ]);

    const cleanupFailure = runtime();
    cleanupFailure.send
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("delete denied"));
    await expect(cleanupFailure.adapter.validateAccess()).rejects.toThrow(
      "delete its sentinel",
    );
  });

  it("closes the SDK client exactly once", () => {
    const { adapter, destroy } = runtime();

    adapter.close();
    adapter.close();

    expect(destroy).toHaveBeenCalledOnce();
  });

  it("uses HEAD for metadata", async () => {
    const { adapter, send } = runtime();
    const modified = new Date("2026-01-01T00:00:00Z");
    send.mockResolvedValueOnce({
      ContentLength: 42,
      LastModified: modified,
      ETag: "etag",
      ContentType: "application/pdf",
    });

    await expect(adapter.getMetadata("invoice.pdf")).resolves.toEqual({
      key: "invoice.pdf",
      size: 42,
      lastModified: modified,
      etag: "etag",
      contentType: "application/pdf",
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });
});

function runtime(overrides: Record<string, unknown> = {}) {
  const send = vi.fn().mockResolvedValue({});
  const destroy = vi.fn();
  const client = { send, destroy } as unknown as S3Client;
  const adapter = new S3ObjectStorageRuntime(client, {
    region: "us-east-1",
    bucket: "documents",
    forcePathStyle: true,
    multipartPartSizeBytes: 5 * 1024 * 1024,
    multipartQueueSize: 4,
    maxUploadBytes: 100 * 1024 * 1024,
    presignedTtlSeconds: 900,
    ...overrides,
  });
  return { adapter, send, destroy };
}
