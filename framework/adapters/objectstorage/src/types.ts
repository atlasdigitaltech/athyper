export type ObjectStorageConfig = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  region: string;
  bucket: string;
  useSSL: boolean;
};

export type PutOptions = {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: "private" | "public-read";
};

export type ObjectMetadata = {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  contentType?: string;
};

export interface ObjectStorageAdapter {
  // Basic CRUD
  put(key: string, body: Buffer | string, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;

  // Listing
  list(prefix?: string): Promise<ObjectMetadata[]>;

  // Presigned URLs
  getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
  putPresignedUrl(key: string, expirySeconds?: number): Promise<string>;

  // Metadata
  getMetadata(key: string): Promise<ObjectMetadata>;

  // Batch operations
  deleteMany(keys: string[]): Promise<void>;
  copyObject(sourceKey: string, destKey: string): Promise<void>;

  // Health check
  healthCheck(): Promise<{ healthy: boolean; message?: string }>;
}
