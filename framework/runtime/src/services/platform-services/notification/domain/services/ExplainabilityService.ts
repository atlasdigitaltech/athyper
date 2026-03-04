/**
 * ExplainabilityService — "Why did I receive this?" trace reader.
 *
 * Reads the explain trace stored in message metadata during orchestration,
 * combines with delivery history for a complete picture.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type { NotificationDeliveryRepo } from "../../persistence/NotificationDeliveryRepo.js";
import type { NotificationMessageRepo } from "../../persistence/NotificationMessageRepo.js";
import type {
    NotificationExplainTrace,
    ExplainStep,
    ExplainPhase,
    MessageId,
} from "../types.js";

export class ExplainabilityService {
    constructor(
        private readonly messageRepo: NotificationMessageRepo,
        private readonly deliveryRepo: NotificationDeliveryRepo,
        private readonly logger: Logger,
    ) {}

    /**
     * Get the full explain trace for a notification message.
     */
    async explain(tenantId: string, messageId: string): Promise<NotificationExplainTrace | null> {
        const message = await this.messageRepo.getById(tenantId, messageId as MessageId);
        if (!message) return null;

        // Retrieve stored trace from message metadata
        const storedTrace = (message.metadata as any)?.explainTrace as ExplainStep[] | undefined;

        // Get delivery records for the delivery phase
        const deliveries = await this.deliveryRepo.listByMessageId(tenantId, messageId as MessageId);

        const steps: ExplainStep[] = [
            ...(storedTrace ?? []),
        ];

        // Add delivery outcome steps
        for (const delivery of deliveries) {
            steps.push({
                phase: "delivery" as ExplainPhase,
                timestamp: (delivery.sentAt ?? delivery.createdAt).toISOString(),
                input: {
                    channel: delivery.channel,
                    recipientAddr: delivery.recipientAddr,
                    providerCode: delivery.providerCode,
                },
                output: {
                    status: delivery.status,
                    externalId: delivery.externalId,
                    attemptCount: delivery.attemptCount,
                    lastError: delivery.lastError,
                },
                decision: delivery.status === "sent" || delivery.status === "delivered"
                    ? "passed"
                    : delivery.status === "pending" || delivery.status === "queued"
                        ? "deferred"
                        : "blocked",
                reason: delivery.lastError ?? undefined,
            });
        }

        return {
            messageId,
            eventCode: message.eventCode,
            eventId: message.eventId,
            timestamp: message.createdAt.toISOString(),
            steps,
        };
    }

    /**
     * Create an explain step — static helper for the orchestrator.
     */
    static createStep(
        phase: ExplainPhase,
        input: Record<string, unknown>,
        output: Record<string, unknown>,
        decision: "passed" | "blocked" | "deferred" | "staged",
        reason?: string,
    ): ExplainStep {
        return {
            phase,
            timestamp: new Date().toISOString(),
            input,
            output,
            decision,
            reason,
        };
    }
}
