/**
 * Storage Key Builder — generates standardized S3 storage keys
 * for the content management system.
 *
 * Pattern: tenants/{tenantId}/{entity}/{entityId}/{kind}/{yyyy}/{mm}/{shard}/{fileId}
 *
 * Example:
 *   tenants/550e8400-e29b-41d4-a716-446655440000/
 *          customer/7c9e6679-7425-40de-944b-e07fc1f90ae7/
 *          invoice/2026/02/347/a1b2c3d4-e5f6-7890-abcd-ef1234567890
 *
 * Key Features:
 * - Tenant isolation at path level
 * - Time-based partitioning (yyyy/mm)
 * - Shard distribution (0-999 from file ID hash)
 * - Kind-based organization
 */

import { createHash } from "node:crypto";

export type DocumentKind =
  | "attachment"
  | "generated"
  | "export"
  | "template"
  | "letterhead"
  | "avatar"
  | "signature"
  | "certificate"
  | "invoice"
  | "receipt"
  | "contract"
  | "report";

export interface StorageKeyParams {
  tenantId: string;
  entity: string;
  entityId: string;
  kind: DocumentKind;
  createdAt: Date;
  fileId: string;
}

/**
 * Calculate shard number from file ID for distribution.
 * Returns 0-999 for balanced distribution across storage hierarchy.
 *
 * Uses SHA-256 hash of file ID to ensure deterministic but evenly
 * distributed sharding.
 */
export function calculateShard(fileId: string): number {
  const hash = createHash("sha256").update(fileId).digest("hex");
  // Take first 3 hex chars, convert to number, mod 1000
  const hex3 = hash.slice(0, 3);
  return parseInt(hex3, 16) % 1000;
}

/**
 * Build standardized storage key for S3.
 *
 * @param params - Storage key parameters
 * @returns S3 key path string
 *
 * @example
 * storageKeyForDocument({
 *   tenantId: "550e8400-e29b-41d4-a716-446655440000",
 *   entity: "invoice",
 *   entityId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
 *   kind: "attachment",
 *   createdAt: new Date("2026-02-13T10:30:00Z"),
 *   fileId: "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
 * });
 * // => "tenants/550e8400.../invoice/7c9e6679.../attachment/2026/02/347/a1b2c3d4..."
 */
export function storageKeyForDocument(params: StorageKeyParams): string {
  const { tenantId, entity, entityId, kind, createdAt, fileId } = params;

  const yyyy = createdAt.getUTCFullYear().toString().padStart(4, "0");
  const mm = (createdAt.getUTCMonth() + 1).toString().padStart(2, "0");
  const shard = calculateShard(fileId);

  return [
    "tenants",
    tenantId,
    entity,
    entityId,
    kind,
    yyyy,
    mm,
    shard.toString().padStart(3, "0"),
    fileId,
  ].join("/");
}

/**
 * Parse storage key back to components (for migration/debugging).
 * Returns null if key doesn't match expected format.
 *
 * @param key - S3 storage key to parse
 * @returns Parsed components or null if invalid
 *
 * @example
 * parseStorageKey("tenants/550e.../invoice/7c9e.../attachment/2026/02/347/a1b2...");
 * // => { tenantId: "550e...", entity: "invoice", ... }
 */
export function parseStorageKey(key: string): StorageKeyParams | null {
  const parts = key.split("/");

  if (parts.length !== 9 || parts[0] !== "tenants") {
    return null;
  }

  const [_, tenantId, entity, entityId, kind, yyyy, mm, shard, fileId] = parts;

  // Validate kind
  const validKinds: DocumentKind[] = [
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
  ];

  if (!validKinds.includes(kind as DocumentKind)) {
    return null;
  }

  // Reconstruct date (day 1 of the month since we only store yyyy/mm)
  const createdAt = new Date(`${yyyy}-${mm}-01T00:00:00Z`);

  return {
    tenantId,
    entity,
    entityId,
    kind: kind as DocumentKind,
    createdAt,
    fileId,
  };
}
