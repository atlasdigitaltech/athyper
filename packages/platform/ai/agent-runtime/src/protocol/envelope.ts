import { z } from "zod";
import { AgentStreamEventSchema } from "./events";
import { ATLAS_AGENT_SCHEMA_VERSION } from "./schema-version";

export const AgentStreamEnvelopeSchema = z.object({
  schema_version: z.literal(ATLAS_AGENT_SCHEMA_VERSION),
  run_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  message_id: z.string().uuid(),
  sequence: z.number().int().nonnegative(),
  client_request_id: z.string().uuid().optional(),
  event: AgentStreamEventSchema,
}).strict();

export type AgentStreamEnvelope = z.infer<typeof AgentStreamEnvelopeSchema>;
