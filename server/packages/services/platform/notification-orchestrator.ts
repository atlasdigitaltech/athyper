/**
 * NotificationOrchestrator — Phase 5.2
 *
 * Coordinates the full notification dispatch pipeline:
 *   1. Evaluate recipient preferences (PreferenceEvaluator)
 *   2. Resolve recipient channel addresses (RecipientResolver)
 *   3. Apply dedup: skip if duplicate event within dedup_window
 *   4. Create event.notification_message row
 *   5. The notification sweep claims pending rows and enqueues send jobs
 *
 * This is the entry point for all notification creation. Route handlers
 * and outbox workers call orchestrator.dispatch() rather than writing
 * directly to event.notification_message.
 *
 * Wires to the existing notification worker via the BullMQ notifications queue.
 * The worker handles the actual delivery per channel.
 *
 * Architecture:
 *   NotificationOrchestrator.dispatch()
 *     → PreferenceEvaluator.getChannels()        (which channels user wants)
 *     → RecipientResolver.resolve()              (principal → address per channel)
 *     → DedupChecker.isDuplicate()               (skip repeated events)
 *     → DB: insert event.notification_message
 *     → DB: pending row picked up by notification sweep
 */

import { sql, type Kysely } from "kysely";
import type { Queue } from "bullmq";
import { SYSTEM_ACTOR_ID, type SendNotificationJobData, type JobLogger } from "@athyper/svc-jobs";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DispatchNotificationInput {
  tenantId:       string;
  eventCode:      string;
  /** Primary recipient — principal UUID */
  recipientId?:   string;
  /** Additional principal UUIDs (e.g. CC list) */
  extraRecipients?: string[];
  /** Notification template key */
  templateKey:    string;
  /** Template subject (overrides template default) */
  subject?:       string;
  /** Payload merged into template variables */
  payload:        Record<string, unknown>;
  /** Explicit channels to use (skips preference lookup) */
  channels?:      string[];
  /** Deduplication key (prevents repeating same notification in dedupWindowMs) */
  dedupKey?:      string;
  dedupWindowMs?: number;
  /** Scheduling */
  scheduleAt?:    string;   // ISO timestamp — deferred delivery
  priority?:      number;
  /**
   * Trusted delivery/visibility plane. Also selects the email FROM mapping.
   * Defaults to Neon only during the expand rollout for legacy internal callers.
   */
  sourcePlane?:   "neon" | "mesh" | "admin";
}

export interface DispatchResult {
  messageIds: string[];
  skipped:    boolean;
  skipReason: string | null;
}

// ── PreferenceEvaluator ───────────────────────────────────────────────────────

export class PreferenceEvaluator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Get the active channels for a principal for a given event code.
   * Falls back to ['in_app'] if no preferences are configured.
   */
  async getChannels(
    principalId: string,
    tenantId:    string,
    eventCode:   string,
    planeKey:    "neon" | "mesh" | "admin",
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

    if (rows.length === 0) {
      // Default: in_app only
      return [{ channel: "in_app", frequencyCode: null }];
    }

    return rows.map((r) => ({
      channel:       r.channel,
      frequencyCode: r.frequency_code,
    }));
  }
}

// ── RecipientResolver ─────────────────────────────────────────────────────────

export class RecipientResolver {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db: Kysely<any>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(db: Kysely<any>) {
    this.db = db;
  }

  /**
   * Resolve a principal ID to their channel addresses.
   * Returns a map of channel → address (email, phone, etc.).
   */
  async resolveAddresses(
    principalId: string,
    tenantId:    string,
  ): Promise<Record<string, string>> {
    const row = await this.db
      .selectFrom("master.principal as p" as never)
      .select(["p.login_email"] as never[])
      .where("p.id" as never, "=", principalId as never)
      .where("p.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { login_email: string | null } | undefined;

    const addresses: Record<string, string> = {
      in_app: principalId, // in_app delivery uses principal ID as address
      push:   principalId, // push adapter resolves registered devices by principal ID
    };

    if (row?.login_email) addresses["email"] = row.login_email;

    return addresses;
  }
}

// ── NotificationOrchestrator ──────────────────────────────────────────────────

export class NotificationOrchestrator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db:          Kysely<any>;
  private readonly preferences: PreferenceEvaluator;
  private readonly resolver:    RecipientResolver;
  private readonly logger?:     JobLogger;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db:       Kysely<any>,
    queue:    Queue<SendNotificationJobData>,
    logger?:  JobLogger,
  ) {
    void queue;
    this.db          = db;
    this.preferences = new PreferenceEvaluator(db);
    this.resolver    = new RecipientResolver(db);
    this.logger      = logger;
  }

  /**
   * Dispatch a notification through the full pipeline.
   * Idempotent when dedupKey is provided.
   */
  async dispatch(input: DispatchNotificationInput): Promise<DispatchResult> {
    const planeKey = input.sourcePlane ?? await this.currentPlaneKey();
    // Dedup check
    if (input.dedupKey) {
      const isDupe = await this.isDuplicate(
        input.tenantId,
        input.dedupKey,
        input.dedupWindowMs ?? 5 * 60_000,
      );
      if (isDupe) {
        return { messageIds: [], skipped: true, skipReason: "duplicate_in_window" };
      }
    }

    // Build recipient list
    const recipients = [
      ...(input.recipientId ? [input.recipientId] : []),
      ...(input.extraRecipients ?? []),
    ];

    if (recipients.length === 0) {
      return { messageIds: [], skipped: true, skipReason: "no_recipients" };
    }

    const messageIds: string[] = [];

    for (const recipientId of recipients) {
      // Determine channels
      const channels = input.channels
        ? input.channels.map((c) => ({ channel: c, frequencyCode: null }))
        : await this.preferences.getChannels(recipientId, input.tenantId, input.eventCode, planeKey);

      // Resolve addresses
      const addresses = await this.resolver.resolveAddresses(recipientId, input.tenantId);

      // Filter channels to ones where we have an address
      const deliverableChannels = channels.filter((c) => addresses[c.channel]);

      if (deliverableChannels.length === 0) continue;

      // Create a pending notification_message row. The notification sweep owns
      // the pending → planning transition and BullMQ enqueue.
      const messageId = await this.createMessage({
        tenantId:     input.tenantId,
        recipientId,
        templateKey:  input.templateKey,
        subject:      input.subject ?? null,
        payload:      input.payload,
        channels:     deliverableChannels.map((c) => c.channel),
        eventCode:    input.eventCode,
        dedupKey:     input.dedupKey ?? null,
        scheduleAt:   input.scheduleAt ?? null,
        priority:     input.priority ?? 5,
        sourcePlane:  planeKey,
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

  // ── Private ─────────────────────────────────────────────────────────────────

  private async currentPlaneKey(): Promise<"neon" | "mesh" | "admin"> {
    const result = await sql<{ plane_key: "neon" | "mesh" | "admin" }>`
      SELECT event.current_plane_key() AS plane_key
    `.execute(this.db);
    return result.rows[0]?.plane_key ?? "neon";
  }

  private async createMessage(opts: {
    tenantId:     string;
    recipientId:  string;
    templateKey:  string;
    subject:      string | null;
    payload:      Record<string, unknown>;
    channels:     string[];
    eventCode:    string;
    dedupKey:     string | null;
    scheduleAt:   string | null;
    priority:     number;
    sourcePlane?: string;
  }): Promise<string> {
    const storedPayload: Record<string, unknown> = {
      ...opts.payload,
      recipient_id: opts.recipientId,
    };

    const row = await sql<{ id: string }>`
      INSERT INTO event.notification_message
        (tenant_id,    plane_key,         event_id,          event_code,
         template_key, template_version,  subject,
         payload,      channels,          priority,
         recipient_count, status,         created_by)
      VALUES
        (${opts.tenantId}::uuid,
         ${opts.sourcePlane ?? "neon"},
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

  private async isDuplicate(
    tenantId:       string,
    dedupKey:       string,
    windowMs:       number,
  ): Promise<boolean> {
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

// ── SMS channel stub ──────────────────────────────────────────────────────────

/**
 * SMS channel handler stub (Phase 5.2).
 * Real implementation: wire to Twilio/AWS SNS/Vonage adapter.
 * Register via channelHandlers.set("sms", createSmsChannelHandler(...)).
 */
export function createSmsChannelHandler(config?: { provider?: string }): {
  send(opts: { channel: string; recipientAddr: string; subject: string | null; payload: Record<string, unknown> }): Promise<{ externalId?: string }>;
  healthCheck?(): Promise<"healthy" | "degraded" | "down">;
} {
  return {
    async send(opts) {
      // Phase 5.2 stub — replace with actual SMS provider SDK call
      void config;
      void opts;
      // Example: await twilioClient.messages.create({ to: opts.recipientAddr, body: opts.payload.body });
      return { externalId: undefined };
    },
    async healthCheck() {
      // Phase 5.2 stub — check SMS provider connectivity
      return "healthy";
    },
  };
}

/**
 * Push notification channel handler stub (Phase 5.2).
 * Real implementation: wire to Firebase FCM / Apple APNs adapter.
 */
export function createPushChannelHandler(config?: { provider?: string }): {
  send(opts: { channel: string; recipientAddr: string; subject: string | null; payload: Record<string, unknown> }): Promise<{ externalId?: string }>;
  healthCheck?(): Promise<"healthy" | "degraded" | "down">;
} {
  return {
    async send(opts) {
      void config;
      void opts;
      // Example: await fcm.send({ token: opts.recipientAddr, notification: { title: opts.subject, body: opts.payload.body } });
      return { externalId: undefined };
    },
    async healthCheck() {
      return "healthy";
    },
  };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createNotificationOrchestrator(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db:      Kysely<any>,
  queue:   Queue<SendNotificationJobData>,
  logger?: JobLogger,
): NotificationOrchestrator {
  return new NotificationOrchestrator(db, queue, logger);
}
