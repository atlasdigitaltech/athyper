/**
 * Document Services — Domain Types
 *
 * Branded ID types, enums, and shared interfaces for the DOC module.
 */

// ============================================================================
// Branded ID Types
// ============================================================================

export type TemplateId = string & { readonly __brand: "TemplateId" };
export type TemplateVersionId = string & { readonly __brand: "TemplateVersionId" };
export type TemplateBindingId = string & { readonly __brand: "TemplateBindingId" };
export type LetterheadId = string & { readonly __brand: "LetterheadId" };
export type BrandProfileId = string & { readonly __brand: "BrandProfileId" };
export type OutputId = string & { readonly __brand: "OutputId" };
export type RenderJobId = string & { readonly __brand: "RenderJobId" };

// ============================================================================
// Enums
// ============================================================================

export type TemplateKind =
    | "LETTER"
    | "REPORT"
    | "CERTIFICATE"
    | "PACK"
    | "RECEIPT"
    | "STATEMENT";

export type TemplateEngine =
    | "HANDLEBARS"
    | "MJML"
    | "REACT_PDF";

export type TemplateStatus =
    | "DRAFT"
    | "PUBLISHED"
    | "RETIRED";

export type OutputStatus =
    | "QUEUED"
    | "RENDERING"
    | "RENDERED"
    | "DELIVERED"
    | "FAILED"
    | "ARCHIVED"
    | "REVOKED";

export type RenderJobStatus =
    | "PENDING"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "RETRYING";

export type TextDirection = "LTR" | "RTL";

export type PaperFormat = "A4" | "LETTER" | "LEGAL";

// ============================================================================
// Error Taxonomy
// ============================================================================

export const DOC_ERROR_CODES = {
    TEMPLATE_NOT_FOUND: "TEMPLATE_NOT_FOUND",
    TEMPLATE_INVALID: "TEMPLATE_INVALID",
    SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
    RENDER_TIMEOUT: "RENDER_TIMEOUT",
    CHROMIUM_CRASH: "CHROMIUM_CRASH",
    STORAGE_WRITE_FAILED: "STORAGE_WRITE_FAILED",
    STORAGE_READ_FAILED: "STORAGE_READ_FAILED",
    COMPOSE_FAILED: "COMPOSE_FAILED",
    LETTERHEAD_REQUIRED: "LETTERHEAD_REQUIRED",
    OPERATION_NOT_ALLOWED: "OPERATION_NOT_ALLOWED",
    LOCALE_NOT_SUPPORTED: "LOCALE_NOT_SUPPORTED",
    UNKNOWN: "UNKNOWN",
} as const;
export type DocErrorCode = typeof DOC_ERROR_CODES[keyof typeof DOC_ERROR_CODES];

export type DocErrorCategory = "transient" | "permanent" | "timeout" | "crash";

/**
 * Classify an error into error code + category.
 */
export function classifyDocError(error: unknown): { code: DocErrorCode; category: DocErrorCategory } {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("timed out") || msg.includes("timeout")) {
        return { code: DOC_ERROR_CODES.RENDER_TIMEOUT, category: "timeout" };
    }
    if (msg.includes("Protocol error") || msg.includes("Target closed") || msg.includes("disconnected")) {
        return { code: DOC_ERROR_CODES.CHROMIUM_CRASH, category: "crash" };
    }
    if (msg.includes("Template not found") || msg.includes("No template resolved")) {
        return { code: DOC_ERROR_CODES.TEMPLATE_NOT_FOUND, category: "permanent" };
    }
    if (msg.includes("variable validation failed")) {
        return { code: DOC_ERROR_CODES.SCHEMA_VALIDATION_FAILED, category: "permanent" };
    }
    if (msg.includes("Storage") || msg.includes("MinIO") || msg.includes("S3")) {
        return { code: DOC_ERROR_CODES.STORAGE_WRITE_FAILED, category: "transient" };
    }
    if (msg.includes("Template render error") || msg.includes("compose")) {
        return { code: DOC_ERROR_CODES.COMPOSE_FAILED, category: "permanent" };
    }

    return { code: DOC_ERROR_CODES.UNKNOWN, category: "transient" };
}

// ============================================================================
// Output Status State Machine
// ============================================================================

/**
 * Valid output status transitions.
 * Any transition not in this map is illegal and will be rejected.
 *
 *  QUEUED ──→ RENDERING ──→ RENDERED ──→ DELIVERED ──→ ARCHIVED
 *    │            │              │             │
 *    └──→ FAILED  └──→ FAILED   └──→ REVOKED  └──→ REVOKED
 *                                └──→ ARCHIVED
 */
export const OUTPUT_STATUS_TRANSITIONS: Record<OutputStatus, readonly OutputStatus[]> = {
    QUEUED:    ["RENDERING", "FAILED"],
    RENDERING: ["RENDERED", "FAILED"],
    RENDERED:  ["DELIVERED", "ARCHIVED", "REVOKED"],
    DELIVERED: ["ARCHIVED", "REVOKED"],
    FAILED:    ["ARCHIVED"],
    ARCHIVED:  [],
    REVOKED:   [],
} as const;

export function isValidOutputTransition(from: OutputStatus, to: OutputStatus): boolean {
    return OUTPUT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// ============================================================================
// Render Request / Contract
// ============================================================================

export interface RenderRequest {
    tenantId: string;
    templateCode?: string;
    templateVersionId?: TemplateVersionId;
    letterheadId?: LetterheadId;
    brandProfileId?: BrandProfileId;
    entityName: string;
    entityId: string;
    operation: string;
    variant?: string;
    locale?: string;
    timezone?: string;
    variables: Record<string, unknown>;
    createdBy: string;
}

export interface RenderManifest {
    manifestVersion: number;
    templateVersionId: string;
    templateChecksum: string;
    letterheadId: string | null;
    brandProfileId: string | null;
    locale: string;
    timezone: string;
    engineVersion: string;
    chromiumVersion?: string;
    stylesChecksum?: string;
    inputPayloadHash: string;
    assetsManifest: Record<string, string> | null;
    renderedAt: string;
}

export interface RenderSyncResult {
    buffer: Buffer;
    checksum: string;
    manifest: RenderManifest;
}

// ============================================================================
// PDF Rendering Options
// ============================================================================

export interface PdfRenderOptions {
    format?: PaperFormat;
    landscape?: boolean;
    margins?: { top: string; right: string; bottom: string; left: string };
    headerTemplate?: string;
    footerTemplate?: string;
    displayHeaderFooter?: boolean;
    printBackground?: boolean;
    preferCSSPageSize?: boolean;
}

// ============================================================================
// Shared Filter / List Options
// ============================================================================

export interface ListOptions {
    limit?: number;
    offset?: number;
}

export interface TemplateListFilters extends ListOptions {
    status?: TemplateStatus;
    kind?: TemplateKind;
    engine?: TemplateEngine;
    search?: string;
}

export interface OutputListFilters extends ListOptions {
    entityName?: string;
    entityId?: string;
    status?: OutputStatus;
    operation?: string;
}
