/**
 * DocStorageAdapter — Thin wrapper over ObjectStorageAdapter
 * for document-specific storage operations.
 */

export interface DocStorageAdapter {
    store(key: string, buffer: Buffer, contentType: string): Promise<void>;
    retrieve(key: string): Promise<Buffer>;
    getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string>;
    exists(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
}

export interface ObjectStorageAdapterLike {
    put(key: string, body: Buffer | string, opts?: { contentType?: string }): Promise<void>;
    get(key: string): Promise<Buffer>;
    getPresignedUrl(key: string, expirySeconds?: number): Promise<string>;
    exists(key: string): Promise<boolean>;
    delete(key: string): Promise<void>;
}

export class DefaultDocStorageAdapter implements DocStorageAdapter {
    constructor(
        private readonly objectStorage: ObjectStorageAdapterLike,
        private readonly presignedUrlExpirySeconds: number = 3600,
    ) {}

    async store(key: string, buffer: Buffer, contentType: string): Promise<void> {
        await this.objectStorage.put(key, buffer, { contentType });
    }

    async retrieve(key: string): Promise<Buffer> {
        return this.objectStorage.get(key);
    }

    async getPresignedDownloadUrl(key: string, expirySeconds?: number): Promise<string> {
        return this.objectStorage.getPresignedUrl(key, expirySeconds ?? this.presignedUrlExpirySeconds);
    }

    async exists(key: string): Promise<boolean> {
        return this.objectStorage.exists(key);
    }

    async delete(key: string): Promise<void> {
        await this.objectStorage.delete(key);
    }
}
