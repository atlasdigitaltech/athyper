/**
 * NotificationOrchestrator — cross-plane notification dispatch.
 *
 * event.notification_message is common DDL, making this a platform-level
 * capability available to all planes.
 *
 * Changes from the services/platform original:
 *   - sourcePlane "admin" renamed to "athyper" (canonical plane identifier)
 *   - Direct BullMQ Queue dependency replaced with DeliveryQueue port —
 *     callers inject the adapter; platform code no longer owns the queue binding
 */

import { sql, type Kysely } from "kysely";

// ── DeliveryQueue port ────────────────────────────────────────────────────────

/** Minimal queue port — decouples the orchestrator from BullMQ. */
export interface DeliveryQueue {
  add(name: string, data: Record<string, unknown>, opts?: { priority?: number; delay?: number }): Promise<void>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlaneKey = "neon" | "mesh" | "athyper";

export interface DispatchNotificationInput {
  tenantId:        string;
  eventCode:       string;
  recipientId?:    string;
  extraRecipients?: string[];
  templateKey:     string;
  subject?:        string;
  payload:         Record<string, unknown>;
  channels?:       string[];
  dedupKey?:       string;
  dedupWindowMs?:  number;
  scheduleAt?:     string;
  priority?:       number;
  sourcePlane?:    PlaneKey;
}

export interface DispatchResult {
  messageIds: string[];
  skipped:    boolean;
  skipReason: string | null;
}

export interface JobLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  error?(event: string, fields?: Record<string, unknown>): void;
}

// ── PreferenceEvaluator ───────────────────────────────────────────────────────

export class PreferenceEvaluator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) { this.db = db; }

  async getChannels(
    principalId: string,
    tenantId:    string,
    eventCode:   string,
    planeKey:    PlaneKey,
  ): Promise<{ channel: string; frequencyCode: string | null }[]> {
    const rows = await this.db
      .selectFrom("master.principal_notification_preference as pnp" as never)
      .select(["pnp.channel", "pnp.frequency_code"] as never[])
      .where("pnp.principal_id" as never, "=", principalId as never)
      .where("pnp.tenant_id" as never, "=", tenantId as never)
      .where("pnp.event_code" as never, "=", eventCode as never)
      .where("pnp.plane_key" as never, "=", planeKey as never)
      .where("pnp.is_enabled" as never, "=", true as never)
      .execute() as Array<{ channel: string; frequency_code: string | null }>;

    if (rows.length === 0) return [{ channel: "in_app", frequencyCode: null }];
    return rows.map((r) => ({ channel: r.channel, frequencyCode: r.frequency_code }));
  }
}

// ── RecipientResolver ─────────────────────────────────────────────────────────

export class RecipientResolver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) { this.db = db; }

  async resolveAddresses(principalId: string, tenantId: string): Promise<Record<string, string>> {
    const row = await this.db
      .selectFrom("master.principal as p" as never)
      .select(["p.login_email"] as never[])
      .where("p.id" as never, "=", principalId as never)
      .where("p.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { login_email: string | null } | undefined;

    const addresses: Record<string, string> = {
      in_app: principalId,
      push:   principalId,
    };
    if (row?.login_email) addresses["email"] = row.login_email;
    return addresses;
  }
}

// ── NotificationOrchestrator ──────────────────────────────────────────────────

const SYSTEM_ACTOR_ID = "00000000-0000-7000-a000-000000000001";

export class NotificationOrchestrator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db:          Kysely<any>;
  private readonly preferences: PreferenceEvaluator;
  private readonly resolver:    RecipientResolver;
  private readonly logger?:     JobLogger;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db:      Kysely<any>,
    _queue:  DeliveryQueue,   // reserved for future direct-enqueue path
    logger?: JobLogger,
  ) {
    this.db          = db;
    this.preferences = new PreferenceEvaluator(db);
    this.resolver    = new RecipientResolver(db);
    this.logger      = logger;
  }

  async dispatch(input: DispatchNotificationInput): Promise<DispatchResult> {
    const planeKey = input.sourcePlane ?? await this.currentPlaneKey();

    if (input.dedupKey) {
      const isDupe = await this.isDuplicate(input.tenantId, input.dedupKey, input.dedupWindowMs ?? 5 * 60_000);
      if (isDupe) return { messageIds: [], skipped: true, skipReason: "duplicate_in_window" };
    }

    const recipients = [
      ...(input.recipientId ? [input.recipientId] : []),
      ...(input.extraRecipients ?? []),
    ];

    if (recipients.length === 0) return { messageIds: [], skipped: true, skipReason: "no_recipients" };

    const messageIds: string[] = [];

    for (const recipientId of recipients) {
      const channels = input.channels
        ? input.channels.map((c) => ({ channel: c, frequencyCode: null }))
        : await this.preferences.getChannels(recipientId, input.tenantId, input.eventCode, planeKey);

      const addresses = await this.resolver.resolveAddresses(recipientId, input.tenantId);
      const deliverable = channels.filter((c) => addresses[c.channel]);
      if (deliverable.length === 0) continue;

      const messageId = await this.createMessage({
        tenantId:    input.tenantId,
        recipientId,
        templateKey: input.templateKey,
        subject:     input.subject ?? null,
        payload:     input.payload,
        channels:    deliverable.map((c) => c.channel),
        eventCode:   input.eventCode,
        dedupKey:    input.dedupKey ?? null,
        scheduleAt:  input.scheduleAt ?? null,
        priority:    input.priority ?? 5,
        sourcePlane: planeKey,
      });
      messageIds.push(messageId);
    }

    this.logger?.info("notification_dispatched", {
      eventCode:  input.eventCode,
      tenantId:   input.tenantId,
      recipients: recipients.length,
      messages:   messageIds.length,
    });

    return {
      messageIds,
      skipped:    messageIds.length === 0,
      skipReason: messageIds.length === 0 ? "no_deliverable_channels" : null,
    };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async currentPlaneKey(): Promise<PlaneKey> {
    const result = await sql<{ plane_key: PlaneKey }>`
      SELECT event.current_plane_key() AS plane_key
    `.execute(this.db);
    return result.rows[0]?.plane_key ?? "neon";
  }

  private async createMessage(opts: {
    tenantId:    string;
    recipientId: string;
    templateKey: string;
    subject:     string | null;
    payload:     Record<string, unknown>;
    channels:    string[];
    eventCode:   string;
    dedupKey:    string | null;
    scheduleAt:  string | null;
    priority:    number;
    sourcePlane: PlaneKey;
  }): Promise<string> {
    const storedPayload = { ...opts.payload, recipient_id: opts.recipientId };

    const row = await sql<{ id: string }>`
      INSERT INTO event.notification_message
        (tenant_id,    plane_key,         event_id,          event_code,
         template_key, template_version,  subject,
         payload,      channels,          priority,
         recipient_count, status,         created_by)
      VALUES
        (${opts.tenantId}::uuid,
         ${opts.sourcePlane},
         COALESCE(${opts.dedupKey}, gen_random_uuid()::text),
         ${opts.eventCode},
         ${opts.templateKey},
         1,
         ${opts.subject},
         ${JSON.stringify(storedPayload)}::jsonb,
         ARRAY[${sql.join(opts.channels)}]::text[],
         'normal',
         1,
         'pending',
         ${SYSTEM_ACTOR_ID}::uuid)
      RETURNING id
    `.execute(this.db).then((r) => r.rows[0]);

    if (!row?.id) throw new Error("notification_message_insert_failed");
    return row.id;
  }

  private async isDuplicate(tenantId: string, dedupKey: string, windowMs: number): Promise<boolean> {
    const since = new Date(Date.now() - windowMs).toISOString();
    const row = await this.db
      .selectFrom("event.notification_message as nm" as never)
      .select("nm.id" as never)
      .where("nm.tenant_id" as never, "=", tenantId as never)
      .where("nm.event_id" as never, "=", dedupKey as never)
      .where("nm.created_at" as never, ">", since as never)
      .limit(1)
      .executeTakeFirst() as { id: string } | undefined;
    return !!row;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createNotificationOrchestrator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:      Kysely<any>,
  queue:   DeliveryQueue,
  logger?: JobLogger,
): NotificationOrchestrator {
  return new NotificationOrchestrator(db, queue, logger);
}
