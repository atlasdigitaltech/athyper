import { fromIni } from "@aws-sdk/credential-provider-ini";
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
import type {
  ObjectGetStreamOptions,
  ObjectPutOptions,
  ObjectStorage,
} from "@athyper/server-contract-object-storage";
import type { Logger } from "@athyper/server-foundation/observability";
import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";

export interface S3ObjectStorageAdapterConfig {
  readonly region: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly publicEndpoint?: string;
  readonly credentialProfile?: string;
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
    stream: Readable | AsyncIterable<Uint8Array>,
    options?: PutStreamOptions,
  ): Promise<{ etag?: string }>;
  get(key: string): Promise<Buffer>;
  getStream(key: string, options?: ObjectGetStreamOptions): Promise<Readable>;
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
  validateReadAccess(sentinelKey: string): Promise<void>;
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
  // Presigning has no upload body; do not sign a checksum of an empty body.
  // Normal SDK uploads keep their default checksum protection.
  const signingClient = new S3Client({
    requestChecksumCalculation: "WHEN_REQUIRED",
    region: resolved.region,
    ...((resolved.publicEndpoint ?? resolved.endpoint)
      ? { endpoint: resolved.publicEndpoint ?? resolved.endpoint }
      : {}),
    ...(resolved.credentials ? { credentials: resolved.credentials } : {}),
    forcePathStyle: resolved.forcePathStyle,
  });
  return new S3ObjectStorageRuntime(client, resolved, signingClient);
}

interface ResolvedConfig {
  readonly region: string;
  readonly bucket: string;
  readonly endpoint?: string;
  readonly publicEndpoint?: string;
  readonly credentials?:
    | {
        readonly accessKeyId: string;
        readonly secretAccessKey: string;
      }
    | ReturnType<typeof fromIni>;
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
    private readonly signingClient: S3Client = client,
  ) {}

  async put(
    key: string,
    body: Buffer | Uint8Array | string,
    options: PutObjectOptions = {},
  ): Promise<void> {
    const normalizedKey = requireObjectKey(key);
    const size =
      typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
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
    const size =
      typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
    this.#assertUploadSize(size);
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: normalizedKey,
          Body: body,
          IfNoneMatch: "*",
          ...(options.contentType ? { ContentType: options.contentType } : {}),
          ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
        }),
      );
      return true;
    } catch (error) {
      if (isPreconditionFailed(error)) return false;
      this.#logError("s3_put_if_absent_failed", error, { key: normalizedKey });
      throw error;
    }
  }

  async putStream(
    key: string,
    stream: Readable | AsyncIterable<Uint8Array>,
    options: PutStreamOptions = {},
  ): Promise<{ etag?: string }> {
    const normalizedKey = requireObjectKey(key);
    if (options.contentLength !== undefined) {
      this.#assertUploadSize(options.contentLength);
    }
    const partSize =
      options.partSizeBytes ?? this.config.multipartPartSizeBytes;
    if (!Number.isInteger(partSize) || partSize < MIN_MULTIPART_PART_SIZE) {
      throw new TypeError("S3 multipart part size must be at least 5 MiB");
    }

    return this.#operation(
      "s3_put_stream_failed",
      { key: normalizedKey },
      async () => {
        const body = boundedUploadStream(stream, this.config.maxUploadBytes);
        const upload = new Upload({
          client: this.client,
          params: {
            Bucket: this.config.bucket,
            Key: normalizedKey,
            Body: body,
            ...(options.contentType
              ? { ContentType: options.contentType }
              : {}),
            ...(options.contentLength !== undefined
              ? { ContentLength: options.contentLength }
              : {}),
            ...(options.metadata ? { Metadata: { ...options.metadata } } : {}),
          },
          queueSize: this.config.multipartQueueSize,
          partSize,
          leavePartsOnError: false,
        });
        try {
          const result = await upload.done();
          return result.ETag ? { etag: result.ETag } : {};
        } catch (error) {
          if (isUploadLimitError(error)) upload.abort();
          throw error;
        }
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

  async getStream(
    key: string,
    options: ObjectGetStreamOptions = {},
  ): Promise<Readable> {
    const response = await this.#getObject(
      key,
      "s3_get_stream_failed",
      options.signal,
    );
    if (
      !response.Body ||
      typeof (response.Body as { pipe?: unknown }).pipe !== "function"
    ) {
      throw new Error(
        `S3 object body is not a Node.js readable stream: ${key}`,
      );
    }
    const stream = response.Body as Readable;
    // A stream with zero "error" listeners throws its error as an uncaught exception the instant
    // one occurs, rather than surfacing it to whoever eventually reads it. The caller may cancel
    // before ever attaching its own consumer (e.g. immediately after this call resolves, before
    // iterating) — so establish handling now, before any destroy() below can fire one. This is a
    // safety net, not a sink: Node delivers an "error" event to every listener, so a real
    // consumer's own handling (for-await-of, .on("error"), etc.) still runs and still sees it.
    stream.on("error", () => undefined);
    // `abortSignal` on the SDK call covers the request/response lifecycle, but once a signal
    // fires mid-read there is no guarantee the caller's iteration ever unwinds far enough to
    // close this stream on its own (see the malware scanner's own iterator-cleanup notes) —
    // destroy it directly, and with an Error so consumers see a failure, not a truncated EOF
    // that could be mistaken for a complete, clean read.
    if (options.signal) {
      const onAbort = () => stream.destroy(toAbortError(options.signal!, key));
      if (options.signal.aborted) onAbort();
      else options.signal.addEventListener("abort", onAbort, { once: true });
      stream.once("close", () =>
        options.signal!.removeEventListener("abort", onAbort),
      );
    }
    return stream;
  }

  async delete(key: string): Promise<void> {
    const normalizedKey = requireObjectKey(key);
    await this.#operation(
      "s3_delete_failed",
      { key: normalizedKey },
      async () => {
        await this.client.send(
          new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: normalizedKey,
          }),
        );
      },
    );
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    const normalized = keys.map(requireObjectKey);
    for (
      let offset = 0;
      offset < normalized.length;
      offset += DELETE_BATCH_SIZE
    ) {
      const batch = normalized.slice(offset, offset + DELETE_BATCH_SIZE);
      const response = await this.#operation(
        "s3_delete_many_failed",
        { count: batch.length },
        () =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.config.bucket,
              Delete: {
                Objects: batch.map((key) => ({ Key: key })),
                Quiet: true,
              },
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
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: normalizedKey,
        }),
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
      const response = await this.#operation("s3_list_failed", { prefix }, () =>
        this.client.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            ...(prefix ? { Prefix: prefix } : {}),
            ...(continuationToken
              ? { ContinuationToken: continuationToken }
              : {}),
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
      const next = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
      if (response.IsTruncated && !next) {
        throw new Error(
          "S3 returned a truncated listing without a continuation token",
        );
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
          new HeadObjectCommand({
            Bucket: this.config.bucket,
            Key: normalizedKey,
          }),
        );
        return {
          key: normalizedKey,
          size: response.ContentLength ?? 0,
          lastModified: response.LastModified ?? new Date(0),
          ...(response.ETag ? { etag: response.ETag } : {}),
          ...(response.ContentType
            ? { contentType: response.ContentType }
            : {}),
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
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: requireObjectKey(key),
      }),
      expirySeconds,
    );
  }

  createUploadUrl(key: string, expirySeconds?: number): Promise<string> {
    return this.#sign(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: requireObjectKey(key),
      }),
      expirySeconds,
    );
  }

  async health(): Promise<ObjectStorageHealth> {
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: this.config.bucket }),
      );
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
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.config.bucket }),
    );
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
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: sentinelKey,
        }),
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

  async validateReadAccess(sentinelKey: string): Promise<void> {
    const normalizedKey = requireObjectKey(sentinelKey);
    await this.client.send(
      new HeadBucketCommand({ Bucket: this.config.bucket }),
    );
    await this.client.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: normalizedKey }),
    );
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.client.destroy();
    if (this.signingClient !== this.client) this.signingClient.destroy();
  }

  #getObject(key: string, event: string, signal?: AbortSignal) {
    const normalizedKey = requireObjectKey(key);
    return this.#operation(event, { key: normalizedKey }, () =>
      this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: normalizedKey,
        }),
        signal ? { abortSignal: signal } : undefined,
      ),
    );
  }

  async #sign(
    command: GetObjectCommand | PutObjectCommand,
    expirySeconds?: number,
  ): Promise<string> {
    const expiresIn = expirySeconds ?? this.config.presignedTtlSeconds;
    if (!Number.isInteger(expiresIn) || expiresIn <= 0 || expiresIn > 604_800) {
      throw new TypeError(
        "S3 presigned URL expiry must be between 1 and 604800 seconds",
      );
    }
    return getSignedUrl(this.signingClient, command, { expiresIn });
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

const UPLOAD_LIMIT_CODE = "S3_UPLOAD_TOO_LARGE";

function boundedUploadStream(
  source: Readable | AsyncIterable<Uint8Array>,
  maxBytes: number,
): Readable {
  let total = 0;
  const counter = new Transform({
    transform(chunk: Buffer | Uint8Array | string, encoding, callback) {
      const size =
        typeof chunk === "string"
          ? Buffer.byteLength(chunk, encoding)
          : chunk.byteLength;
      total += size;
      if (total > maxBytes) {
        callback(
          Object.assign(
            new RangeError(
              `Upload exceeds configured maximum size of ${maxBytes} bytes`,
            ),
            { code: UPLOAD_LIMIT_CODE },
          ),
        );
        return;
      }
      callback(null, chunk);
    },
  });
  const readable = source instanceof Readable ? source : Readable.from(source);
  readable.on("error", (error) => counter.destroy(error));
  return readable.pipe(counter);
}

function isUploadLimitError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    Reflect.get(error, "code") === UPLOAD_LIMIT_CODE,
  );
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
  const publicEndpoint = config.publicEndpoint?.trim() || undefined;
  if (publicEndpoint) {
    let url: URL;
    try {
      url = new URL(publicEndpoint);
    } catch {
      throw new TypeError("S3 public endpoint is invalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new TypeError("S3 public endpoint must use HTTP or HTTPS");
    }
  }

  const hasAccessKey = Boolean(config.accessKeyId?.trim());
  const hasSecretKey = Boolean(config.secretAccessKey?.trim());
  if (hasAccessKey !== hasSecretKey) {
    throw new TypeError(
      "S3 access key and secret key must be configured together",
    );
  }

  if (config.credentialProfile && hasAccessKey) {
    throw new TypeError(
      "S3 credential profile and static credentials are mutually exclusive",
    );
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
    ...(publicEndpoint ? { publicEndpoint } : {}),
    ...(hasAccessKey && hasSecretKey
      ? {
          credentials: {
            accessKeyId: config.accessKeyId!.trim(),
            secretAccessKey: config.secretAccessKey!.trim(),
          },
        }
      : {}),
    ...(config.credentialProfile
      ? { credentials: fromIni({ profile: config.credentialProfile }) }
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

function toAbortError(signal: AbortSignal, key: string): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(`S3 stream for ${key} was aborted`);
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
  const status =
    metadata && typeof metadata === "object"
      ? Reflect.get(metadata, "httpStatusCode")
      : undefined;
  return name === "PreconditionFailed" || status === 412;
}
