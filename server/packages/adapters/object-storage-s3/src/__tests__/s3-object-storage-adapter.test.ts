import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import { getEventListeners } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createS3ObjectStorageAdapter,
  S3ObjectStorageRuntime,
} from "../s3-object-storage-adapter.js";

const sdkMocks = vi.hoisted(() => ({
  signedUrl: vi.fn(),
  uploadDone: vi.fn(),
  uploadAbort: vi.fn(),
  uploadOptions: undefined as { params: { Body: Readable } } | undefined,
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: sdkMocks.signedUrl,
}));

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class MockUpload {
    constructor(options: { params: { Body: Readable } }) {
      sdkMocks.uploadOptions = options;
    }
    done = sdkMocks.uploadDone;
    abort = sdkMocks.uploadAbort;
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

  it("renews separate credential-process profiles and does not sign empty-body checksums", async () => {
    const dir = mkdtempSync(join(tmpdir(), "s3-profiles-"));
    const previous = process.env.AWS_CONFIG_FILE;
    const script = join(dir, "credentials.cjs");
    writeFileSync(
      script,
      `const fs=require('node:fs');const role=process.argv[2],file=process.argv[3];let count=0;try{count=Number(fs.readFileSync(file,'utf8'))}catch{}fs.writeFileSync(file,String(++count));console.log(JSON.stringify({Version:1,AccessKeyId:role+'-'+count,SecretAccessKey:'fixture-secret',SessionToken:'fixture-token',Expiration:new Date(Date.now()+60000).toISOString()}));`,
    );
    process.env.AWS_CONFIG_FILE = join(dir, "config");
    writeFileSync(
      process.env.AWS_CONFIG_FILE,
      ["app", "writer"]
        .map(
          (role) =>
            `[profile ${role}]\ncredential_process = ${process.execPath} ${script} ${role} ${join(dir, role + ".count")}\n`,
        )
        .join("\n"),
    );
    const adapters = [];
    try {
      for (const role of ["app", "writer"]) {
        const adapter = createS3ObjectStorageAdapter({
          region: "eu-west-1",
          bucket: "fixture-bucket",
          credentialProfile: role,
        });
        adapters.push(adapter);
        await adapter.createUploadUrl("fixture");
        const signer = sdkMocks.signedUrl.mock.calls.at(-1)![0] as S3Client;
        expect(await signer.config.requestChecksumCalculation()).toBe(
          "WHEN_REQUIRED",
        );
        const first = await signer.config.credentials();
        const second = await signer.config.credentials();
        expect(first.accessKeyId).toMatch(new RegExp(`^${role}-`));
        expect(second.accessKeyId).toMatch(new RegExp(`^${role}-`));
        expect(second.accessKeyId).not.toBe(first.accessKeyId);
        expect(second.sessionToken).toBe("fixture-token");
      }
    } finally {
      for (const adapter of adapters) adapter.close();
      if (previous === undefined) delete process.env.AWS_CONFIG_FILE;
      else process.env.AWS_CONFIG_FILE = previous;
      rmSync(dir, { recursive: true, force: true });
    }
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
        publicEndpoint: "ftp://objects.test",
      }),
    ).toThrow("public endpoint");
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
    await expect(
      created.adapter.putIfAbsent("publication/release.json", Uint8Array.of(1)),
    ).resolves.toBe(true);
    expect(
      (created.send.mock.calls[0]?.[0] as PutObjectCommand).input.IfNoneMatch,
    ).toBe("*");

    const existing = runtime();
    existing.send.mockRejectedValueOnce({
      name: "PreconditionFailed",
      $metadata: { httpStatusCode: 412 },
    });
    await expect(
      existing.adapter.putIfAbsent(
        "publication/release.json",
        Uint8Array.of(1),
      ),
    ).resolves.toBe(false);
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

  it("aborts a multipart upload when an undeclared stream exceeds the maximum", async () => {
    const { adapter } = runtime({ maxUploadBytes: 4 });
    sdkMocks.uploadDone.mockImplementationOnce(async () => {
      for await (const _chunk of sdkMocks.uploadOptions!.params.Body) {
        /* consume upload */
      }
      return {};
    });
    await expect(
      adapter.putStream(
        "large.bin",
        Readable.from([Buffer.from("123"), Buffer.from("45")]),
      ),
    ).rejects.toMatchObject({
      code: "S3_UPLOAD_TOO_LARGE",
    });
    expect(sdkMocks.uploadAbort).toHaveBeenCalledOnce();
  });

  it("buffers downloads and exposes Node streams explicitly", async () => {
    const bytes = Uint8Array.from([1, 2, 3]);
    const first = runtime();
    first.send.mockResolvedValueOnce({
      Body: { transformToByteArray: vi.fn().mockResolvedValue(bytes) },
    });
    await expect(first.adapter.get("file.bin")).resolves.toEqual(
      Buffer.from(bytes),
    );

    const stream = Readable.from(["hello"]);
    const second = runtime();
    second.send.mockResolvedValueOnce({ Body: stream });
    await expect(second.adapter.getStream("file.txt")).resolves.toBe(stream);
  });

  it("forwards the caller's AbortSignal to the SDK request", async () => {
    const { adapter, send } = runtime();
    send.mockResolvedValueOnce({ Body: Readable.from(["hello"]) });
    const controller = new AbortController();
    await adapter.getStream("file.txt", { signal: controller.signal });
    expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand), {
      abortSignal: controller.signal,
    });
  });

  it("does not pass an options object to the SDK when no signal is given", async () => {
    const { adapter, send } = runtime();
    send.mockResolvedValueOnce({ Body: Readable.from(["hello"]) });
    await adapter.getStream("file.txt");
    expect(send).toHaveBeenCalledWith(expect.any(GetObjectCommand), undefined);
  });

  it("destroys the stream with an error (not a silent EOF) when the signal aborts mid-read", async () => {
    // A plain, manually-driven Readable — not Readable.from(asyncGenerator) — because the real
    // S3 SDK body is a socket-backed stream with no wrapped generator to hang returning; this
    // mirrors that shape instead of the unrelated async-iterator-return pathology.
    const stream = new Readable({ read() {} });
    stream.push(Buffer.from("first-chunk"));
    // No further push() calls — the stream just idles, standing in for a stalled network read.
    const { adapter, send } = runtime();
    send.mockResolvedValueOnce({ Body: stream });
    const controller = new AbortController();
    const result = await adapter.getStream("file.txt", {
      signal: controller.signal,
    });

    const chunks: Buffer[] = [];
    const iterationError = (async () => {
      try {
        for await (const chunk of result) chunks.push(chunk as Buffer);
        return undefined;
      } catch (error) {
        return error;
      }
    })();

    await new Promise((resolve) => setImmediate(resolve));
    controller.abort(new Error("caller cancelled"));
    await expect(iterationError).resolves.toMatchObject({
      message: "caller cancelled",
    });
    // The first chunk really was delivered before the abort — this wasn't a clean/empty read.
    expect(chunks.length).toBe(1);
    expect(result.destroyed).toBe(true);
  });

  it("destroys the stream immediately when the signal is already aborted, without an unhandled error", async () => {
    const { adapter, send } = runtime();
    const stream = Readable.from(["hello"]);
    send.mockResolvedValueOnce({ Body: stream });
    const controller = new AbortController();
    controller.abort(new Error("already gone"));
    // No manual "error" listener attached here — the adapter itself must guarantee one exists,
    // since nothing else in this test consumes or listens to the stream.
    const result = await adapter.getStream("file.txt", {
      signal: controller.signal,
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(result.destroyed).toBe(true);
  });

  it("does not crash the process when the signal aborts before the caller starts consuming the stream", async () => {
    const { adapter, send } = runtime();
    const stream = new Readable({ read() {} });
    stream.push(Buffer.from("hello"));
    send.mockResolvedValueOnce({ Body: stream });
    const controller = new AbortController();
    const result = await adapter.getStream("file.txt", {
      signal: controller.signal,
    });

    // Cancel now, before attaching any consumer (for-await-of, .on("data"), etc.) — reproduces
    // the window where the SDK's abortSignal handling and our own destroy() race a caller that
    // hasn't started reading yet.
    controller.abort(new Error("cancelled before consumption"));
    await new Promise((resolve) => setImmediate(resolve));
    expect(result.destroyed).toBe(true);

    // A consumer that starts reading afterward still sees the real failure, not a silent empty
    // read — the safety-net listener must not swallow the error for genuine consumers.
    const iterationError = await (async () => {
      try {
        for await (const _chunk of result) {
          /* drain */
        }
        return undefined;
      } catch (error) {
        return error;
      }
    })();
    expect(iterationError).toMatchObject({
      message: "cancelled before consumption",
    });
  });

  it("removes its abort listener once the stream closes normally, leaking nothing", async () => {
    const { adapter, send } = runtime();
    const stream = Readable.from(["hello"]);
    send.mockResolvedValueOnce({ Body: stream });
    const controller = new AbortController();
    const result = await adapter.getStream("file.txt", {
      signal: controller.signal,
    });
    for await (const _chunk of result) {
      /* drain */
    }
    await new Promise((resolve) => setImmediate(resolve));
    expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  });

  it("distinguishes missing objects from transport failures", async () => {
    const missing = runtime();
    missing.send.mockRejectedValueOnce({
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });
    await expect(missing.adapter.exists("missing")).resolves.toBe(false);

    const failed = runtime();
    failed.send.mockRejectedValueOnce(new Error("network failed"));
    await expect(failed.adapter.exists("unknown")).rejects.toThrow(
      "network failed",
    );
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
    expect(
      (send.mock.calls[1]?.[0] as ListObjectsV2Command).input,
    ).toMatchObject({
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
    expect(success.send.mock.calls[0]?.[0]).toBeInstanceOf(
      DeleteObjectsCommand,
    );

    const failed = runtime();
    failed.send.mockResolvedValueOnce({
      Errors: [{ Key: "blocked", Code: "AccessDenied" }],
    });
    await expect(failed.adapter.deleteMany(["blocked"])).rejects.toThrow(
      "blocked",
    );
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

    await expect(
      adapter.createDownloadUrl("download.pdf", 60),
    ).resolves.toContain("signed");
    await expect(adapter.createUploadUrl("upload.pdf")).resolves.toContain(
      "signed",
    );
    expect(sdkMocks.signedUrl.mock.calls[0]?.[1]).toBeInstanceOf(
      GetObjectCommand,
    );
    expect(sdkMocks.signedUrl.mock.calls[1]?.[1]).toBeInstanceOf(
      PutObjectCommand,
    );
    await expect(adapter.createDownloadUrl("file", 604_801)).rejects.toThrow(
      "604800",
    );
  });

  it("signs browser URLs with the separately configured public client", async () => {
    const internal = { send: vi.fn(), destroy: vi.fn() } as unknown as S3Client;
    const signing = { send: vi.fn(), destroy: vi.fn() } as unknown as S3Client;
    const adapter = new S3ObjectStorageRuntime(
      internal,
      {
        region: "us-east-1",
        bucket: "documents",
        forcePathStyle: true,
        multipartPartSizeBytes: 5 * 1024 * 1024,
        multipartQueueSize: 4,
        maxUploadBytes: 100 * 1024 * 1024,
        presignedTtlSeconds: 900,
      },
      signing,
    );
    await adapter.createDownloadUrl("report.ndjson", 60);
    expect(sdkMocks.signedUrl).toHaveBeenCalledWith(
      signing,
      expect.any(GetObjectCommand),
      { expiresIn: 60 },
    );
    adapter.close();
    expect(signing.destroy).toHaveBeenCalled();
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
