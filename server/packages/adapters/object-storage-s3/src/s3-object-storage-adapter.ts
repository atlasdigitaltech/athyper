import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { ObjectPutOptions, ObjectStorage } from "@athyper/server-contract-object-storage";
import type { Logger } from "@athyper/server-foundation/observability";
import { randomUUID } from "node:crypto";
import type { Readable } from "node:stream";

export interface S3ObjectStorageAdapterConfig {
  readonly region: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly accessKeyId?: string;
  readonly secretAccessKey?: string;
  readonly forcePathStyle?: boolean;
  readonly multipartPartSizeMb?: number;
  readonly multipartQueueSize?: number;
  readonly maxUploadMb?: number;
  readonly presignedTtlSeconds?: number;
  readonly logger?: Pick<Logger, "info" | "warn" | "error">;
}

export type PutObjectOptions = ObjectPutOptions;

export interface PutStreamOptions extends PutObjectOptions {
  readonly contentLength?: number;
  readonly partSizeBytes?: number;
}

export interface ObjectMetadata {
  readonly key: string;
  readonly size: number;
  readonly lastModified: Date;
  readonly etag?: string;
  readonly contentType?: string;
}

export interface ObjectStorageHealth {
  readonly healthy: boolean;
  readonly message?: string;
}

export interface S3ObjectStorageAdapter extends ObjectStorage {
  put(
    key: string,
    body: Buffer | Uint8Array | string,
    options?: PutObjectOptions,
  ): Promise<void>;
  putIfAbsent(
    key: string,
    body: Buffer | Uint8Array | string,
    options?: PutObjectOptions,
  ): Promise<boolean>;
  putStream(
    key: string,
    stream: Readable,
    options?: PutStreamOptions,
  ): Promise<{ etag?: string }>;
  get(key: string): Promise<Buffer>;
  getStream(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
  deleteMany(keys: readonly string[]): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<readonly ObjectMetadata[]>;
  getMetadata(key: string): Promise<ObjectMetadata>;
  copy(sourceKey: string, destinationKey: string): Promise<void>;
  createDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
  createUploadUrl(key: string, expirySeconds?: number): Promise<string>;
  health(): Promise<ObjectStorageHealth>;
  validateAccess(): Promise<void>;
  close(): void;
}

const MIN_MULTIPART_PART_SIZE = 5 * 1024 * 1024;
const DELETE_BATCH_SIZE = 1_000;

export function createS3ObjectStorageAdapter(
  config: S3ObjectStorageAdapterConfig,
): S3ObjectStorageAdapter {
  const resolved = validateConfig(config);
  const client = new S3Client({
    region: resolved.region,
    ...(resolved.endpoint ? { endpoint: resolved.endpoint } : {}),
    ...(resolved.credentials ? { credentials: resolved.credentials } : {}),
    forcePathStyle: resolved.forcePathStyle,
  });
  return new S3ObjectStorageRuntime(client, resolved);
}

interface ResolvedConfig {
  readonly region: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly credentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
  readonly forcePathStyle: boolean;
  readonly multipartPartSizeBytes: number;
  readonly multipartQueueSize: number;
  readonly maxUploadBytes: number;
  readonly presignedTtlSeconds: number;
  readonly logger?: S3ObjectStorageAdapterConfig["logger"];
}

export class S3ObjectStorageRuntime implements S3ObjectStorageAdapter {
  #closed = false;

  constructor(
    private readonly client: S3Client,
    private readonly config: ResolvedConfig,
  ) {}

  async put(
    key: string,
    body: Buffer | Uint8Array | string,
    options: PutObjectOptions = {},
  ): Promise<void> {
    const normalizedKey = requireObjectKey(key);
    const size = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
    this.#assertUploadSize(size);
    await this.#operation("s3_put_failed", { key: normalizedKey }, async () => {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: normalizedKey,
          Body: body,
          ...(options.contentType ? { ContentType: options.contentType } : {}),
          ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
        }),
      );
    });
  }

  async putIfAbsent(
    key: string,
    body: Buffer | Uint8Array | string,
    options: PutObjectOptions = {},
  ): Promise<boolean> {
    const normalizedKey = requireObjectKey(key);
    const size = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
    this.#assertUploadSize(size);
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: normalizedKey,
        Body: body,
        IfNoneMatch: "*",
        ...(options.contentType ? { ContentType: options.contentType } : {}),
        ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
      }));
      return true;
    } catch (error) {
      if (isPreconditionFailed(error)) return false;
      this.#logError("s3_put_if_absent_failed", error, { key: normalizedKey });
      throw error;
    }
  }

  async putStream(
    key: string,
    stream: Readable,
    options: PutStreamOptions = {},
  ): Promise<{ etag?: string }> {
    const normalizedKey = requireObjectKey(key);
    if (options.contentLength !== undefined) {
      this.#assertUploadSize(options.contentLength);
    }
    const partSize = options.partSizeBytes ?? this.config.multipartPartSizeBytes;
    if (!Number.isInteger(partSize) || partSize < MIN_MULTIPART_PART_SIZE) {
      throw new TypeError("S3 multipart part size must be at least 5 MiB");
    }

    return this.#operation(
      "s3_put_stream_failed",
      { key: normalizedKey },
      async () => {
        const upload = new Upload({
          client: this.client,
          params: {
            Bucket: this.config.bucket,
            Key: normalizedKey,
            Body: stream,
            ...(options.contentType ? { ContentType: options.contentType } : {}),
            ...(options.contentLength !== undefined
              ? { ContentLength: options.contentLength }
              : {}),
            ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
          },
          queueSize: this.config.multipartQueueSize,
          partSize,
          leavePartsOnError: false,
        });
        const result = await upload.done();
        return result.ETag ? { etag: result.ETag } : {};
      },
    );
  }

  async get(key: string): Promise<Buffer> {
    const response = await this.#getObject(key, "s3_get_failed");
    if (!response.Body) throw new Error(`S3 object has no body: ${key}`);
    if (typeof response.Body.transformToByteArray === "function") {
      return Buffer.from(await response.Body.transformToByteArray());
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async getStream(key: string): Promise<Readable> {
    const response = await this.#getObject(key, "s3_get_stream_failed");
    if (!response.Body || typeof (response.Body as { pipe?: unknown }).pipe !== "function") {
      throw new Error(`S3 object body is not a Node.js readable stream: ${key}`);
    }
    return response.Body as Readable;
  }

  async delete(key: string): Promise<void> {
    const normalizedKey = requireObjectKey(key);
    await this.#operation("s3_delete_failed", { key: normalizedKey }, async () => {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: normalizedKey }),
      );
    });
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    const normalized = keys.map(requireObjectKey);
    for (let offset = 0; offset < normalized.length; offset += DELETE_BATCH_SIZE) {
      const batch = normalized.slice(offset, offset + DELETE_BATCH_SIZE);
      const response = await this.#operation(
        "s3_delete_many_failed",
        { count: batch.length },
        () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.config.bucket,
              Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
            }),
          ),
      );
      if (response.Errors?.length) {
        throw new Error(
          `S3 failed to delete ${response.Errors.length} object(s): ${response.Errors.map((error) => error.Key ?? "unknown").join(", ")}`,
        );
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    const normalizedKey = requireObjectKey(key);
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: normalizedKey }),
      );
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      this.#logError("s3_exists_failed", error, { key: normalizedKey });
      throw error;
    }
  }

  async list(prefix?: string): Promise<readonly ObjectMetadata[]> {
    const objects: ObjectMetadata[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.#operation(
        "s3_list_failed",
        { prefix },
        () =>
          this.client.send(
            new ListObjectsV2Command({
              Bucket: this.config.bucket,
              ...(prefix ? { Prefix: prefix } : {}),
              ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
            }),
          ),
      );
      for (const object of response.Contents ?? []) {
        if (!object.Key) continue;
        objects.push({
          key: object.Key,
          size: object.Size ?? 0,
          lastModified: object.LastModified ?? new Date(0),
          ...(object.ETag ? { etag: object.ETag } : {}),
        });
      }
      const next = response.IsTruncated ? response.NextContinuationToken : undefined;
      if (response.IsTruncated && !next) {
        throw new Error("S3 returned a truncated listing without a continuation token");
      }
      continuationToken = next;
    } while (continuationToken);
    return objects;
  }

  async getMetadata(key: string): Promise<ObjectMetadata> {
    const normalizedKey = requireObjectKey(key);
    return this.#operation(
      "s3_metadata_failed",
      { key: normalizedKey },
      async () => {
        const response = await this.client.send(
          new HeadObjectCommand({ Bucket: this.config.bucket, Key: normalizedKey }),
        );
        return {
          key: normalizedKey,
          size: response.ContentLength ?? 0,
          lastModified: response.LastModified ?? new Date(0),
          ...(response.ETag ? { etag: response.ETag } : {}),
          ...(response.ContentType ? { contentType: response.ContentType } : {}),
        };
      },
    );
  }

  async copy(sourceKey: string, destinationKey: string): Promise<void> {
    const source = requireObjectKey(sourceKey);
    const destination = requireObjectKey(destinationKey);
    const copySource = [this.config.bucket, ...source.split("/")]
      .map(encodeURIComponent)
      .join("/");
    await this.#operation(
      "s3_copy_failed",
      { sourceKey: source, destinationKey: destination },
      async () => {
        await this.client.send(
          new CopyObjectCommand({
            Bucket: this.config.bucket,
            CopySource: copySource,
            Key: destination,
          }),
        );
      },
    );
  }

  createDownloadUrl(key: string, expirySeconds?: number): Promise<string> {
    return this.#sign(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: requireObjectKey(key) }),
      expirySeconds,
    );
  }

  createUploadUrl(key: string, expirySeconds?: number): Promise<string> {
    return this.#sign(
      new PutObjectCommand({ Bucket: this.config.bucket, Key: requireObjectKey(key) }),
      expirySeconds,
    );
  }

  async health(): Promise<ObjectStorageHealth> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async validateAccess(): Promise<void> {
    const sentinelKey = `_athyper/probes/${randomUUID()}`;
    await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: sentinelKey,
        Body: "ok",
        ContentType: "text/plain",
      }),
    );
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: sentinelKey }),
      );
    } catch (error) {
      this.config.logger?.warn("s3_access_probe_cleanup_failed", {
        key: sentinelKey,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `S3 access probe could not delete its sentinel object: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.client.destroy();
  }

  #getObject(key: string, event: string) {
    const normalizedKey = requireObjectKey(key);
    return this.#operation(event, { key: normalizedKey }, () =>
      this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: normalizedKey }),
      ),
    );
  }

  async #sign(
    command: GetObjectCommand | PutObjectCommand,
    expirySeconds?: number,
  ): Promise<string> {
    const expiresIn = expirySeconds ?? this.config.presignedTtlSeconds;
    if (!Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn > 604_800) {
      throw new TypeError("S3 presigned URL expiry must be between 1 and 604800 seconds");
    }
    return getSignedUrl(this.client, command, { expiresIn });
  }

  #assertUploadSize(size: number): void {
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new TypeError("S3 upload size must be a non-negative safe integer");
    }
    if (size > this.config.maxUploadBytes) {
      throw new RangeError("S3 upload exceeds configured maximum size");
    }
  }

  async #operation<Result>(
    event: string,
    fields: Readonly<Record<string, unknown>>,
    work: () => Promise<Result>,
  ): Promise<Result> {
    try {
      return await work();
    } catch (error) {
      this.#logError(event, error, fields);
      throw error;
    }
  }

  #logError(
    event: string,
    error: unknown,
    fields: Readonly<Record<string, unknown>>,
  ): void {
    this.config.logger?.error(event, {
      ...fields,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function validateConfig(config: S3ObjectStorageAdapterConfig): ResolvedConfig {
  const region = config.region.trim();
  const bucket = config.bucket.trim();
  if (!region) throw new TypeError("S3 region must not be empty");
  if (!bucket) throw new TypeError("S3 bucket must not be empty");

  const endpoint = config.endpoint?.trim() || undefined;
  if (endpoint) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new TypeError("S3 endpoint is invalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("S3 endpoint must use HTTP or HTTPS");
    }
  }

  const hasAccessKey = Boolean(config.accessKeyId?.trim());
  const hasSecretKey = Boolean(config.secretAccessKey?.trim());
  if (hasAccessKey !== hasSecretKey) {
    throw new TypeError("S3 access key and secret key must be configured together");
  }

  const multipartPartSizeMb = config.multipartPartSizeMb ?? 5;
  const multipartQueueSize = config.multipartQueueSize ?? 4;
  const maxUploadMb = config.maxUploadMb ?? 100;
  const presignedTtlSeconds = config.presignedTtlSeconds ?? 900;
  for (const [name, value] of [
    ["multipart part size", multipartPartSizeMb],
    ["multipart queue size", multipartQueueSize],
    ["maximum upload size", maxUploadMb],
    ["presigned TTL", presignedTtlSeconds],
  ] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new TypeError(`S3 ${name} must be a positive integer`);
    }
  }
  if (multipartPartSizeMb < 5) {
    throw new TypeError("S3 multipart part size must be at least 5 MiB");
  }
  if (presignedTtlSeconds > 604_800) {
    throw new TypeError("S3 presigned TTL cannot exceed 604800 seconds");
  }

  return {
    region,
    bucket,
    ...(endpoint ? { endpoint } : {}),
    ...(hasAccessKey && hasSecretKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId!.trim(),
            secretAccessKey: config.secretAccessKey!.trim(),
          },
        }
      : {}),
    forcePathStyle: config.forcePathStyle ?? Boolean(endpoint),
    multipartPartSizeBytes: multipartPartSizeMb * 1024 * 1024,
    multipartQueueSize,
    maxUploadBytes: maxUploadMb * 1024 * 1024,
    presignedTtlSeconds,
    logger: config.logger,
  };
}

function requireObjectKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) throw new TypeError("S3 object key must not be empty");
  if (Buffer.byteLength(normalized) > 1_024) {
    throw new TypeError("S3 object key must not exceed 1024 bytes");
  }
  return normalized;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = Reflect.get(error, "name");
  const metadata = Reflect.get(error, "$metadata");
  const status =
    metadata && typeof metadata === "object"
      ? Reflect.get(metadata, "httpStatusCode")
      : undefined;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}

function isPreconditionFailed(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = Reflect.get(error, "name");
  const metadata = Reflect.get(error, "$metadata");
  const status = metadata && typeof metadata === "object"
    ? Reflect.get(metadata, "httpStatusCode")
    : undefined;
  return name === "PreconditionFailed" || status === 412;
}
