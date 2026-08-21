/**
 * P2P Notification Outbox Topic Handler
 *
 * Converts `event.outbox` rows with topic='notification' (emitted by the
 * four from-X services in svc-business/p2p/*-from-*.service.ts) into
 * `event.notification_message` rows so the notification worker can
 * dispatch them through the existing email / push / in-app channels.
 *
 * Supported event types:
 *
 *   p2p.commitment.created_from_requisition    → notify requisition.requested_by (the requester)
 *   p2p.receipt.created_from_commitment        → notify commitment.requested_by + buyer
 *   p2p.service_sheet.created_from_commitment  → notify commitment.requested_by + buyer
 *   p2p.invoice.created_from_receipt           → notify commitment.requested_by + AP analyst
 *   p2p.payment.created_from_invoice           → notify invoice.created_by (AP analyst)
 *
 * Recipient resolution: we look up the originating aggregate's
 * `requested_by` / `created_by` to know who started the chain and
 * pre-notify them when the downstream document lands. The notification
 * worker then expands the recipient_id through its standard channel
 * registration (in_app feed, optionally email/push).
 *
 * Idempotency: same pattern as wf-outbox.handler — we look up an
 * existing notification_message keyed on event_id (the outbox row id)
 * and ON CONFLICT DO NOTHING on insert.
 */

import { sql } from "kysely";
import type { Kysely } from "kysely";
import type { OutboxEvent, OutboxTopicHandler } from "../workers/domain-outbox.worker.js";
import { SYSTEM_ACTOR_ID } from "../jobs.types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = Kysely<Record<string, any>>;

// ── Event-type → notification template key ──────────────────────────────────

const TEMPLATE_KEY_MAP: Record<string, string> = {
  "p2p.commitment.created_from_requisition":   "p2p.commitment.created",
  "p2p.receipt.created_from_commitment":       "p2p.receipt.created",
  "p2p.service_sheet.created_from_commitment": "p2p.service_sheet.created",
  "p2p.invoice.created_from_receipt":          "p2p.invoice.created",
  "p2p.payment.created_from_invoice":          "p2p.payment.created",
};

const NOTIFICATION_CHANNELS = new Set(["in_app", "email", "sms", "push", "webhook", "whatsapp"]);

// Default channel set per event. Most P2P events are "FYI" → in_app only;
// supplier-facing or money-moving ones add email so the recipient gets a
// pushed copy outside the app.
const DEFAULT_CHANNELS: Record<string, string[]> = {
  "p2p.commitment.created_from_requisition":   ["in_app"],
  "p2p.receipt.created_from_commitment":       ["in_app"],
  "p2p.service_sheet.created_from_commitment": ["in_app"],
  "p2p.invoice.created_from_receipt":          ["in_app"],
  "p2p.payment.created_from_invoice":          ["in_app", "email"],
};

function notificationTextArray(values: string[]) {
  return sql`ARRAY[${sql.join(values)}]::text[]`;
}

function channelsForEvent(eventType: string, payload: Record<string, unknown>): string[] {
  const rawChannels = Array.isArray(payload["channels"]) ? (payload["channels"] as unknown[]) : undefined;
  const channels = rawChannels
    ?.map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value && NOTIFICATION_CHANNELS.has(value));
  const unique = [...new Set(channels)];
  return unique.length > 0 ? unique : (DEFAULT_CHANNELS[eventType] ?? ["in_app"]);
}

function subjectForEvent(eventType: string, payload: Record<string, unknown>): string | null {
  const docNumber =
    (payload["commitment_number"]    as string | undefined)
    ?? (payload["receipt_number"]       as string | undefined)
    ?? (payload["service_sheet_number"] as string | undefined)
    ?? (payload["code"]              as string | undefined)
    ?? (payload["invoice_number"]    as string | undefined)
    ?? (payload["payment_number"]    as string | undefined);
  switch (eventType) {
    case "p2p.commitment.created_from_requisition":   return docNumber ? `Purchase Order ${docNumber} created`  : "Purchase Order created";
    case "p2p.receipt.created_from_commitment":       return docNumber ? `Receipt ${docNumber} created`        : "Receipt created";
    case "p2p.service_sheet.created_from_commitment": return docNumber ? `Service Sheet ${docNumber} created`  : "Service Sheet created";
    case "p2p.invoice.created_from_receipt":          return docNumber ? `Invoice ${docNumber} created`        : "Invoice created";
    case "p2p.payment.created_from_invoice":          return docNumber ? `Payment ${docNumber} created`        : "Payment created";
    default:                                          return null;
  }
}

// ── Recipient extraction ───────────────────────────────────────────────────

interface RequisitionActor  { requested_by: string | null }
interface CommitmentActor   { requested_by: string | null; responsible_person_id: string | null }
interface ReceiptActor      { created_by: string | null; commitment_id: string | null }
interface InvoiceActor      { created_by: string | null; commitment_id: string | null }

/**
 * Resolve the recipient(s) for a P2P promoted-flow notification. Returns a
 * de-duplicated list of principal UUIDs. Per the notification worker
 * convention only the first recipient is embedded in the payload; if more
 * granular fan-out is needed later, the rule engine in
 * control.notification_routing_rule covers it.
 */
async function resolveRecipients(
  db: DB,
  event: OutboxEvent,
): Promise<string[]> {
  const { tenant_id, event_type, payload, actor_id, aggregate_id } = event;
  const actor = actor_id ?? null;

  switch (event_type) {
    case "p2p.commitment.created_from_requisition": {
      // Aggregate = purchase_requisition. Notify whoever requested the PR
      // (they're waiting on a PO to fulfil their request) + the buyer who
      // converted it (= actor — they own the lifecycle from here on).
      if (!aggregate_id) return uniqueIds(actor);
      const rows = await sql<RequisitionActor>`
        SELECT requested_by::text
          FROM document.purchase_requisition
         WHERE id        = ${aggregate_id}::uuid
           AND tenant_id = ${tenant_id}::uuid
         LIMIT 1
      `.execute(db);
      return uniqueIds(rows.rows[0]?.requested_by ?? null, actor);
    }

    case "p2p.receipt.created_from_commitment":
    case "p2p.service_sheet.created_from_commitment": {
      // Aggregate = commitment. Notify whoever requested the PO + the
      // buyer (procurement contact) plus the originator of the receipt.
      if (!aggregate_id) return uniqueIds(actor);
      const rows = await sql<CommitmentActor>`
        SELECT c.requested_by::text, c.responsible_person_id::text
          FROM document.commitment c
         WHERE c.id        = ${aggregate_id}::uuid
           AND c.tenant_id = ${tenant_id}::uuid
         LIMIT 1
      `.execute(db);
      const r = rows.rows[0];
      return uniqueIds(r?.requested_by ?? null, r?.responsible_person_id ?? null, actor);
    }

    case "p2p.invoice.created_from_receipt": {
      // Aggregate = receipt. Notify the user who created the receipt
      // (they're the most likely closure owner) + the originating PO's
      // requested_by so the buyer knows their PO has an invoice landing.
      if (!aggregate_id) return uniqueIds(actor);
      const receipt = await sql<ReceiptActor>`
        SELECT created_by::text, commitment_id::text
          FROM document.receipt
         WHERE id = ${aggregate_id}::uuid AND tenant_id = ${tenant_id}::uuid
         LIMIT 1
      `.execute(db);
      const r = receipt.rows[0];
      const recipients = [r?.created_by ?? null, actor];
      if (r?.commitment_id) {
        const cmt = await sql<CommitmentActor>`
          SELECT c.requested_by::text, c.responsible_person_id::text
            FROM document.commitment c
           WHERE c.id = ${r.commitment_id}::uuid AND c.tenant_id = ${tenant_id}::uuid
           LIMIT 1
        `.execute(db);
        recipients.push(cmt.rows[0]?.requested_by ?? null, cmt.rows[0]?.responsible_person_id ?? null);
      }
      return uniqueIds(...recipients);
    }

    case "p2p.payment.created_from_invoice": {
      // Aggregate = first invoice. Notify whoever created the invoice
      // (AP analyst) — they own the payment cycle for that PI.
      const invoiceId = (payload["invoice_ids"] as string[] | undefined)?.[0] ?? aggregate_id;
      if (!invoiceId) return uniqueIds(actor);
      const inv = await sql<InvoiceActor>`
        SELECT created_by::text, commitment_id::text
          FROM document.purchase_invoice
         WHERE id = ${invoiceId}::uuid AND tenant_id = ${tenant_id}::uuid
         LIMIT 1
      `.execute(db);
      return uniqueIds(inv.rows[0]?.created_by ?? null, actor);
    }

    default:
      return uniqueIds(actor);
  }
}

function uniqueIds(...values: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const v of values) {
    if (typeof v === "string" && v.length > 0 && v !== SYSTEM_ACTOR_ID) set.add(v);
  }
  return Array.from(set);
}

// ── Handler factory ────────────────────────────────────────────────────────

export function createP2pNotificationOutboxHandler(db: DB): OutboxTopicHandler {
  return {
    async handle(event: OutboxEvent): Promise<void> {
      const { id: outboxId, tenant_id, event_type, payload, entity_type, entity_id, actor_id } = event;
      if (!event_type) return;
      const templateKey = TEMPLATE_KEY_MAP[event_type];
      if (!templateKey) return;

      // Idempotency: one notification_message per outbox event.
      const existing = await sql<{ id: string }>`
        SELECT id FROM event.notification_message
        WHERE  event_id  = ${outboxId}
          AND  tenant_id = ${tenant_id}::uuid
        LIMIT  1
      `.execute(db);
      if (existing.rows.length > 0) return;

      const recipients = await resolveRecipients(db, event);
      if (recipients.length === 0) return;
      const primaryRecipient = recipients[0];

      const enrichedPayload = {
        ...payload,
        recipient_id:  primaryRecipient,
        additional_recipients: recipients.slice(1),
        _eventType:    event_type,
      };
      const channels = channelsForEvent(event_type, payload);

      await sql`
        INSERT INTO event.notification_message
          (tenant_id,          plane_key,        event_id,         event_code,
           template_key,       template_version, subject,
           entity_type,        entity_id,
           payload,            channels,          priority,
           created_by)
        VALUES
          (${tenant_id}::uuid, 'neon',           ${outboxId},      ${event_type},
           ${templateKey},     1,                ${subjectForEvent(event_type, payload)},
           ${entity_type},     ${entity_id ?? null}::uuid,
           ${JSON.stringify(enrichedPayload)}::jsonb,
           ${notificationTextArray(channels)},    'normal',
           ${actor_id ?? SYSTEM_ACTOR_ID}::uuid)
        ON CONFLICT DO NOTHING
      `.execute(db);
    },
  };
}
