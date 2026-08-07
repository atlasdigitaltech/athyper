import { z } from "zod";

import { AtlasPlaneSchema } from "../protocol/request";
import { AtlasResultCardSchema } from "../protocol/events";

export const ATLAS_THREAD_PERSISTENCE_CAPABILITY_ID =
  "atlas.conversation.persistence";
export const ATLAS_THREAD_API_PATH = "/api/ai/agent/threads";

const AtlasThreadIdSchema = z.uuid();
const AtlasThreadCursorSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{1,2000}$/);
const AtlasTimestampSchema = z.iso.datetime({ offset: true });
const AtlasPositiveBigintSchema = z.string().regex(/^[1-9][0-9]{0,18}$/);
const AtlasNonnegativeBigintSchema = z.string()
  .regex(/^(?:0|[1-9][0-9]{0,18})$/);

export const AtlasThreadStatusSchema = z.enum(["active", "archived"]);
export type AtlasThreadStatus = z.infer<typeof AtlasThreadStatusSchema>;

export const AtlasThreadRetentionSchema = z.object({
  policy_id: z.string().trim().min(1).max(200),
  expires_at: AtlasTimestampSchema.nullable(),
  purge_after: AtlasTimestampSchema.nullable(),
  legal_hold: z.boolean(),
  /**
   * Server-authoritative, tenant-effective retention wording. The UI renders
   * this text verbatim instead of guessing a duration from `expires_at`.
   */
  display_text: z.string().trim().min(1).max(500),
}).strict();
export type AtlasThreadRetention = z.infer<typeof AtlasThreadRetentionSchema>;

export const AtlasThreadSchema = z.object({
  thread_id: AtlasThreadIdSchema,
  plane: AtlasPlaneSchema,
  title: z.string().trim().min(1).max(200),
  status: AtlasThreadStatusSchema,
  message_count: AtlasNonnegativeBigintSchema,
  created_at: AtlasTimestampSchema,
  updated_at: AtlasTimestampSchema,
  row_version: AtlasPositiveBigintSchema,
  retention: AtlasThreadRetentionSchema,
}).strict();
export type AtlasThread = z.infer<typeof AtlasThreadSchema>;

export const CreateAtlasThreadRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
}).strict();
export type CreateAtlasThreadRequest = z.infer<
  typeof CreateAtlasThreadRequestSchema
>;

export const AtlasThreadResponseSchema = z.object({
  thread: AtlasThreadSchema,
}).strict();
export type AtlasThreadResponse = z.infer<typeof AtlasThreadResponseSchema>;

export const ListAtlasThreadsQuerySchema = z.object({
  cursor: AtlasThreadCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  status: z.enum(["active", "archived", "all"]).default("all"),
}).strict();
export type ListAtlasThreadsQuery = z.input<
  typeof ListAtlasThreadsQuerySchema
>;

export const AtlasThreadListResponseSchema = z.object({
  items: z.array(AtlasThreadSchema).max(100),
  next_cursor: AtlasThreadCursorSchema.nullable(),
  /**
   * Tenant-effective copy for the rail even when the current page is empty.
   */
  retention_notice: z.string().trim().min(1).max(500),
  retention_policy: z.object({
    policy_id: z.string().trim().min(1).max(200),
    retention_days: z.number().int().min(1).max(3_650),
  }).strict().optional(),
}).strict();
export type AtlasThreadListResponse = z.infer<
  typeof AtlasThreadListResponseSchema
>;

export const UpdateAtlasThreadRequestSchema = z.object({
  row_version: AtlasPositiveBigintSchema,
  title: z.string().trim().min(1).max(200).optional(),
  status: z.literal("archived").optional(),
}).strict().superRefine((value, context) => {
  if (value.title === undefined && value.status === undefined) {
    context.addIssue({
      code: "custom",
      message: "thread update requires title or status",
    });
  }
});
export type UpdateAtlasThreadRequest = z.infer<
  typeof UpdateAtlasThreadRequestSchema
>;

export const AtlasThreadMessageRoleSchema = z.enum([
  "user",
  "assistant",
  "tool",
  "system",
]);
export type AtlasThreadMessageRole = z.infer<
  typeof AtlasThreadMessageRoleSchema
>;

export const AtlasThreadMessageStatusSchema = z.enum([
  "pending",
  "complete",
  "failed",
  "cancelled",
]);
export type AtlasThreadMessageStatus = z.infer<
  typeof AtlasThreadMessageStatusSchema
>;

export const AtlasThreadMessageSchema = z.object({
  message_id: z.uuid(),
  thread_id: AtlasThreadIdSchema,
  sequence: AtlasPositiveBigintSchema,
  role: AtlasThreadMessageRoleSchema,
  content: z.string().max(200_000),
  result_cards: z.array(AtlasResultCardSchema).max(20).optional(),
  status: AtlasThreadMessageStatusSchema,
  run_id: z.uuid().nullable(),
  parent_message_id: z.uuid().nullable(),
  created_at: AtlasTimestampSchema,
  terminal_at: AtlasTimestampSchema.nullable(),
}).strict();
export type AtlasThreadMessage = z.infer<typeof AtlasThreadMessageSchema>;

export const ListAtlasThreadMessagesQuerySchema = z.object({
  cursor: AtlasThreadCursorSchema.optional(),
  limit: z.number().int().min(1).max(100).default(100),
}).strict();
export type ListAtlasThreadMessagesQuery = z.input<
  typeof ListAtlasThreadMessagesQuerySchema
>;

export const AtlasThreadMessageListResponseSchema = z.object({
  items: z.array(AtlasThreadMessageSchema).max(100),
  next_cursor: AtlasThreadCursorSchema.nullable(),
}).strict().superRefine((value, context) => {
  const sequences = new Set<string>();
  for (const [index, message] of value.items.entries()) {
    if (sequences.has(message.sequence)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "sequence"],
        message: "message sequence must be unique within a page",
      });
    }
    sequences.add(message.sequence);
  }
});
export type AtlasThreadMessageListResponse = z.infer<
  typeof AtlasThreadMessageListResponseSchema
>;
