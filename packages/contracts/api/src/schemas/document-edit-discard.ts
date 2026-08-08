import { z } from "zod";

export const DocumentEditDiscardOperationSchema = z.enum([
  "discard_draft",
  "revert_to_baseline",
]);
export type DocumentEditDiscardOperation = z.infer<typeof DocumentEditDiscardOperationSchema>;

export const DocumentEditDiscardDraftRequestV1Schema = z.object({
  operation: z.literal("discard_draft"),
  sourceTabId: z.string().trim().min(1),
}).strict();
export type DocumentEditDiscardDraftRequestV1 = z.infer<typeof DocumentEditDiscardDraftRequestV1Schema>;

export const DocumentEditDiscardDraftResponseV1Schema = z.object({
  ok: z.literal(true),
  operation: z.literal("discard_draft"),
  draft: z.object({
    cleared: z.boolean(),
    authoritative: z.literal(false),
    mode: z.literal("recovery_only"),
  }).strict(),
  invalidations: z.array(z.object({
    type: z.literal("draft"),
    key: z.literal("recovery"),
  }).strict()),
}).strict();
export type DocumentEditDiscardDraftResponseV1 = z.infer<typeof DocumentEditDiscardDraftResponseV1Schema>;

export const DocumentEditRevertToBaselineRequestV1Schema = z.object({
  operation: z.literal("revert_to_baseline"),
  sourceTabId: z.string().trim().min(1),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();
export type DocumentEditRevertToBaselineRequestV1 = z.infer<typeof DocumentEditRevertToBaselineRequestV1Schema>;

export const DocumentEditRevertToBaselineResponseV1Schema = z.object({
  ok: z.literal(true),
  operation: z.literal("revert_to_baseline"),
  baselineSnapshotId: z.string().min(1),
  result: z.record(z.string(), z.unknown()),
}).strict();
export type DocumentEditRevertToBaselineResponseV1 = z.infer<typeof DocumentEditRevertToBaselineResponseV1Schema>;


