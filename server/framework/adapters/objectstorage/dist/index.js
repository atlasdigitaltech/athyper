// src/s3/client.ts
import { S3Client } from "@aws-sdk/client-s3";
function createS3Client(config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey
    },
    forcePathStyle: true,
    // Required for MinIO compatibility
    tls: config.useSSL
  });
  return client;
}

// src/s3/operations.ts
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
var S3ObjectStorageAdapter = class {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.logger = config.logger;
  }
  client;
  config;
  logger;
  async put(key, body, opts) {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: opts?.contentType,
          Metadata: opts?.metadata,
          ACL: opts?.acl
        })
      );
    } catch (error) {
      this.logger?.error("s3_put_error", { key, error: String(error) });
      throw error;
    }
  }
  async putStream(key, stream, opts) {
    try {
      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.config.bucket,
          Key: key,
          Body: stream,
          ContentType: opts?.contentType,
          ContentLength: opts?.contentLength,
          Metadata: opts?.metadata,
          ACL: opts?.acl
        },
        queueSize: this.config.multipartQueueSize,
        partSize: opts?.partSize ?? this.config.multipartPartSizeMb * 1024 * 1024,
        leavePartsOnError: false
      });
      const result = await upload.done();
      return { etag: result.ETag };
    } catch (error) {
      this.logger?.error("s3_put_stream_error", { key, error: String(error) });
      throw error;
    }
  }
  async get(key) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        })
      );
      if (!response.Body) {
        throw new Error(`Object not found: ${key}`);
      }
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    } catch (error) {
      this.logger?.error("s3_get_error", { key, error: String(error) });
      throw error;
    }
  }
  async getStream(key) {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        })
      );
      if (!response.Body) {
        throw new Error(`Object not found or empty body: ${key}`);
      }
      return response.Body;
    } catch (error) {
      this.logger?.error("s3_get_stream_error", { key, error: String(error) });
      throw error;
    }
  }
  async delete(key) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        })
      );
    } catch (error) {
      this.logger?.error("s3_delete_error", { key, error: String(error) });
      throw error;
    }
  }
  async exists(key) {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        })
      );
      return true;
    } catch (error) {
      const e = error;
      if (e.name === "NotFound" || e.$metadata?.httpStatusCode === 404) {
        return false;
      }
      this.logger?.error("s3_exists_error", { key, error: String(error) });
      throw error;
    }
  }
  async list(prefix) {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix
        })
      );
      return (response.Contents ?? []).map((obj) => ({
        key: obj.Key,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? /* @__PURE__ */ new Date(),
        etag: obj.ETag
      }));
    } catch (error) {
      this.logger?.error("s3_list_error", { prefix, error: String(error) });
      throw error;
    }
  }
  async getPresignedUrl(key, expirySeconds) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      return await getSignedUrl(this.client, command, {
        expiresIn: expirySeconds ?? this.config.presignedTtlSeconds
      });
    } catch (error) {
      this.logger?.error("s3_presigned_url_error", { key, error: String(error) });
      throw error;
    }
  }
  async putPresignedUrl(key, expirySeconds) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key
      });
      return await getSignedUrl(this.client, command, {
        expiresIn: expirySeconds ?? this.config.presignedTtlSeconds
      });
    } catch (error) {
      this.logger?.error("s3_put_presigned_url_error", { key, error: String(error) });
      throw error;
    }
  }
  async getMetadata(key) {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key
        })
      );
      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? /* @__PURE__ */ new Date(),
        etag: response.ETag,
        contentType: response.ContentType
      };
    } catch (error) {
      this.logger?.error("s3_metadata_error", { key, error: String(error) });
      throw error;
    }
  }
  async deleteMany(keys) {
    if (keys.length === 0) return;
    const CHUNK_SIZE = 1e3;
    const chunks = [];
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      chunks.push(keys.slice(i, i + CHUNK_SIZE));
    }
    try {
      await Promise.all(
        chunks.map(
          (chunk) => this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.config.bucket,
              Delete: { Objects: chunk.map((key) => ({ Key: key })) }
            })
          )
        )
      );
    } catch (error) {
      this.logger?.error("s3_delete_many_error", { count: keys.length, error: String(error) });
      throw error;
    }
  }
  async copyObject(sourceKey, destKey) {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: this.config.bucket,
          CopySource: `${this.config.bucket}/${sourceKey}`,
          Key: destKey
        })
      );
    } catch (error) {
      this.logger?.error("s3_copy_error", { sourceKey, destKey, error: String(error) });
      throw error;
    }
  }
  async validateBucketAccess() {
    const bucket = this.config.bucket;
    const sentinelKey = `_athyper_startup_probe_${Date.now()}`;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      const e = error;
      const status = e.$metadata?.httpStatusCode;
      if (status === 403) {
        throw new Error(`S3 bucket "${bucket}" exists but credentials lack access (403 Forbidden)`);
      }
      if (status === 404) {
        throw new Error(`S3 bucket "${bucket}" does not exist (404 Not Found). Create the bucket before starting.`);
      }
      throw new Error(`S3 bucket head check failed: ${String(error)}`);
    }
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: sentinelKey,
          Body: Buffer.from("ok"),
          ContentType: "text/plain"
        })
      );
    } catch (error) {
      throw new Error(`S3 bucket "${bucket}" is readable but write failed \u2014 check IAM/policy: ${String(error)}`);
    }
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: sentinelKey })
      );
    } catch (error) {
      this.logger?.warn("s3_startup_sentinel_delete_failed", { sentinelKey, error: String(error) });
    }
  }
  async healthCheck() {
    try {
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          MaxKeys: 1
        })
      );
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        message: `S3 health check failed: ${String(error)}`
      };
    }
  }
};

// src/index.ts
function createS3ObjectStorageAdapter(config) {
  if (!config.endpoint) throw new Error("ObjectStorageConfig.endpoint is required");
  try {
    new URL(config.endpoint);
  } catch {
    throw new Error(`ObjectStorageConfig.endpoint is not a valid URL: "${config.endpoint}"`);
  }
  if (!config.accessKey) throw new Error("ObjectStorageConfig.accessKey is required");
  if (!config.secretKey) throw new Error("ObjectStorageConfig.secretKey is required");
  if (!config.bucket) throw new Error("ObjectStorageConfig.bucket is required");
  const client = createS3Client(config);
  return new S3ObjectStorageAdapter(client, config);
}
export {
  S3ObjectStorageAdapter,
  createS3Client,
  createS3ObjectStorageAdapter
};
//# sourceMappingURL=index.js.map