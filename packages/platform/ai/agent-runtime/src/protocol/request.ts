import { z } from "zod";

export const AtlasPlaneSchema = z.enum(["neon", "mesh", "admin"]);
export type AtlasPlane = z.infer<typeof AtlasPlaneSchema>;

export const AgentHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(12_000),
}).strict();

export const AgentRunRequestSchema = z.object({
  client_request_id: z.string().uuid(),
  thread_id: z.string().uuid().optional(),
  plane: AtlasPlaneSchema,
  model_id: z.string().trim().min(1).max(100),
  policy_revision: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().min(1).max(12_000),
  history: z.array(AgentHistoryMessageSchema).max(20).optional().default([]),
  context: z.object({
    route: z.string().trim().regex(/^\/[^\u0000-\u001f\u007f]{0,499}$/).optional(),
    entity_type: z.string().trim()
      .regex(/^[a-z][a-z0-9_]{0,63}$/)
      .optional(),
    entity_id: z.string().trim()
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/)
      .optional(),
  }).strict().optional(),
}).strict();

export type AgentHistoryMessage = z.infer<typeof AgentHistoryMessageSchema>;
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>;
