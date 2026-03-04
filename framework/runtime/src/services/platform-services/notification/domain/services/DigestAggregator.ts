/**
 * DigestAggregator — Stages and processes digest notifications.
 *
 * Non-immediate notifications are staged. When the digest cron fires,
 * entries are grouped by (recipientId, channel), rendered into a digest
 * template, and enqueued as a single delivery.
 */

import type { DeliverNotificationPayload } from "./NotificationOrchestrator.js";
import type { TemplateRenderer } from "./TemplateRenderer.js";
import type { Logger } from "../../../../../kernel/logger.js";
import type {
  DigestStagingRepo,
  StagingInput,
  DigestStagingEntry,
} from "../../persistence/DigestStagingRepo.js";
import type { NotificationDeliveryRepo } from "../../persistence/NotificationDeliveryRepo.js";
import type { NotificationMessageRepo } from "../../persistence/NotificationMessageRepo.js";
import type { CreateDeliveryInput } from "../models/NotificationDelivery.js";
import type { IChannelRegistry, PreferenceFrequency } from "../types.js";
import type { JobQueue, JobData, JobOptions } from "@athyper/core";

const DIGEST_TEMPLATE_KEY = "notification_digest";

export class DigestAggregator {
  constructor(
    private readonly stagingRepo: DigestStagingRepo,
    private readonly templateRenderer: TemplateRenderer,
    private readonly channelRegistry: IChannelRegistry,
    private readonly messageRepo: NotificationMessageRepo,
    private readonly deliveryRepo: NotificationDeliveryRepo,
    private readonly jobQueue: JobQueue,
    private readonly logger: Logger,
    private readonly config: {
      maxItemsPerDigest: number;
      defaultLocale: string;
    },
  ) {}

  /**
   * Stage a notification for future digest delivery.
   */
  async stage(input: StagingInput): Promise<string> {
    const id = await this.stagingRepo.stage(input);

    this.logger.debug(
      {
        id,
        recipientId: input.recipientId,
        channel: input.channel,
        frequency: input.frequency,
      },
      "[notify:digest] Notification staged for digest",
    );

    return id;
  }

  /**
   * Process all pending digest entries for a given frequency.
   * Groups by (tenantId, principalId, channel) and sends one digest per group.
   */
  async processDigest(
    frequency: PreferenceFrequency,
  ): Promise<{ sent: number; errors: number }> {
    const pending = await this.stagingRepo.getPending(frequency);
    if (pending.length === 0) return { sent: 0, errors: 0 };

    // Group by tenantId + recipientId + channel
    const groups = new Map<string, DigestStagingEntry[]>();
    for (const entry of pending) {
      const key = `${entry.tenantId}:${entry.recipientId}:${entry.channel}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }

    let sent = 0;
    let errors = 0;

    for (const [, entries] of groups) {
      try {
        await this.sendDigest(entries);
        const ids = entries.map((e) => e.id);
        await this.stagingRepo.markDelivered(ids);
        sent++;
      } catch (err) {
        errors++;
        this.logger.warn(
          {
            recipientId: entries[0].recipientId,
            channel: entries[0].channel,
            count: entries.length,
            error: String(err),
          },
          "[notify:digest] Failed to send digest",
        );
      }
    }

    this.logger.info(
      { frequency, groups: groups.size, sent, errors },
      "[notify:digest] Digest processing complete",
    );

    return { sent, errors };
  }

  /**
   * Send a single digest for a group of staged entries.
   */
  private async sendDigest(entries: DigestStagingEntry[]): Promise<void> {
    const first = entries[0];
    const tenantId = first.tenantId;
    const recipientId = first.recipientId;
    const channel = first.channel;

    // Limit items per digest
    const limited = entries.slice(0, this.config.maxItemsPerDigest);

    // Build digest payload
    const digestPayload: Record<string, unknown> = {
      recipientId,
      itemCount: limited.length,
      totalCount: entries.length,
      items: limited.map((e) => ({
        eventCode: e.eventCode,
        subject: e.subject,
        stagedAt: e.stagedAt.toISOString(),
        priority: e.priority,
      })),
      frequency: first.frequency,
    };

    // Render digest template
    const rendered = await this.templateRenderer.render(
      DIGEST_TEMPLATE_KEY,
      channel,
      this.config.defaultLocale,
      digestPayload,
      tenantId,
    );

    // Find adapter
    const adapter = this.channelRegistry.getAdapter(channel);
    if (!adapter) {
      throw new Error(`No adapter for channel: ${channel}`);
    }

    // Create a digest message
    const message = await this.messageRepo.create({
      tenantId,
      eventId: `digest-${first.frequency}-${Date.now()}`,
      eventCode: `notification.digest.${first.frequency}`,
      ruleId: null as any,
      templateKey: DIGEST_TEMPLATE_KEY,
      templateVersion: 1,
      subject:
        rendered?.rendered.subject ??
        `Your ${first.frequency.replace("_", " ")} digest`,
      payload: digestPayload,
      priority: "low",
      recipientCount: 1,
      metadata: { digestEntryCount: entries.length },
    });

    // Create delivery record
    const deliveryInput: CreateDeliveryInput = {
      messageId: message.id,
      tenantId,
      channel,
      providerCode: adapter.providerCode,
      recipientId,
      recipientAddr: recipientId, // Will be resolved by adapter
      maxAttempts: 3,
      metadata: { isDigest: true },
    };

    const [deliveryId] = await this.deliveryRepo.createBatch([deliveryInput]);

    // Enqueue delivery job
    const jobData: JobData<DeliverNotificationPayload> = {
      type: "deliver-notification",
      payload: {
        deliveryId,
        messageId: message.id as string,
        tenantId,
        channel,
        providerCode: adapter.providerCode,
        recipientAddr: recipientId,
        recipientId,
        templateKey: DIGEST_TEMPLATE_KEY,
        templateVersion: 1,
        subject: rendered?.rendered.subject,
        payload: digestPayload,
        priority: "low",
        metadata: { isDigest: true },
      },
    };

    const jobOptions: JobOptions = {
      priority: "low" as any,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
    };

    await this.jobQueue.add(jobData, jobOptions);
  }
}
