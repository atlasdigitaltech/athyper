/**
 * NotificationOrchestrator — Core pipeline: Event → Plan → Deliver → Track.
 *
 * Subscribes to domain events via the EventBus, matches them against
 * notification rules, resolves recipients, checks preferences/dedup,
 * creates message + delivery records, and enqueues BullMQ delivery jobs.
 *
 * Phase 2 additions:
 * - Quiet hours deferral (delay in JobOptions)
 * - Digest staging (non-immediate notifications)
 * - DLQ integration (permanent failures → dead-letter queue)
 * - Email/Teams threading (Redis-backed thread root tracking)
 * - Explainability trace collection (stored in message metadata)
 */

import { ExplainabilityService } from "./ExplainabilityService.js";

import type { DeduplicationService } from "./DeduplicationService.js";
import type { DigestAggregator } from "./DigestAggregator.js";
import type { DlqManager } from "./DlqManager.js";
import type { PreferenceEvaluator } from "./PreferenceEvaluator.js";
import type {
  RecipientResolver,
  ResolvedRecipient,
} from "./RecipientResolver.js";
import type {
  RuleEngine,
  EventContext,
  DeliveryPlanItem,
} from "./RuleEngine.js";
import type { TemplateRenderer } from "./TemplateRenderer.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationDeliveryRepo } from "../../persistence/NotificationDeliveryRepo.js";
import type { NotificationMessageRepo } from "../../persistence/NotificationMessageRepo.js";
import type { CreateDeliveryInput } from "../models/NotificationDelivery.js";
import type {
  ChannelCode,
  DeliveryId,
  ExplainStep,
  IChannelRegistry,
  MessageId,
  NotificationPriority,
} from "../types.js";
import type {
  DomainEvent,
  EventBus,
  JobData,
  JobOptions,
  JobQueue,
} from "@athyper/core";
import type Redis from "ioredis";

// ─── Job Payload Types ──────────────────────────────────────────────

export interface PlanNotificationPayload {
  tenantId: string;
  eventId: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  lifecycleState?: string;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface DeliverNotificationPayload {
  deliveryId: string;
  messageId: string;
  tenantId: string;
  channel: string;
  providerCode: string;
  recipientAddr: string;
  recipientId?: string;
  templateKey: string;
  templateVersion: number;
  subject?: string;
  payload: Record<string, unknown>;
  priority: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProcessCallbackPayload {
  provider: string;
  externalId: string;
  eventType: string;
  timestamp: string;
  rawPayload: Record<string, unknown>;
}

export interface CleanupExpiredPayload {
  tenantId?: string;
  messageDays: number;
  deliveryDays: number;
}

// ─── Priority Mapping ───────────────────────────────────────────────

const PRIORITY_MAP: Record<string, number> = {
  urgent: 1,
  high: 5,
  normal: 10,
  low: 20,
};

// ─── Thread Root Key Helpers ────────────────────────────────────────

const THREAD_ROOT_PREFIX = "notify:thread:";
const THREAD_ROOT_TTL = 30 * 24 * 60 * 60; // 30 days

function threadRootKey(
  tenantId: string,
  entityType: string,
  entityId: string,
  channel: string,
): string {
  return `${THREAD_ROOT_PREFIX}${tenantId}:${entityType}:${entityId}:${channel}`;
}

// ─── Orchestrator ───────────────────────────────────────────────────

export class NotificationOrchestrator {
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly ruleEngine: RuleEngine,
    private readonly recipientResolver: RecipientResolver,
    private readonly preferenceEvaluator: PreferenceEvaluator,
    private readonly templateRenderer: TemplateRenderer,
    private readonly dedupService: DeduplicationService,
    private readonly channelRegistry: IChannelRegistry,
    private readonly messageRepo: NotificationMessageRepo,
    private readonly deliveryRepo: NotificationDeliveryRepo,
    private readonly jobQueue: JobQueue,
    private readonly logger: Logger,
    private readonly config: {
      maxRetries: number;
      retryBackoffMs: number;
      defaultPriority: string;
      defaultLocale: string;
    },
    // Phase 2 optional dependencies
    private readonly redis?: Redis,
    private readonly dlqManager?: DlqManager,
    private readonly digestAggregator?: DigestAggregator,
  ) {}

  // ─── Event Subscription ─────────────────────────────────────────

  /**
   * Subscribe to all domain events via wildcard.
   * We use a catch-all approach — the RuleEngine filters which events have rules.
   */
  subscribeToEvents(eventBus: EventBus, eventTypes: string[]): void {
    for (const eventType of eventTypes) {
      const unsub = eventBus.subscribe(
        eventType,
        this.handleDomainEvent.bind(this),
      );
      this.unsubscribers.push(unsub);
    }

    this.logger.info(
      { eventTypes: eventTypes.length },
      "[notify:orchestrator] Subscribed to domain events",
    );
  }

  /**
   * Handle an incoming domain event — enqueue a planning job.
   * We offload to a BullMQ job to ensure at-least-once processing
   * even if this handler crashes mid-flight.
   */
  private async handleDomainEvent(event: DomainEvent): Promise<void> {
    try {
      const jobData: JobData<PlanNotificationPayload> = {
        type: "plan-notification",
        payload: {
          tenantId: (event.metadata?.tenantId as string) ?? "",
          eventId: event.eventId,
          eventType: event.eventType,
          entityType: event.aggregateType,
          entityId: event.aggregateId,
          payload: event.payload as Record<string, unknown>,
          metadata: event.metadata,
        },
      };

      const options: JobOptions = {
        priority: "normal",
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: true,
      };

      await this.jobQueue.add(jobData, options);

      this.logger.debug(
        { eventType: event.eventType, eventId: event.eventId },
        "[notify:orchestrator] Planning job enqueued",
      );
    } catch (err) {
      this.logger.error(
        {
          error: String(err),
          eventType: event.eventType,
          eventId: event.eventId,
        },
        "[notify:orchestrator] Failed to enqueue planning job",
      );
    }
  }

  // ─── Planning Phase ─────────────────────────────────────────────

  /**
   * Plan notification delivery for a domain event.
   * Called by the planNotification worker.
   */
  async planNotification(input: PlanNotificationPayload): Promise<void> {
    const eventContext: EventContext = {
      tenantId: input.tenantId,
      eventId: input.eventId,
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      lifecycleState: input.lifecycleState,
      payload: input.payload,
      metadata: input.metadata,
    };

    // 1. Match event against notification rules
    const plans = await this.ruleEngine.evaluate(eventContext);

    if (plans.length === 0) return;

    // 2. Process each matched rule
    for (const plan of plans) {
      await this.processPlanItem(input, eventContext, plan);
    }
  }

  private async processPlanItem(
    input: PlanNotificationPayload,
    _eventContext: EventContext,
    plan: DeliveryPlanItem,
  ): Promise<void> {
    const explainSteps: ExplainStep[] = [];

    // Trace: rule match
    explainSteps.push(
      ExplainabilityService.createStep(
        "rule_match",
        { eventType: input.eventType, ruleCode: plan.rule.code },
        { channels: plan.channels, templateKey: plan.templateKey },
        "passed",
      ),
    );

    // 1. Resolve recipients
    const recipients = await this.recipientResolver.resolve(
      input.tenantId,
      plan.recipientSpecs,
      input.payload,
    );

    explainSteps.push(
      ExplainabilityService.createStep(
        "recipient_resolution",
        { recipientSpecs: plan.recipientSpecs },
        { recipientCount: recipients.length },
        recipients.length > 0 ? "passed" : "blocked",
        recipients.length === 0 ? "No recipients resolved" : undefined,
      ),
    );

    if (recipients.length === 0) {
      this.logger.debug(
        { ruleCode: plan.rule.code, eventId: input.eventId },
        "[notify:orchestrator] No recipients resolved for rule",
      );
      return;
    }

    // 2. Resolve template to get version info
    const locale =
      (input.metadata?.locale as string) ?? this.config.defaultLocale;
    const firstChannel = plan.channels[0] as ChannelCode;
    const templateResult = await this.templateRenderer.render(
      plan.templateKey,
      firstChannel,
      locale,
      input.payload,
      input.tenantId,
    );

    const templateVersion = templateResult?.template.version ?? 1;
    const subject = templateResult?.rendered.subject;

    // 3. Create message record (store explainTrace in metadata)
    const messageMetadata = {
      ...input.metadata,
      explainTrace: explainSteps,
    };

    const message = await this.messageRepo.create({
      tenantId: input.tenantId,
      eventId: input.eventId,
      eventCode: input.eventType,
      ruleId: plan.rule.id,
      templateKey: plan.templateKey,
      templateVersion,
      subject: subject ?? null,
      payload: input.payload,
      priority: plan.priority as NotificationPriority,
      recipientCount: 0,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: (input.metadata?.correlationId as string) ?? undefined,
      metadata: messageMetadata,
    });

    // 4. For each recipient x channel, check preferences + dedup, create deliveries
    const deliveryInputs: CreateDeliveryInput[] = [];
    const deliveryDelays: Map<number, number> = new Map(); // index -> delay ms

    for (const recipient of recipients) {
      for (const channel of plan.channels) {
        // Check preference
        const prefResult = await this.preferenceEvaluator.check({
          tenantId: input.tenantId,
          principalId: recipient.principalId,
          eventCode: input.eventType,
          channel: channel as ChannelCode,
          recipientAddr: this.getRecipientAddr(
            recipient,
            channel as ChannelCode,
          ),
          priority: plan.priority,
        });

        if (!prefResult.allowed) {
          explainSteps.push(
            ExplainabilityService.createStep(
              "preference_check",
              { recipientId: recipient.principalId, channel },
              { reason: prefResult.reason },
              "blocked",
              prefResult.reason,
            ),
          );
          this.logger.debug(
            {
              recipientId: recipient.principalId,
              channel,
              reason: prefResult.reason,
            },
            "[notify:orchestrator] Delivery blocked by preference",
          );
          continue;
        }

        // Quiet hours deferral — delivery is allowed but delayed
        if (prefResult.deferUntil) {
          explainSteps.push(
            ExplainabilityService.createStep(
              "quiet_hours",
              { recipientId: recipient.principalId, channel },
              { deferUntil: prefResult.deferUntil.toISOString() },
              "deferred",
              "Quiet hours — delivery deferred",
            ),
          );
        }

        // Digest staging — non-immediate frequency
        if (
          prefResult.frequency &&
          prefResult.frequency !== "immediate" &&
          this.digestAggregator
        ) {
          explainSteps.push(
            ExplainabilityService.createStep(
              "digest_staging",
              {
                recipientId: recipient.principalId,
                channel,
                frequency: prefResult.frequency,
              },
              { staged: true },
              "staged",
              `Staged for ${prefResult.frequency}`,
            ),
          );

          await this.digestAggregator.stage({
            tenantId: input.tenantId,
            recipientId: recipient.principalId,
            channel: channel as ChannelCode,
            frequency: prefResult.frequency,
            messageId: message.id as string,
            eventCode: input.eventType,
            subject,
            payload: input.payload,
            templateKey: plan.templateKey,
            priority: plan.priority,
            metadata: input.metadata,
          });

          continue; // Don't create immediate delivery
        }

        // Check dedup
        const isDup = await this.dedupService.isDuplicate(
          input.tenantId,
          input.eventType,
          recipient.principalId,
          channel,
          plan.dedupWindowMs,
        );

        if (isDup) {
          explainSteps.push(
            ExplainabilityService.createStep(
              "dedup_check",
              { recipientId: recipient.principalId, channel },
              { duplicate: true },
              "blocked",
              "Duplicate within dedup window",
            ),
          );
          continue;
        }

        explainSteps.push(
          ExplainabilityService.createStep(
            "preference_check",
            { recipientId: recipient.principalId, channel },
            { allowed: true, frequency: prefResult.frequency },
            "passed",
          ),
        );

        // Find adapter to get provider code
        const adapter = this.channelRegistry.getAdapter(channel as ChannelCode);
        if (!adapter) {
          this.logger.warn(
            { channel },
            "[notify:orchestrator] No adapter registered for channel",
          );
          continue;
        }

        // Build threading metadata
        const deliveryMetadata: Record<string, unknown> = {
          displayName: recipient.displayName,
        };

        // Thread root tracking for email/teams
        if (this.redis && input.entityType && input.entityId) {
          const trKey = threadRootKey(
            input.tenantId,
            input.entityType,
            input.entityId,
            channel,
          );
          try {
            const existingRoot = await this.redis.get(trKey);
            if (existingRoot) {
              deliveryMetadata.threadRootMessageId = existingRoot;
            }
            deliveryMetadata.entityType = input.entityType;
            deliveryMetadata.entityId = input.entityId;
          } catch {
            // Redis failure shouldn't block delivery
          }
        }

        const idx = deliveryInputs.length;
        deliveryInputs.push({
          messageId: message.id,
          tenantId: input.tenantId,
          channel: channel as ChannelCode,
          providerCode: adapter.providerCode,
          recipientId: recipient.principalId,
          recipientAddr: this.getRecipientAddr(
            recipient,
            channel as ChannelCode,
          ),
          maxAttempts: this.config.maxRetries,
          metadata: deliveryMetadata,
        });

        // Store delay for quiet hours deferred deliveries
        if (prefResult.deferUntil) {
          const delayMs = prefResult.deferUntil.getTime() - Date.now();
          if (delayMs > 0) {
            deliveryDelays.set(idx, delayMs);
          }
        }
      }
    }

    // Update explainTrace in message metadata
    await this.messageRepo.update(input.tenantId, message.id, {
      metadata: { ...messageMetadata, explainTrace: explainSteps },
    });

    if (deliveryInputs.length === 0) {
      await this.messageRepo.update(input.tenantId, message.id, {
        status: "completed",
        completedAt: new Date(),
      });
      return;
    }

    // 5. Batch-insert delivery rows
    const deliveryIds = await this.deliveryRepo.createBatch(deliveryInputs);

    // Update message status
    await this.messageRepo.update(input.tenantId, message.id, {
      status: "delivering",
    });

    // 6. Enqueue delivery jobs
    const jobs = deliveryIds.map((deliveryId, idx) => {
      const jobOptions: JobOptions = {
        priority: plan.priority as any,
        attempts: this.config.maxRetries,
        backoff: { type: "exponential", delay: this.config.retryBackoffMs },
        removeOnComplete: true,
      };

      // Add delay for quiet hours deferred deliveries
      const delayMs = deliveryDelays.get(idx);
      if (delayMs) {
        (jobOptions as any).delay = delayMs;
      }

      return {
        data: {
          type: "deliver-notification",
          payload: {
            deliveryId,
            messageId: message.id,
            tenantId: input.tenantId,
            channel: deliveryInputs[idx].channel,
            providerCode: deliveryInputs[idx].providerCode,
            recipientAddr: deliveryInputs[idx].recipientAddr,
            recipientId: deliveryInputs[idx].recipientId,
            templateKey: plan.templateKey,
            templateVersion,
            subject,
            payload: input.payload,
            priority: plan.priority,
            correlationId:
              (input.metadata?.correlationId as string) ?? undefined,
            metadata: deliveryInputs[idx].metadata,
          } satisfies DeliverNotificationPayload,
        } satisfies JobData<DeliverNotificationPayload>,
        options: jobOptions,
      };
    });

    await this.jobQueue.addBulk(jobs);

    this.logger.info(
      {
        messageId: message.id,
        ruleCode: plan.rule.code,
        deliveryCount: deliveryIds.length,
        channels: plan.channels,
      },
      "[notify:orchestrator] Delivery jobs enqueued",
    );
  }

  // ─── Delivery Phase ─────────────────────────────────────────────

  /**
   * Execute a single delivery. Called by the deliverNotification worker.
   */
  async executeDelivery(input: DeliverNotificationPayload): Promise<void> {
    const delivery = await this.deliveryRepo.getById(
      input.tenantId,
      input.deliveryId as DeliveryId,
    );

    if (!delivery) {
      this.logger.warn(
        { deliveryId: input.deliveryId },
        "[notify:orchestrator] Delivery row not found",
      );
      return;
    }

    // Mark as queued
    await this.deliveryRepo.update(
      input.tenantId,
      input.deliveryId as DeliveryId,
      {
        status: "queued",
        attemptCount: delivery.attemptCount + 1,
      },
    );

    // Resolve and render template
    const locale =
      (input.metadata?.locale as string) ?? this.config.defaultLocale;
    const templateResult = await this.templateRenderer.render(
      input.templateKey,
      input.channel as ChannelCode,
      locale,
      input.payload,
      input.tenantId,
    );

    // Build delivery request
    const deliveryRequest = {
      deliveryId: input.deliveryId,
      messageId: input.messageId,
      tenantId: input.tenantId,
      channel: input.channel as ChannelCode,
      recipientAddr: input.recipientAddr,
      recipientId: input.recipientId,
      subject: templateResult?.rendered.subject ?? input.subject,
      bodyText: templateResult?.rendered.bodyText,
      bodyHtml: templateResult?.rendered.bodyHtml,
      bodyJson: templateResult?.rendered.bodyJson,
      correlationId: input.correlationId,
      metadata: input.metadata,
    };

    // Get adapter and deliver
    const adapter = this.channelRegistry.getAdapter(
      input.channel as ChannelCode,
      input.providerCode,
    );

    if (!adapter) {
      await this.deliveryRepo.update(
        input.tenantId,
        input.deliveryId as DeliveryId,
        {
          status: "failed",
          lastError: `No adapter for ${input.channel}/${input.providerCode}`,
          errorCategory: "permanent",
        },
      );
      await this.messageRepo.incrementFailedCount(
        input.tenantId,
        input.messageId as MessageId,
      );
      await this.checkMessageCompletion(
        input.tenantId,
        input.messageId as MessageId,
      );
      return;
    }

    const result = await adapter.deliver(deliveryRequest);

    if (result.success) {
      await this.deliveryRepo.update(
        input.tenantId,
        input.deliveryId as DeliveryId,
        {
          status: "sent",
          externalId: result.externalId ?? undefined,
          sentAt: new Date(),
        },
      );
      await this.messageRepo.incrementDeliveredCount(
        input.tenantId,
        input.messageId as MessageId,
      );

      // Set thread root on first successful delivery for an entity
      if (
        this.redis &&
        input.metadata?.entityType &&
        input.metadata?.entityId
      ) {
        const trKey = threadRootKey(
          input.tenantId,
          input.metadata.entityType as string,
          input.metadata.entityId as string,
          input.channel,
        );
        try {
          // NX = only set if not exists (first delivery becomes the root)
          await this.redis.set(
            trKey,
            input.deliveryId,
            "EX",
            THREAD_ROOT_TTL,
            "NX",
          );
        } catch {
          // Non-critical
        }
      }
    } else {
      const isFinalAttempt = delivery.attemptCount + 1 >= delivery.maxAttempts;
      const isPermanent =
        result.errorCategory === "permanent" || result.errorCategory === "auth";

      if (isPermanent || isFinalAttempt) {
        await this.deliveryRepo.update(
          input.tenantId,
          input.deliveryId as DeliveryId,
          {
            status: "failed",
            lastError: result.error ?? "Unknown error",
            errorCategory: result.errorCategory ?? "permanent",
          },
        );
        await this.messageRepo.incrementFailedCount(
          input.tenantId,
          input.messageId as MessageId,
        );

        // Move to DLQ on permanent/final failure
        if (this.dlqManager) {
          try {
            await this.dlqManager.moveToDlq(
              input,
              result.error ?? "Unknown error",
              result.errorCategory ?? "permanent",
              delivery.attemptCount + 1,
            );
          } catch (dlqErr) {
            this.logger.warn(
              { error: String(dlqErr), deliveryId: input.deliveryId },
              "[notify:orchestrator] Failed to move delivery to DLQ",
            );
          }
        }
      } else {
        // Transient failure — the job will be retried by BullMQ
        await this.deliveryRepo.update(
          input.tenantId,
          input.deliveryId as DeliveryId,
          {
            status: "pending",
            lastError: result.error ?? "Transient error",
            errorCategory: result.errorCategory ?? "transient",
          },
        );
        throw new Error(`Transient delivery failure: ${result.error}`);
      }
    }

    await this.checkMessageCompletion(
      input.tenantId,
      input.messageId as MessageId,
    );
  }

  // ─── Message Completion Check ───────────────────────────────────

  /**
   * Check if all deliveries for a message are complete and update message status.
   */
  private async checkMessageCompletion(
    tenantId: string,
    messageId: MessageId,
  ): Promise<void> {
    const counts = await this.deliveryRepo.countByStatus(tenantId, messageId);

    const pending = (counts.pending ?? 0) + (counts.queued ?? 0);
    if (pending > 0) return; // Still in progress

    const sent = (counts.sent ?? 0) + (counts.delivered ?? 0);
    const failed = (counts.failed ?? 0) + (counts.bounced ?? 0);

    let status: string;
    if (failed === 0) {
      status = "completed";
    } else if (sent === 0) {
      status = "failed";
    } else {
      status = "partial";
    }

    await this.messageRepo.update(tenantId, messageId, {
      status: status as any,
      completedAt: new Date(),
    });
  }

  // ─── Callback Processing ────────────────────────────────────────

  /**
   * Process a provider callback (e.g., SendGrid event webhook).
   * Called by processCallback worker.
   */
  async processCallback(input: ProcessCallbackPayload): Promise<void> {
    const delivery = await this.deliveryRepo.getByExternalId(input.externalId);
    if (!delivery) {
      this.logger.debug(
        { externalId: input.externalId, provider: input.provider },
        "[notify:orchestrator] Callback for unknown delivery — ignoring",
      );
      return;
    }

    const now = new Date(input.timestamp);

    switch (input.eventType) {
      case "delivered":
        await this.deliveryRepo.update(delivery.tenantId, delivery.id, {
          status: "delivered",
          deliveredAt: now,
        });
        break;

      case "opened":
      case "open":
        await this.deliveryRepo.update(delivery.tenantId, delivery.id, {
          openedAt: now,
        });
        break;

      case "clicked":
      case "click":
        await this.deliveryRepo.update(delivery.tenantId, delivery.id, {
          clickedAt: now,
        });
        break;

      case "bounced":
      case "bounce":
        await this.deliveryRepo.update(delivery.tenantId, delivery.id, {
          status: "bounced",
          bouncedAt: now,
          lastError: (input.rawPayload.reason as string) ?? "Bounced",
        });
        await this.messageRepo.incrementFailedCount(
          delivery.tenantId,
          delivery.messageId,
        );
        await this.checkMessageCompletion(
          delivery.tenantId,
          delivery.messageId,
        );
        break;

      case "dropped":
      case "failed":
        await this.deliveryRepo.update(delivery.tenantId, delivery.id, {
          status: "failed",
          lastError:
            (input.rawPayload.reason as string) ?? "Dropped by provider",
          errorCategory: "permanent",
        });
        await this.messageRepo.incrementFailedCount(
          delivery.tenantId,
          delivery.messageId,
        );
        await this.checkMessageCompletion(
          delivery.tenantId,
          delivery.messageId,
        );
        break;

      default:
        this.logger.debug(
          { eventType: input.eventType, provider: input.provider },
          "[notify:orchestrator] Unhandled callback event type",
        );
    }
  }

  // ─── Health & Lifecycle ─────────────────────────────────────────

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    const statuses = await this.channelRegistry.getAllHealthStatuses();
    const unhealthy = Object.entries(statuses)
      .filter(([, s]) => !s.healthy)
      .map(([key]) => key);

    if (unhealthy.length > 0) {
      return {
        healthy: false,
        message: `Unhealthy adapters: ${unhealthy.join(", ")}`,
      };
    }

    return { healthy: true };
  }

  async drain(): Promise<void> {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.logger.info(
      "[notify:orchestrator] Drained — unsubscribed from all events",
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────

  /**
   * Get the appropriate recipient address for a channel.
   * For email/teams, use email. For in-app, use principalId.
   * For whatsapp, use phone number (falls back to email for Teams-style routing).
   */
  private getRecipientAddr(
    recipient: ResolvedRecipient,
    channel: ChannelCode,
  ): string {
    switch (channel) {
      case "IN_APP":
        return recipient.principalId;
      case "WHATSAPP":
        return recipient.phone ?? recipient.email ?? recipient.principalId;
      case "EMAIL":
      case "TEAMS":
      default:
        return recipient.email ?? recipient.principalId;
    }
  }
}
