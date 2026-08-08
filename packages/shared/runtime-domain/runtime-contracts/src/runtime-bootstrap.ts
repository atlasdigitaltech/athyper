import { z } from "zod";

import { MetaEntityLifecycleStateMaskSchema } from "./schemas";

const JsonObjectSchema = z.record(z.string(), z.unknown());

export const MetaEntityRuntimeBootstrapChildSchema = z.object({
  relationName: z.string().min(1),
  entityCode: z.string().min(1),
  descriptorHash: z.string().min(1),
  compiledEntity: JsonObjectSchema,
  operations: z.array(JsonObjectSchema),
  policy: JsonObjectSchema.nullable(),
  lifecycleStateMasks: z.array(MetaEntityLifecycleStateMaskSchema),
}).strict();

/**
 * One server-authoritative first-render bundle. The API may cache the unfiltered
 * form by tenant/entity; operation rows in the response are permission-filtered
 * from request context without changing bootstrapHash.
 */
export const MetaEntityRuntimeBootstrapV1Schema = z.object({
  schemaVersion: z.literal(1),
  entityCode: z.string().min(1),
  bootstrapHash: z.string().min(1),
  compiledEntity: JsonObjectSchema,
  operations: z.array(JsonObjectSchema),
  policy: JsonObjectSchema.nullable(),
  lifecycleStateMasks: z.array(MetaEntityLifecycleStateMaskSchema),
  permissionAliases: z.record(z.string(), z.string()),
  childProjections: z.array(MetaEntityRuntimeBootstrapChildSchema),
  effectiveSurfaceIds: z.array(z.string()).optional(),
  effectiveFieldIds: z.array(z.string()).optional(),
}).strict();

export const MetaEntityRecordOperationOverlayV1Schema = z.object({
  schemaVersion: z.literal(1),
  entityCode: z.string().min(1),
  recordId: z.string().min(1),
  operations: z.array(JsonObjectSchema),
}).strict();

export type MetaEntityRuntimeBootstrapChild = z.infer<typeof MetaEntityRuntimeBootstrapChildSchema>;
export type MetaEntityRuntimeBootstrapV1 = z.infer<typeof MetaEntityRuntimeBootstrapV1Schema>;
export type MetaEntityRecordOperationOverlayV1 = z.infer<typeof MetaEntityRecordOperationOverlayV1Schema>;

export function assertMetaEntityRuntimeBootstrapV1(value: unknown): MetaEntityRuntimeBootstrapV1 {
  return MetaEntityRuntimeBootstrapV1Schema.parse(value);
}
