/**
 * @athyper/api-contracts — Master Record Schemas
 *
 * Generic CRUD shapes for master.* entities (master/ runtime).
 * Runtime list and canvas surfaces render these dynamically from compiled descriptors,
 * so these schemas define the API envelope, not per-entity field shapes.
 */
import { z } from "zod";
import { UuidSchema, AuditSchema, LifecycleSchema } from "./common";

/** Generic master record returned by the records API. */
export const MasterRecordSchema = z.object({
  id: UuidSchema,
  tenant_id: UuidSchema,
  entity_code: z.string(),
  data: z.record(z.string(), z.unknown()),
}).merge(AuditSchema).merge(LifecycleSchema);

export type MasterRecord = z.infer<typeof MasterRecordSchema>;

/** Create/update request — field values are dynamic per entity. */
export const MasterRecordWriteSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export type MasterRecordWrite = z.infer<typeof MasterRecordWriteSchema>;

/** Bulk operation request. */
export const BulkOperationSchema = z.object({
  ids: z.array(UuidSchema).min(1).max(500),
  operation: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type BulkOperation = z.infer<typeof BulkOperationSchema>;

// ── Record versioning ─────────────────────────────────────────────────────────
// Returned by GET /api/records/:entity/:id/versions
// Gated by feature_flags.version_control on the entity.

export const RecordVersionStatusSchema = z.enum([
  "draft",
  "approved",
  "superseded",
  "cancelled",
]);
export type RecordVersionStatus = z.infer<typeof RecordVersionStatusSchema>;

export const RecordVersionChangeTypeSchema = z.enum([
  "original",
  "amendment",
  "reversal",
  "correction",
]);
export type RecordVersionChangeType = z.infer<typeof RecordVersionChangeTypeSchema>;

/** Summary row returned by GET /api/records/:entity/:id/versions */
export const RecordVersionSummarySchema = z.object({
  version_no:      z.number().int().positive(),
  revision_no:     z.number().int().nonnegative(),   // amendment cycle: 0 = original
  revision_label:  z.string().nullable(),             // "Original" | "Amendment 1"
  record_status:   z.string(),                        // document lifecycle state at this checkpoint
  change_type:     RecordVersionChangeTypeSchema,
  change_reason:   z.string().nullable(),             // user-entered (from remarks)
  change_summary:  z.string().nullable(),             // server-generated one-liner
  created_at:      z.string().datetime(),
  created_by_name: z.string().nullable(),
  is_current:      z.boolean(),
});
export type RecordVersionSummary = z.infer<typeof RecordVersionSummarySchema>;

/** Full detail returned by GET /api/records/:entity/:id/versions/:versionNo */
export const RecordVersionDetailSchema = RecordVersionSummarySchema.extend({
  /** SHA-256 hash of the snapshot data — for audit/integrity verification. */
  data_hash: z.string().nullable(),
  /** Entity field values at the time this version was created. */
  fields:    z.record(z.string(), z.unknown()),
});
export type RecordVersionDetail = z.infer<typeof RecordVersionDetailSchema>;

