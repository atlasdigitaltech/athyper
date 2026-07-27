export * from "./s3/client.js";
export * from "./s3/operations.js";
export * from "./types.js";

import { createS3Client } from "./s3/client.js";
import { S3ObjectStorageAdapter } from "./s3/operations.js";

import type { ObjectStorageAdapter, ObjectStorageConfig } from "./types.js";

/**
 * Factory function to create S3 object storage adapter
 */
export function createS3ObjectStorageAdapter(
  config: ObjectStorageConfig,
): ObjectStorageAdapter {
  // ── Config guard ──────────────────────────────────────────────────────────
  if (!config.endpoint) throw new Error("ObjectStorageConfig.endpoint is required");
  try { new URL(config.endpoint); } catch {
    throw new Error(`ObjectStorageConfig.endpoint is not a valid URL: "${config.endpoint}"`);
  }
  if (!config.accessKey) throw new Error("ObjectStorageConfig.accessKey is required");
  if (!config.secretKey) throw new Error("ObjectStorageConfig.secretKey is required");
  if (!config.bucket) throw new Error("ObjectStorageConfig.bucket is required");

  const client = createS3Client(config);
  return new S3ObjectStorageAdapter(client, config);
}
