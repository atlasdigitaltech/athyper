/**
 * @athyper/api-contracts — Master Record Schemas
 *
 * Generic CRUD shapes for master.* entities (master/ runtime).
 * The entity-runtime renders these dynamically from compiled descriptors,
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
