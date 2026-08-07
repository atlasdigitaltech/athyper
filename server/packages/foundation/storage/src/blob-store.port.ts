import type { ObjectMetadata, PutOptions, PutStreamOptions } from "./object-metadata.js";

/**
 * Capability-neutral object/blob storage port.
 * Implementations: adapters/storage/s3 (AWS S3 / MinIO).
 * Platform documents, audit and rendering import this port — never the S3 adapter.
 */
export interface BlobStore {
  put(key: string, body: Buffer | string, opts?: PutOptions): Promise<void>;

  /**
   * Stream-based upload. Prefer for files > ~5 MB to avoid buffering in heap.
   */
  putStream(
    key: string,
    stream: NodeJS.ReadableStream,
    opts?: PutStreamOptions,
  ): Promise<{ etag?: string }>;

  /** Fully buffers the object into memory. Use for small objects only. */
  get(key: string): Promise<Buffer>;

  /**
   * Returns the object body as a Node.js Readable.
   * Preferred for downloads — bytes flow directly to the HTTP response.
   */
  getStream(key: string): Promise<NodeJS.ReadableStream>;

  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<ObjectMetadata[]>;
  getMetadata(key: string): Promise<ObjectMetadata>;
  deleteMany(keys: string[]): Promise<void>;
  copyObject(sourceKey: string, destKey: string): Promise<void>;

  getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
  putPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
}

/**
 * Administrative operations on the underlying store.
 * Separated from BlobStore so provisioning access is not granted to all consumers.
 */
export interface StorageProvisioner {
  /**
   * Verify the configured bucket exists and that credentials have at minimum
   * list + put + delete permissions. Writes and immediately deletes a sentinel.
   * Throws with a clear message on failure so bootstrap can abort or degrade.
   */
  validateBucketAccess(): Promise<void>;
}
