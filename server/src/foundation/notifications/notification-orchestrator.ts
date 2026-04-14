/**
 * NotificationOrchestrator — Phase 5.2
 *
 * Coordinates the full notification dispatch pipeline:
 *   1. Evaluate recipient preferences (PreferenceEvaluator)
 *   2. Resolve recipient channel addresses (RecipientResolver)
 *   3. Apply dedup: skip if duplicate event within dedup_window
 *   4. Create event.notification_message row
 *   5. Enqueue "send" job(s) per channel
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
 *     → Queue: enqueue "send" job
 */

import type { Kysely } from "kysely";
import type { Queue } from "bullmq";
import { SYSTEM_ACTOR_ID, type SendNotificationJobData, type JobLogger } from "../../../framework/runtime/services/jobs/jobs.types.js";

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
  ): Promise<{ channel: string; frequencyCode: string | null }[]> {
    const rows = await this.db
      .selectFrom("master.principal_notification_preference as pnp" as never)
      .select(["pnp.channel", "pnp.frequency_code"] as never[])
      .where("pnp.principal_id" as never, "=", principalId as never)
      .where("pnp.tenant_id" as never, "=", tenantId as never)
      .where("pnp.event_code" as never, "=", eventCode as never)
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
      .select(["p.email", "p.phone"] as never[])
      .where("p.id" as never, "=", principalId as never)
      .where("p.tenant_id" as never, "=", tenantId as never)
      .executeTakeFirst() as { email: string | null; phone: string | null } | undefined;

    const addresses: Record<string, string> = {
      in_app: principalId, // in_app delivery uses principal ID as address
    };

    if (row?.email)  addresses["email"] = row.email;
    if (row?.phone)  addresses["sms"]   = row.phone;

    // Push notification tokens would be loaded from a separate device registry table
    // (Phase 6+ extension). For now, push channel is not resolved.

    return addresses;
  }
}

// ── NotificationOrchestrator ──────────────────────────────────────────────────

export class NotificationOrchestrator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly db:          Kysely<any>;
  private readonly queue:       Queue<SendNotificationJobData>;
  private readonly preferences: PreferenceEvaluator;
  private readonly resolver:    RecipientResolver;
  private readonly logger?:     JobLogger;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db:       Kysely<any>,
    queue:    Queue<SendNotificationJobData>,
    logger?:  JobLogger,
  ) {
    this.db          = db;
    this.queue       = queue;
    this.preferences = new PreferenceEvaluator(db);
    this.resolver    = new RecipientResolver(db);
    this.logger      = logger;
  }

  /**
   * Dispatch a notification through the full pipeline.
   * Idempotent when dedupKey is provided.
   */
  async dispatch(input: DispatchNotificationInput): Promise<DispatchResult> {
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
        : await this.preferences.getChannels(recipientId, input.tenantId, input.eventCode);

      // Resolve addresses
      const addresses = await this.resolver.resolveAddresses(recipientId, input.tenantId);

      // Filter channels to ones where we have an address
      const deliverableChannels = channels.filter((c) => addresses[c.channel]);

      if (deliverableChannels.length === 0) continue;

      // Create notification_message row
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
      });

      messageIds.push(messageId);

      // Enqueue send job
      await this.queue.add(
        "send",
        { messageId, tenantId: input.tenantId },
        {
          delay:    input.scheduleAt
                    ? Math.max(0, new Date(input.scheduleAt).getTime() - Date.now())
                    : 0,
          priority: input.priority ?? 5,
          attempts: 3,
          backoff:  { type: "exponential", delay: 2000 },
        },
      );
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
  }): Promise<string> {
    const row = await this.db
      .insertInto("event.notification_message" as never)
      .values({
        tenant_id:        opts.tenantId,
        recipient_id:     opts.recipientId,
        template_key:     opts.templateKey,
        template_version: 1,
        subject:          opts.subject,
        payload:          JSON.stringify(opts.payload),
        channels:         JSON.stringify(opts.channels),
        event_code:       opts.eventCode,
        dedup_key:        opts.dedupKey,
        schedule_at:      opts.scheduleAt,
        priority:         opts.priority,
        status:           "pending",
        created_by:       SYSTEM_ACTOR_ID,
      } as never)
      .returning("id" as never)
      .executeTakeFirstOrThrow() as { id: string };

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
      .where("nm.dedup_key" as never, "=", dedupKey as never)
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
