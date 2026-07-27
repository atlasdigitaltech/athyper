/**
 * WF Outbox Topic Handler
 *
 * Converts `event.outbox` rows with topic='wf' into `event.notification_message`
 * rows so the notification worker can dispatch them.
 *
 * Supported event types (from SLA worker + WorkflowEngine):
 *
 *   sla.work_item.reminder   → notify work_item assignee
 *   sla.work_item.escalated  → notify escalation target (principal only)
 *   sla.work_item.breach     → notify assignee
 *   sla.cycle_task.breach    → notify cycle task assignedTo
 *   wf.approved              → notify request submitter
 *   wf.rejected              → notify request submitter
 *
 * Each outbox event creates at most one notification_message (event_id uniqueness
 * is ensured by checking for an existing row before insert).
 *
 * The recipient_id is embedded in the notification_message.payload so that the
 * notification worker's resolveRecipients() can extract it without a subscription
 * table lookup.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { OutboxEvent, OutboxTopicHandler } from "../workers/domain-outbox.worker.js";
import { SYSTEM_ACTOR_ID } from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ── Event type → template key map ─────────────────────────────────────────────

const TEMPLATE_KEY_MAP: Record<string, string> = {
  "sla.work_item.reminder":   "wf.sla.reminder",
  "sla.work_item.escalated":  "wf.sla.escalate",
  "sla.work_item.breach":     "wf.sla.breach",
  "sla.cycle_task.breach":    "wf.close.sla.breach",
  "wf.work_item.assigned":    "wf.work_item.assigned",
  "wf.approved":              "wf.request.approved",
  "wf.rejected":              "wf.request.rejected",
  "wf.delegated":             "wf.request.delegated",
};

const NOTIFICATION_CHANNELS = new Set(["in_app", "email", "sms", "push", "webhook", "whatsapp"]);
const DEFAULT_CHANNELS: Record<string, string[]> = {
  "wf.work_item.assigned": ["email", "push"],
};

function notificationTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(values)}]::text[]`;
}

function channelsForEvent(eventType: string, payload: Record<string, unknown>): string[] {
  const rawChannels = Array.isArray(payload["channels"])
    ? (payload["channels"] as unknown[])
    : undefined;
  const channels = rawChannels
    ?.map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value && NOTIFICATION_CHANNELS.has(value));
  const unique = [...new Set(channels)];
  return unique.length > 0 ? unique : (DEFAULT_CHANNELS[eventType] ?? ["in_app"]);
}

function subjectForEvent(eventType: string, payload: Record<string, unknown>): string | null {
  if (typeof payload["subject"] === "string" && payload["subject"].trim()) {
    return payload["subject"].trim();
  }
  if (eventType === "wf.work_item.assigned") return "Workflow approval needed";
  return null;
}

// ── Recipient extraction ───────────────────────────────────────────────────────

/**
 * Extract the notification recipient UUID from a wf outbox event payload.
 * Returns null if no actionable recipient can be determined.
 */
function extractRecipientId(eventType: string, payload: Record<string, unknown>): string | null {
  switch (eventType) {
    case "sla.work_item.reminder":
    case "sla.work_item.breach":
      return (payload["assigneeId"] as string | null) ?? null;

    case "sla.work_item.escalated": {
      const target = payload["escalationTarget"] as { type?: string; value?: string } | null;
      // Only notify if target is a direct principal (role targets require role expansion)
      return (target?.type === "principal" && target.value) ? target.value : null;
    }

    case "sla.cycle_task.breach":
      return (payload["assignedTo"] as string | null) ?? null;

    case "wf.work_item.assigned":
      return (payload["recipient_id"] as string | null)
          ?? (payload["assigneeId"] as string | null)
          ?? null;

    case "wf.approved":
    case "wf.rejected":
    case "wf.delegated":
      return (payload["requestedBy"] as string | null)
          ?? (payload["submittedBy"]  as string | null)
          ?? null;

    default:
      return null;
  }
}

// ── Handler factory ───────────────────────────────────────────────────────────

export function createWfOutboxHandler(db: DB): OutboxTopicHandler {
  return {
    async handle(event: OutboxEvent): Promise<void> {
      const { id: outboxId, tenant_id, event_type, payload, entity_type, entity_id, actor_id } = event;

      // Only handle known event types
      const templateKey = event_type ? TEMPLATE_KEY_MAP[event_type] : undefined;
      if (!templateKey) return;

      // Extract recipient
      const recipientId = extractRecipientId(event_type!, payload);
      if (!recipientId) return;

      // Idempotency: skip if a notification_message already exists for this outbox event
      const existing = await sql<{ id: string }>`
        SELECT id FROM event.notification_message
        WHERE  event_id   = ${outboxId}
          AND  tenant_id  = ${tenant_id}::uuid
        LIMIT  1
      `.execute(db);
      if (existing.rows.length > 0) return;

      // Enrich payload with recipient_id for resolveRecipients()
      const enrichedPayload = {
        ...payload,
        recipient_id: recipientId,
        _eventType:   event_type,
      };
      const channels = channelsForEvent(event_type!, payload);

      await sql`
        INSERT INTO event.notification_message
          (tenant_id,          plane_key,        event_id,         event_code,
           template_key,       template_version, subject,
           entity_type,        entity_id,
           payload,            channels,          priority,
           created_by)
        VALUES
          (${tenant_id}::uuid, 'neon',           ${outboxId},      ${event_type ?? "wf.event"},
           ${templateKey},     1,                ${subjectForEvent(event_type!, payload)},
           ${entity_type},     ${entity_id}::uuid,
           ${JSON.stringify(enrichedPayload)}::jsonb,
           ${notificationTextArray(channels)},    'normal',
           ${actor_id ?? SYSTEM_ACTOR_ID}::uuid)
        ON CONFLICT DO NOTHING
      `.execute(db);
    },
  };
}
