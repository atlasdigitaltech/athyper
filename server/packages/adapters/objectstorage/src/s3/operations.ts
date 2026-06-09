import type { Readable } from "stream";
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
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  ObjectMetadata,
  ObjectStorageAdapter,
  ObjectStorageConfig,
  PutOptions,
  PutStreamOptions,
} from "../types.js";

/**
 * S3-backed implementation of ObjectStorageAdapter.
 *
 * All operations are thin wrappers around the AWS SDK v3 commands.
 * Errors are logged via the optional AdapterLogger (when provided) and
 * re-thrown so the circuit-breaker protection layer in the runtime can
 * track failure rates. healthCheck() is the exception — it returns a
 * structured result rather than throwing.
 */
export class S3ObjectStorageAdapter implements ObjectStorageAdapter {
  private readonly logger: ObjectStorageConfig["logger"];

  constructor(
    private readonly client: S3Client,
    private readonly config: ObjectStorageConfig,
  ) {
    this.logger = config.logger;
  }

  async put(
    key: string,
    body: Buffer | string,
    opts?: PutOptions,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: opts?.contentType,
          Metadata: opts?.metadata,
          ACL: opts?.acl,
        }),
      );
    } catch (error) {
      this.logger?.error("s3_put_error", { key, error: String(error) });
      throw error;
    }
  }

  async putStream(
    key: string,
    stream: Readable,
    opts?: PutStreamOptions,
  ): Promise<{ etag?: string }> {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket:        this.config.bucket,
          Key:           key,
          Body:          stream,
          ContentType:   opts?.contentType,
          ContentLength: opts?.contentLength,
          Metadata:      opts?.metadata,
          ACL:           opts?.acl,
        },
        queueSize:          this.config.multipartQueueSize,
        partSize:           opts?.partSize ?? this.config.multipartPartSizeMb * 1024 * 1024,
        leavePartsOnError:  false,
      });

      const result = await upload.done();
      return { etag: result.ETag };
    } catch (error) {
      this.logger?.error("s3_put_stream_error", { key, error: String(error) });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        throw new Error(`Object not found: ${key}`);
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      this.logger?.error("s3_get_error", { key, error: String(error) });
      throw error;
    }
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key:    key,
        }),
      );

      if (!response.Body) {
        throw new Error(`Object not found or empty body: ${key}`);
      }

      // The SDK v3 Body is a ReadableStream (web) in browser environments and a
      // Node.js IncomingMessage-like stream in Node.js. Cast to Readable so callers
      // can use the Node.js stream API (pipe, events) uniformly.
      return response.Body as unknown as NodeJS.ReadableStream;
    } catch (error) {
      this.logger?.error("s3_get_stream_error", { key, error: String(error) });
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      this.logger?.error("s3_delete_error", { key, error: String(error) });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error: unknown) {
      const e = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
        return false;
      }

      this.logger?.error("s3_exists_error", { key, error: String(error) });
      throw error;
    }
  }

  async list(prefix?: string): Promise<ObjectMetadata[]> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
        }),
      );

      return (response.Contents ?? []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
        etag: obj.ETag,
      }));
    } catch (error) {
      this.logger?.error("s3_list_error", { prefix, error: String(error) });
      throw error;
    }
  }

  async getPresignedUrl(key: string, expirySeconds?: number): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: expirySeconds ?? this.config.presignedTtlSeconds,
      });
    } catch (error) {
      this.logger?.error("s3_presigned_url_error", { key, error: String(error) });
      throw error;
    }
  }

  async putPresignedUrl(key: string, expirySeconds?: number): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, {
        expiresIn: expirySeconds ?? this.config.presignedTtlSeconds,
      });
    } catch (error) {
      this.logger?.error("s3_put_presigned_url_error", { key, error: String(error) });
      throw error;
    }
  }

  async getMetadata(key: string): Promise<ObjectMetadata> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
      );

      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
        etag: response.ETag,
        contentType: response.ContentType,
      };
    } catch (error) {
      this.logger?.error("s3_metadata_error", { key, error: String(error) });
      throw error;
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    if (keys.length === 0) return;

    // S3/MinIO hard protocol limit: 1000 objects per DeleteObjects request.
    // Chunk to avoid a 400 MalformedXML / "too many keys" error.
    const CHUNK_SIZE = 1000;
    const chunks: string[][] = [];
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      chunks.push(keys.slice(i, i + CHUNK_SIZE));
    }

    try {
      await Promise.all(
        chunks.map((chunk) =>
          this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.config.bucket,
              Delete: { Objects: chunk.map((key) => ({ Key: key })) },
            }),
          ),
        ),
      );
    } catch (error) {
      this.logger?.error("s3_delete_many_error", { count: keys.length, error: String(error) });
      throw error;
    }
  }

  async copyObject(sourceKey: string, destKey: string): Promise<void> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.config.bucket,
          CopySource: `${this.config.bucket}/${sourceKey}`,
          Key: destKey,
        }),
      );
    } catch (error) {
      this.logger?.error("s3_copy_error", { sourceKey, destKey, error: String(error) });
      throw error;
    }
  }

  async validateBucketAccess(): Promise<void> {
    const bucket  = this.config.bucket;
    const sentinelKey = `_athyper_startup_probe_${Date.now()}`;

    // 1. Bucket exists + credentials can reach it
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const e = error as { $metadata?: { httpStatusCode?: number }; message?: string };
      const status = e.$metadata?.httpStatusCode;
      if (status === 403) {
        throw new Error(`S3 bucket "${bucket}" exists but credentials lack access (403 Forbidden)`);
      }
      if (status === 404) {
        throw new Error(`S3 bucket "${bucket}" does not exist (404 Not Found). Create the bucket before starting.`);
      }
      throw new Error(`S3 bucket head check failed: ${String(error)}`);
    }

    // 2. Write permission
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket:      bucket,
          Key:         sentinelKey,
          Body:        Buffer.from("ok"),
          ContentType: "text/plain",
        }),
      );
    } catch (error) {
      throw new Error(`S3 bucket "${bucket}" is readable but write failed — check IAM/policy: ${String(error)}`);
    }

    // 3. Delete permission (clean up sentinel)
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: sentinelKey }),
      );
    } catch (error) {
      // Non-fatal: sentinel remains but validation has confirmed write access.
      this.logger?.warn("s3_startup_sentinel_delete_failed", { sentinelKey, error: String(error) });
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Just list with limit 1 to verify connectivity
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          MaxKeys: 1,
        }),
      );
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: `S3 health check failed: ${String(error)}`,
      };
    }
  }
}
