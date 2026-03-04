/**
 * Content Taxonomy — defines document kinds, size limits, and validation rules
 *
 * This module provides:
 * - Document kind taxonomy (Zod schema)
 * - Size limits per kind
 * - Content type restrictions per kind
 * - Validation functions
 */

import { z } from "zod";

/**
 * Document kind taxonomy
 *
 * - attachment: Generic user uploads
 * - generated: System-generated documents (from doc_output workflow)
 * - export: Data exports (CSV, Excel, etc.)
 * - template: Upload templates for imports
 * - letterhead: Letterhead logos
 * - avatar: User profile pictures
 * - signature: Digital signatures
 * - certificate: Certificates, licenses
 * - invoice: Invoices
 * - receipt: Payment receipts
 * - contract: Contracts
 * - report: Reports
 */
export const DocumentKind = z.enum([
  "attachment",
  "generated",
  "export",
  "template",
  "letterhead",
  "avatar",
  "signature",
  "certificate",
  "invoice",
  "receipt",
  "contract",
  "report",
]);

export type DocumentKindType = z.infer<typeof DocumentKind>;

/**
 * Maximum file size limits by kind (in bytes)
 *
 * These limits are enforced at upload initiation to prevent
 * users from uploading files that exceed storage quotas.
 */
export const MAX_SIZE_BY_KIND: Record<DocumentKindType, number> = {
  attachment: 100 * 1024 * 1024, // 100 MB - general purpose
  generated: 50 * 1024 * 1024, // 50 MB - system-generated PDFs
  export: 200 * 1024 * 1024, // 200 MB - large data exports
  template: 10 * 1024 * 1024, // 10 MB - import templates
  letterhead: 5 * 1024 * 1024, // 5 MB - company letterhead
  avatar: 2 * 1024 * 1024, // 2 MB - user profile pictures
  signature: 1 * 1024 * 1024, // 1 MB - digital signature images
  certificate: 20 * 1024 * 1024, // 20 MB - certificates, licenses
  invoice: 50 * 1024 * 1024, // 50 MB - invoice PDFs
  receipt: 10 * 1024 * 1024, // 10 MB - payment receipts
  contract: 100 * 1024 * 1024, // 100 MB - contracts, agreements
  report: 100 * 1024 * 1024, // 100 MB - business reports
};

/**
 * Allowed content types (MIME types) by kind
 *
 * null = any content type allowed
 * array = restricted to listed MIME types only
 */
export const ALLOWED_CONTENT_TYPES: Record<DocumentKindType, string[] | null> = {
  attachment: null, // Any content type
  generated: ["application/pdf"],
  export: [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // Excel .xlsx
    "application/vnd.ms-excel", // Excel .xls
  ],
  template: [
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ],
  letterhead: ["image/png", "image/jpeg", "image/svg+xml"],
  avatar: ["image/png", "image/jpeg", "image/webp"],
  signature: ["image/png", "image/jpeg", "image/svg+xml"],
  certificate: ["application/pdf", "image/png", "image/jpeg"],
  invoice: ["application/pdf"],
  receipt: ["application/pdf", "image/png", "image/jpeg"],
  contract: ["application/pdf"],
  report: [
    "application/pdf",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ],
};

/**
 * Validation result type
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate file size against kind-specific limits
 *
 * @param kind - Document kind
 * @param sizeBytes - File size in bytes
 * @returns Validation result
 */
export function validateFileSize(kind: DocumentKindType, sizeBytes: number): ValidationResult {
  const maxSize = MAX_SIZE_BY_KIND[kind];

  if (sizeBytes > maxSize) {
    return {
      valid: false,
      error: `File size ${formatBytes(sizeBytes)} exceeds limit ${formatBytes(maxSize)} for kind '${kind}'`,
    };
  }

  if (sizeBytes <= 0) {
    return {
      valid: false,
      error: "File size must be greater than zero",
    };
  }

  return { valid: true };
}

/**
 * Validate content type against kind-specific restrictions
 *
 * @param kind - Document kind
 * @param contentType - MIME type of the file
 * @returns Validation result
 */
export function validateContentType(kind: DocumentKindType, contentType: string): ValidationResult {
  const allowed = ALLOWED_CONTENT_TYPES[kind];

  // If no restrictions, allow any content type
  if (allowed === null) {
    return { valid: true };
  }

  // Check if content type is in allowed list (case-insensitive)
  const normalizedContentType = contentType.toLowerCase().trim();
  const normalizedAllowed = allowed.map((ct) => ct.toLowerCase());

  if (!normalizedAllowed.includes(normalizedContentType)) {
    return {
      valid: false,
      error: `Content type '${contentType}' not allowed for kind '${kind}'. Allowed types: ${allowed.join(", ")}`,
    };
  }

  return { valid: true };
}

/**
 * Validate both file size and content type
 *
 * @param kind - Document kind
 * @param sizeBytes - File size in bytes
 * @param contentType - MIME type of the file
 * @returns Validation result
 */
export function validateFile(
  kind: DocumentKindType,
  sizeBytes: number,
  contentType: string,
): ValidationResult {
  const sizeCheck = validateFileSize(kind, sizeBytes);
  if (!sizeCheck.valid) {
    return sizeCheck;
  }

  const typeCheck = validateContentType(kind, contentType);
  if (!typeCheck.valid) {
    return typeCheck;
  }

  return { valid: true };
}

/**
 * Format bytes to human-readable string
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
