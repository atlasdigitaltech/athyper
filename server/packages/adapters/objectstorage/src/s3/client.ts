import { S3Client } from "@aws-sdk/client-s3";

import type { ObjectStorageConfig } from "../types.js";

export function createS3Client(config: ObjectStorageConfig): S3Client {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    },
    forcePathStyle: true, // Required for MinIO compatibility
    tls: config.useSSL,
  });

  return client;
}
