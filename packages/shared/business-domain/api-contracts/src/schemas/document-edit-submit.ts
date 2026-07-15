import { z } from "zod";

import { FieldMaskSchema, SectionMaskSchema } from "./document-edit-draft";

export const DOCUMENT_EDIT_SUBMIT_CONTRACT_VERSION = 1 as const;

export const DocumentEditSubmitIntentSchema = z.enum([
  "save",
  "save_and_transition",
]);
export type DocumentEditSubmitIntent = z.infer<typeof DocumentEditSubmitIntentSchema>;

const SubmitDataSchema = z.record(z.string(), z.unknown());

export const AggregateCollectionChangeSetSchema = z.object({
  create: z.array(SubmitDataSchema).optional(),
  update: z.array(z.object({
    id: z.string().trim().min(1),
    patch: SubmitDataSchema,
  }).strict()).optional(),
  delete: z.array(z.string().trim().min(1)).optional(),
  replace: z.array(SubmitDataSchema).optional(),
}).strict();

export const AggregateChangeSetSchema = z.object({
  header: z.object({ patch: SubmitDataSchema }).strict(),
  collections: z.record(z.string().trim().min(1), AggregateCollectionChangeSetSchema),
}).strict();
export type AggregateChangeSet = z.infer<typeof AggregateChangeSetSchema>;

export const DocumentEditSubmitLineChangesV1Schema = z.object({
  create: z.array(SubmitDataSchema).optional(),
  update: z.array(z.object({
    id: z.string().trim().min(1),
    data: SubmitDataSchema.optional(),
  }).passthrough().transform((value) => {
    const { id, data, ...legacyPatch } = value;
    return { id, data: data ?? legacyPatch };
  })).optional(),
  delete: z.array(z.string().trim().min(1)).optional(),
}).strict();

export const DocumentEditSubmitChangesV1Schema = z.object({
  header: SubmitDataSchema.optional(),
  /**
   * Descriptor-owned child changes. The key is the childCollections[].key,
   * never a route-specific alias such as "lines".
   */
  collections: z.record(z.string().trim().min(1), DocumentEditSubmitLineChangesV1Schema).optional(),
  /** @deprecated Use collections.lines. Retained for v1 client compatibility. */
  lines: DocumentEditSubmitLineChangesV1Schema.optional(),
}).strict();

export const DocumentEditSubmitActionV1Schema = z.object({
  code: z.string().trim().min(1),
  payload: SubmitDataSchema.optional(),
}).strict();

export const DocumentEditSubmitRequestV1Schema = z.object({
  intent: DocumentEditSubmitIntentSchema,
  changes: DocumentEditSubmitChangesV1Schema,
  action: DocumentEditSubmitActionV1Schema.optional(),
  sourceTabId: z.string().trim().min(1),
  clientSeq: z.number().int().nonnegative(),
}).strict().superRefine((value, context) => {
  if (value.intent === "save_and_transition" && !value.action) {
    context.addIssue({
      code: "custom",
      path: ["action"],
      message: "action is required for save_and_transition",
    });
  }
  if (value.intent === "save" && value.action) {
    context.addIssue({
      code: "custom",
      path: ["action"],
      message: "action is only allowed for save_and_transition",
    });
  }

  const collections = value.changes.collections ?? {};
  const hasCollectionChanges = Object.values(collections).some((collection) =>
    (collection.create?.length ?? 0) > 0
      || (collection.update?.length ?? 0) > 0
      || (collection.delete?.length ?? 0) > 0,
  );
  const lines = value.changes.lines;
  if (lines && collections["lines"]) {
    context.addIssue({
      code: "custom",
      path: ["changes", "collections", "lines"],
      message: "lines must be supplied either as the legacy alias or collections.lines, not both",
    });
  }
  const hasChanges = Object.keys(value.changes.header ?? {}).length > 0
    || hasCollectionChanges
    || (lines?.create?.length ?? 0) > 0
    || (lines?.update?.length ?? 0) > 0
    || (lines?.delete?.length ?? 0) > 0;
  if (!hasChanges && value.intent === "save") {
    context.addIssue({
      code: "custom",
      path: ["changes"],
      message: "save requires at least one header or line change",
    });
  }
});
export type DocumentEditSubmitRequestV1 = z.infer<typeof DocumentEditSubmitRequestV1Schema>;

/** Required HTTP transport values after header-name normalization. */
export const DocumentEditSubmitHeadersV1Schema = z.object({
  workspace: z.string().trim().min(1),
  ifMatch: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
}).strict();
export type DocumentEditSubmitHeadersV1 = z.infer<typeof DocumentEditSubmitHeadersV1Schema>;

export const DocumentEditSubmitInvalidationV1Schema = z.object({
  type: z.string().trim().min(1),
  key: z.string().trim().min(1),
}).passthrough();

export const DocumentEditSubmitResponseV1Schema = z.object({
  ok: z.literal(true),
  intent: DocumentEditSubmitIntentSchema,
  record: z.object({
    id: z.string().trim().min(1),
    data: SubmitDataSchema,
    status: z.string(),
  }).strict(),
  etag: z.string().min(1),
  fieldMask: FieldMaskSchema,
  sectionMask: SectionMaskSchema,
  invalidations: z.array(DocumentEditSubmitInvalidationV1Schema),
  documentVersion: z.number().int().nonnegative(),
  actionResult: SubmitDataSchema.optional(),
}).strict();
export type DocumentEditSubmitResponseV1 = z.infer<typeof DocumentEditSubmitResponseV1Schema>;

export const DocumentEditWorkspaceErrorCodeSchema = z.enum([
  "WORKSPACE_REQUIRED",
  "INVALID_WORKSPACE",
  "STALE_WORKSPACE",
  "WORKSPACE_PROFILE_DENIED",
]);

export const DocumentEditSubmitIdempotencyErrorCodeSchema = z.enum([
  "IDEMPOTENCY_KEY_REQUIRED",
  "IDEMPOTENCY_KEY_REUSED",
  "IDEMPOTENCY_IN_PROGRESS",
]);

export const DocumentEditSubmitErrorV1Schema = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
  currentEtag: z.string().nullable().optional(),
  fieldErrors: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  lineErrors: z.array(z.object({
    id: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
    field: z.string().optional(),
    message: z.string(),
  }).strict()).optional(),
  details: z.record(z.string(), z.unknown()).optional(),
}).passthrough();
export type DocumentEditSubmitErrorV1 = z.infer<typeof DocumentEditSubmitErrorV1Schema>;

const SubmitErrorMessageSchema = z.object({ message: z.string().optional() }).passthrough();

export const DocumentEditSubmitWorkspaceErrorV1Schema = SubmitErrorMessageSchema.extend({
  error: DocumentEditWorkspaceErrorCodeSchema,
});

export const DocumentEditSubmitVersionConflictV1Schema = SubmitErrorMessageSchema.extend({
  error: z.literal("VERSION_CONFLICT"),
  currentEtag: z.string().nullable().optional(),
});

export const DocumentEditSubmitValidationErrorV1Schema = SubmitErrorMessageSchema.extend({
  error: z.enum(["VALIDATION", "VALIDATION_FAILED", "FIELD_NOT_EDITABLE", "SUBMIT_PREFLIGHT_FAILED"]),
  fieldErrors: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  lineErrors: z.array(z.object({
    id: z.string().optional(),
    index: z.number().int().nonnegative().optional(),
    field: z.string().optional(),
    message: z.string(),
  }).strict()).optional(),
});

export const DocumentEditSubmitLockErrorV1Schema = SubmitErrorMessageSchema.extend({
  error: z.enum(["LOCKED", "LOCK_REQUIRED", "LOCK_INVALID", "LOCK_EXPIRED"]),
});

export const DocumentEditSubmitIdempotencyErrorV1Schema = SubmitErrorMessageSchema.extend({
  error: DocumentEditSubmitIdempotencyErrorCodeSchema,
});

export const DocumentEditSubmitAuthorizationErrorV1Schema = SubmitErrorMessageSchema.extend({
  error: z.enum([
    "FORBIDDEN",
    "PERMISSION_DENIED",
    "POLICY_DENIED",
    "EDIT_NOT_ALLOWED",
    "ENTITY_OPERATION_REQUIRED",
  ]),
});

export const DocumentEditSubmitPolicyErrorV1Schema = SubmitErrorMessageSchema.extend({
  error: z.literal("SAVE_AND_TRANSITION_DISABLED"),
});

export const DocumentEditSubmitKnownErrorV1Schema = z.union([
  DocumentEditSubmitWorkspaceErrorV1Schema,
  DocumentEditSubmitVersionConflictV1Schema,
  DocumentEditSubmitValidationErrorV1Schema,
  DocumentEditSubmitLockErrorV1Schema,
  DocumentEditSubmitIdempotencyErrorV1Schema,
  DocumentEditSubmitAuthorizationErrorV1Schema,
  DocumentEditSubmitPolicyErrorV1Schema,
]);
export type DocumentEditSubmitKnownErrorV1 = z.infer<typeof DocumentEditSubmitKnownErrorV1Schema>;

export const DOCUMENT_EDIT_SUBMIT_ERROR_STATUS = {
  WORKSPACE_REQUIRED: 428,
  INVALID_WORKSPACE: 409,
  STALE_WORKSPACE: 409,
  WORKSPACE_PROFILE_DENIED: 403,
  VERSION_CONFLICT: 412,
  VALIDATION: 422,
  VALIDATION_FAILED: 422,
  FIELD_NOT_EDITABLE: 422,
  SUBMIT_PREFLIGHT_FAILED: 422,
  LOCKED: 423,
  LOCK_REQUIRED: 423,
  LOCK_INVALID: 423,
  LOCK_EXPIRED: 423,
  IDEMPOTENCY_KEY_REQUIRED: 428,
  IDEMPOTENCY_KEY_REUSED: 409,
  IDEMPOTENCY_IN_PROGRESS: 409,
  FORBIDDEN: 403,
  PERMISSION_DENIED: 403,
  POLICY_DENIED: 403,
  EDIT_NOT_ALLOWED: 403,
  ENTITY_OPERATION_REQUIRED: 403,
  SAVE_AND_TRANSITION_DISABLED: 409,
} as const;

export const DOCUMENT_EDIT_SUBMIT_HEADERS = {
  workspace: "X-Document-Edit-Workspace",
  ifMatch: "If-Match",
  idempotencyKey: "Idempotency-Key",
} as const;
