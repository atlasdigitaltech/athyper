export interface ObjectMetadata {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  contentType?: string;
}

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  acl?: "private" | "public-read";
}

export interface PutStreamOptions extends PutOptions {
  /** Known byte length of the stream. Allows single PUT for small files. */
  contentLength?: number;
  /** Multipart part size in bytes. Default: 5 MiB (S3/MinIO minimum). */
  partSize?: number;
}
