/**
 * InAppAdapter — Writes notifications to the existing ui.notification table.
 *
 * This adapter is always available (no external dependencies).
 * It creates in-app notification feed entries that users see in the UI.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  IChannelAdapter,
  ChannelCode,
  DeliveryRequest,
  DeliveryResult,
} from "../../domain/types.js";
import type { InAppNotificationRepo } from "../../persistence/InAppNotificationRepo.js";

export class InAppAdapter implements IChannelAdapter {
  readonly channelCode: ChannelCode = "IN_APP";
  readonly providerCode = "internal";

  constructor(
    private readonly inAppRepo: InAppNotificationRepo,
    private readonly logger: Logger,
  ) {}

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    try {
      if (!request.recipientId) {
        return {
          success: false,
          status: "failed",
          errorCategory: "permanent",
          error: "recipientId is required for in-app notifications",
        };
      }

      await this.inAppRepo.create({
        tenantId: request.tenantId,
        recipientId: request.recipientId,
        channel: "in_app",
        category: request.metadata?.category as string | undefined,
        priority:
          (request.metadata?.priority as string | undefined) ?? "normal",
        title: request.subject ?? "Notification",
        body: request.bodyText,
        icon: request.metadata?.icon as string | undefined,
        actionUrl: request.metadata?.actionUrl as string | undefined,
        entityType: request.metadata?.entityType as string | undefined,
        entityId: request.metadata?.entityId as string | undefined,
        metadata: {
          messageId: request.messageId,
          deliveryId: request.deliveryId,
          correlationId: request.correlationId,
        },
        createdByService: "system",
      });

      return {
        success: true,
        status: "sent",
        externalId: request.deliveryId, // Use deliveryId as external reference
      };
    } catch (err) {
      this.logger.error(
        { error: String(err), deliveryId: request.deliveryId },
        "[notify:inapp] Failed to create in-app notification",
      );
      return {
        success: false,
        status: "failed",
        errorCategory: "transient",
        error: String(err),
      };
    }
  }

  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    return { valid: true };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return { healthy: true, message: "In-app adapter always healthy" };
  }
}
