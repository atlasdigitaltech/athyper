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
  config: ObjectStorageConfig
): ObjectStorageAdapter {
  const client = createS3Client(config);
  return new S3ObjectStorageAdapter(client, config);
}
