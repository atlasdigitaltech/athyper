import { S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

interface AdapterLogger {
    info(event: string, fields?: Record<string, unknown>): void;
    warn(event: string, fields?: Record<string, unknown>): void;
    error(event: string, fields?: Record<string, unknown>): void;
}
type ObjectStorageConfig = {
    endpoint: string;
    accessKey: string;
    secretKey: string;
    region: string;
    bucket: string;
    useSSL: boolean;
    /** Multipart upload part size in MiB (min 5, S3/MinIO protocol minimum). */
    multipartPartSizeMb: number;
    /** Number of concurrent part uploads per multipart operation. */
    multipartQueueSize: number;
    /** Maximum allowed upload size in MiB (enforced by the multipart route). */
    maxUploadMb: number;
    /** Presigned URL validity in seconds (for direct-to-S3 upload/download URLs). */
    presignedTtlSeconds: number;
    /**
     * Optional structured logger for S3 operation errors.
     * When omitted, errors are re-thrown silently — the circuit-breaker
     * protection layer in the runtime will handle them.
     */
    logger?: AdapterLogger;
};
type PutOptions = {
    contentType?: string;
    metadata?: Record<string, string>;
    acl?: "private" | "public-read";
};
type PutStreamOptions = PutOptions & {
    /**
     * Known byte length of the stream.
     * Providing this allows the SDK to use a single PUT when the file is small
     * (< partSize). When omitted, multipart upload is always used.
     */
    contentLength?: number;
    /**
     * Multipart part size in bytes. Default: 5 MiB.
     * Minimum allowed by S3/MinIO: 5 MiB (except the last part).
     */
    partSize?: number;
};
type ObjectMetadata = {
    key: string;
    size: number;
    lastModified: Date;
    etag?: string;
    contentType?: string;
};
interface ObjectStorageAdapter {
    put(key: string, body: Buffer | string, opts?: PutOptions): Promise<void>;
    /**
     * Stream-based upload using S3 multipart under the hood.
     * Use this instead of put() for files > ~5 MB.
     * The SDK automatically uses a single PUT for small streams and
     * parallel multipart for large ones.
     */
    putStream(key: string, stream: NodeJS.ReadableStream, opts?: PutStreamOptions): Promise<{
        etag?: string;
    }>;
    /** Fully buffers the object into memory. Use for small files only. */
    get(key: string): Promise<Buffer>;
    /**
     * Returns the S3 response body as a Node.js Readable.
     * Preferred for downloads — bytes flow directly to the HTTP response
     * without being held in the heap. Caller must handle stream errors.
     */
    getStream(key: string): Promise<NodeJS.ReadableStream>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    list(prefix?: string): Promise<ObjectMetadata[]>;
    getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
    putPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
    getMetadata(key: string): Promise<ObjectMetadata>;
    deleteMany(keys: string[]): Promise<void>;
    copyObject(sourceKey: string, destKey: string): Promise<void>;
    healthCheck(): Promise<{
        healthy: boolean;
        message?: string;
    }>;
    /**
     * Startup validation: verifies the configured bucket exists and that
     * the credentials have at minimum list + put + delete permissions.
     * Writes and immediately deletes a tiny sentinel object.
     * Throws with a clear message on any failure so the server can log
     * and decide whether to abort or degrade.
     */
    validateBucketAccess(): Promise<void>;
}

declare function createS3Client(config: ObjectStorageConfig): S3Client;

/**
 * S3-backed implementation of ObjectStorageAdapter.
 *
 * All operations are thin wrappers around the AWS SDK v3 commands.
 * Errors are logged via the optional AdapterLogger (when provided) and
 * re-thrown so the circuit-breaker protection layer in the runtime can
 * track failure rates. healthCheck() is the exception — it returns a
 * structured result rather than throwing.
 */
declare class S3ObjectStorageAdapter implements ObjectStorageAdapter {
    private readonly client;
    private readonly config;
    private readonly logger;
    constructor(client: S3Client, config: ObjectStorageConfig);
    put(key: string, body: Buffer | string, opts?: PutOptions): Promise<void>;
    putStream(key: string, stream: Readable, opts?: PutStreamOptions): Promise<{
        etag?: string;
    }>;
    get(key: string): Promise<Buffer>;
    getStream(key: string): Promise<NodeJS.ReadableStream>;
    delete(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    list(prefix?: string): Promise<ObjectMetadata[]>;
    getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
    putPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
    getMetadata(key: string): Promise<ObjectMetadata>;
    deleteMany(keys: string[]): Promise<void>;
    copyObject(sourceKey: string, destKey: string): Promise<void>;
    validateBucketAccess(): Promise<void>;
    healthCheck(): Promise<{
        healthy: boolean;
        message?: string;
    }>;
}

/**
 * Factory function to create S3 object storage adapter
 */
declare function createS3ObjectStorageAdapter(config: ObjectStorageConfig): ObjectStorageAdapter;

export { type AdapterLogger, type ObjectMetadata, type ObjectStorageAdapter, type ObjectStorageConfig, type PutOptions, type PutStreamOptions, S3ObjectStorageAdapter, createS3Client, createS3ObjectStorageAdapter };
