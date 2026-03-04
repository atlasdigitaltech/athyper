import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type { ObjectMetadata, ObjectStorageAdapter, ObjectStorageConfig, PutOptions } from "../types.js";

export class S3ObjectStorageAdapter implements ObjectStorageAdapter {
  constructor(
    private client: S3Client,
    private config: ObjectStorageConfig
  ) {}

  async put(key: string, body: Buffer | string, opts?: PutOptions): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: body,
          ContentType: opts?.contentType,
          Metadata: opts?.metadata,
          ACL: opts?.acl,
        })
      );
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_put_error", key, err: String(error) }));
      throw error;
    }
  }

  async get(key: string): Promise<Buffer> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        })
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
       
      console.error(JSON.stringify({ msg: "s3_get_error", key, err: String(error) }));
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        })
      );
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_delete_error", key, err: String(error) }));
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        })
      );
      return true;
    } catch (error: any) {
      if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
       
      console.error(JSON.stringify({ msg: "s3_exists_error", key, err: String(error) }));
      throw error;
    }
  }

  async list(prefix?: string): Promise<ObjectMetadata[]> {
    try {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
        })
      );

      return (response.Contents ?? []).map((obj) => ({
        key: obj.Key!,
        size: obj.Size ?? 0,
        lastModified: obj.LastModified ?? new Date(),
        etag: obj.ETag,
      }));
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_list_error", prefix, err: String(error) }));
      throw error;
    }
  }

  async getPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, { expiresIn: expirySeconds });
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_presigned_url_error", key, err: String(error) }));
      throw error;
    }
  }

  async putPresignedUrl(key: string, expirySeconds = 3600): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      return await getSignedUrl(this.client, command, { expiresIn: expirySeconds });
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_put_presigned_url_error", key, err: String(error) }));
      throw error;
    }
  }

  async getMetadata(key: string): Promise<ObjectMetadata> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        })
      );

      return {
        key,
        size: response.ContentLength ?? 0,
        lastModified: response.LastModified ?? new Date(),
        etag: response.ETag,
        contentType: response.ContentType,
      };
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_metadata_error", key, err: String(error) }));
      throw error;
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.config.bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: key })),
          },
        })
      );
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_delete_many_error", count: keys.length, err: String(error) }));
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
        })
      );
    } catch (error) {
       
      console.error(JSON.stringify({ msg: "s3_copy_error", sourceKey, destKey, err: String(error) }));
      throw error;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      // Just list with limit 1 to verify connectivity
      await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          MaxKeys: 1,
        })
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
