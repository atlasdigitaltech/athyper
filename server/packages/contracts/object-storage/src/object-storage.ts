export interface ObjectPutOptions {
  readonly contentType?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}
export interface ObjectPutStreamOptions extends ObjectPutOptions {
  readonly contentLength?: number;
  readonly partSizeBytes?: number;
}
export interface ObjectGetStreamOptions {
  /** When aborted, implementations must release the underlying read (network connection, file handle, etc.) rather than let it idle. */
  readonly signal?: AbortSignal;
}

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType?: string;
  readonly etag?: string;
}

/** Capability boundary used by services; bucket selection belongs to host configuration. */
export interface ObjectStorage {
  put(
    key: string,
    body: Uint8Array | string,
    options?: ObjectPutOptions,
  ): Promise<void>;
  putStream?(
    key: string,
    body: AsyncIterable<Uint8Array>,
    options?: ObjectPutStreamOptions,
  ): Promise<{ readonly etag?: string }>;
  /** Atomically creates an object and returns false when the key already exists. */
  putIfAbsent?(
    key: string,
    body: Uint8Array | string,
    options?: ObjectPutOptions,
  ): Promise<boolean>;
  get(key: string): Promise<Uint8Array>;
  /** Streams an object without materializing it in process memory. Large-object consumers should require this capability. */
  getStream?(
    key: string,
    options?: ObjectGetStreamOptions,
  ): Promise<AsyncIterable<Uint8Array>>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  createDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
  /** A short-lived PUT URL. Callers must use a tenant-scoped, non-public key. */
  createUploadUrl(key: string, expirySeconds?: number): Promise<string>;
  /** Server-side promotion avoids exposing active keys before malware processing. */
  copy(sourceKey: string, destinationKey: string): Promise<void>;
}
