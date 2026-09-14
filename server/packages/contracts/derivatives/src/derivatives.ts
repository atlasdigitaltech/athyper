/** Derivative rendition types produced from an attachment version. */
export type DerivativeType = "preview_pdf" | "thumbnail" | "page_preview";

/** Named rendition codes within a derivative type. */
export type RenditionCode =
  | "thumbnail_sm" // 256×256 WebP
  | "thumbnail_md" // 768×768 WebP
  | "preview_default" // normalized PDF
  | "page_preview" // first-page 1440px WebP
  | string; // extensible

/** Lifecycle status of a derivative row. */
export type AttachmentDerivativeStatus =
  | "pending"
  | "processing"
  | "ready"
  | "quarantined"
  | "skipped"
  | "failed"
  | "deleted";

/** Outcome of the malware scan run against a derivative's rendered bytes. */
export type AttachmentDerivativeScanStatus = "clean" | "quarantined";

export interface AttachmentDerivativeRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly attachmentId: string;
  readonly derivativeType: DerivativeType | string;
  readonly renditionCode: RenditionCode;
  readonly sourceSha256: string;
  readonly specificationHash: string;
  readonly contentType: string;
  readonly storageBucket: string | null;
  readonly storageKey: string | null;
  readonly sizeBytes: number | null;
  readonly sha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly pageNumber: number | null;
  readonly status: AttachmentDerivativeStatus;
  readonly provider: string | null;
  readonly providerVersion: string | null;
  readonly attemptCount: number;
  readonly lastErrorCode: string | null;
  readonly lastErrorMessage: string | null;
  readonly generatedAt: string | null;
  readonly scannedAt: string | null;
  readonly scanStatus: AttachmentDerivativeScanStatus | null;
  readonly createdAt: string;
  readonly updatedAt: string | null;
}

/**
 * The only correct readiness check. A `status: "ready"` row that predates the scan-before-store
 * gate — or one whose evidence a concurrent rebuild has invalidated — must never be treated as
 * usable just because its status says "ready". Anything that serves, downloads, or otherwise
 * authorizes use of a derivative must gate on this, not on `status` alone.
 */
export function isDerivativeUsable(
  record:
    | Pick<AttachmentDerivativeRecord, "status" | "scanStatus">
    | null
    | undefined,
): boolean {
  return record?.status === "ready" && record.scanStatus === "clean";
}

/** Input to the preview renderer. */
export interface DerivativeRenderInput {
  readonly content: Uint8Array;
  readonly sourceContentType: string;
  readonly renditionCode: RenditionCode;
  readonly specificationHash: string;
  /** Signal to abort a long-running render. */
  readonly signal?: AbortSignal;
}

/** Output from the preview renderer. */
export interface DerivativeRenderOutput {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly pageNumber: number | null;
  readonly provider: string;
  readonly providerVersion: string;
  readonly durationMs: number;
}

/** Renders a source document/image into a derivative rendition. */
export interface DerivativeRenderer {
  render(input: DerivativeRenderInput): Promise<DerivativeRenderOutput>;
  health(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    latencyMs: number;
    message?: string;
  }>;
}

/** Request to schedule derivative generation for an attachment version. */
export interface DerivativeScheduleRequest {
  readonly planeKey: "studio" | "neon" | "mesh";
  readonly tenantId: string;
  readonly attachmentId: string;
  readonly principalId: string;
  /** Hex SHA-256 of the source file — used as deduplication key. */
  readonly sourceSha256: string;
  readonly rebuild?: {
    readonly mode: "missing" | "failed" | "all";
    readonly reason: string;
    readonly requestId: string;
  };
}

/** Schedules derivative generation jobs. */
export interface DerivativeScheduler {
  schedule(request: DerivativeScheduleRequest): Promise<void>;
}

/** Rendition specification: determines what to produce. */
export interface RenditionSpec {
  readonly derivativeType: DerivativeType | string;
  readonly renditionCode: RenditionCode;
  readonly contentType: string;
  readonly specificationHash: string;
}

/** Repository interface for derivative persistence. */
export interface DerivativeRepository<Transaction> {
  upsertPending(
    input: {
      tenantId: string;
      attachmentId: string;
      derivativeType: string;
      renditionCode: string;
      sourceSha256: string;
      specificationHash: string;
      contentType: string;
      principalId: string;
      forceRebuild?: boolean;
    },
    tx: Transaction,
  ): Promise<AttachmentDerivativeRecord>;

  markProcessing(
    id: string,
    tenantId: string,
    principalId: string,
    tx: Transaction,
  ): Promise<void>;

  markReady(
    input: {
      id: string;
      tenantId: string;
      storageBucket: string;
      storageKey: string;
      sizeBytes: number;
      sha256: string;
      width: number | null;
      height: number | null;
      pageNumber: number | null;
      provider: string;
      providerVersion: string;
      principalId: string;
    },
    tx: Transaction,
  ): Promise<void>;

  /** Rendered bytes failed the malware scan: no object is stored, and the row is never marked ready. */
  markQuarantined(
    input: {
      id: string;
      tenantId: string;
      reason: string;
      principalId: string;
    },
    tx: Transaction,
  ): Promise<void>;

  markSkipped(
    id: string,
    tenantId: string,
    reason: string,
    principalId: string,
    tx: Transaction,
  ): Promise<void>;

  markFailed(
    id: string,
    tenantId: string,
    errorCode: string,
    errorMessage: string,
    principalId: string,
    tx: Transaction,
  ): Promise<void>;

  load(
    id: string,
    tenantId: string,
    tx: Transaction,
  ): Promise<AttachmentDerivativeRecord | null>;

  loadBySpec(
    tenantId: string,
    attachmentId: string,
    derivativeType: string,
    renditionCode: string,
    sourceSha256: string,
    specificationHash: string,
    tx: Transaction,
  ): Promise<AttachmentDerivativeRecord | null>;
}
