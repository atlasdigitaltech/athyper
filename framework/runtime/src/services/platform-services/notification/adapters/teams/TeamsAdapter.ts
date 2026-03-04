/**
 * TeamsAdapter — Microsoft Teams delivery via Power Automate webhook.
 *
 * Sends Adaptive Cards to a Power Automate webhook URL which then
 * routes to the appropriate Teams channel or user.
 *
 * For MVP, this uses the Power Automate webhook approach (simpler setup).
 * Phase 3 adds direct Graph API support for per-user delivery.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
    IChannelAdapter,
    ChannelCode,
    DeliveryRequest,
    DeliveryResult,
} from "../../domain/types.js";

export interface TeamsAdapterConfig {
    webhookUrl: string;
}

export class TeamsAdapter implements IChannelAdapter {
    readonly channelCode: ChannelCode = "TEAMS";
    readonly providerCode = "power_automate";

    constructor(
        private readonly config: TeamsAdapterConfig,
        private readonly logger: Logger,
    ) {}

    async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
        if (!this.config.webhookUrl) {
            return {
                success: false,
                status: "failed",
                errorCategory: "auth",
                error: "Teams webhook URL not configured",
            };
        }

        try {
            const card = this.buildAdaptiveCard(request);

            // Teams threading: if replying to an existing thread, add replyToId
            const teamsActivityId = request.metadata?.teamsActivityId as string | undefined;
            if (teamsActivityId) {
                (card as Record<string, unknown>).replyToId = teamsActivityId;
            }

            const response = await fetch(this.config.webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(card),
            });

            if (response.ok) {
                // Try to extract activityId from response for future threading
                let activityId: string | undefined;
                try {
                    const responseBody = (await response.json()) as { id?: string };
                    activityId = responseBody.id;
                } catch {
                    // Response may not be JSON — that's fine
                }

                this.logger.info(
                    { deliveryId: request.deliveryId, activityId },
                    "[notify:teams] Adaptive card sent",
                );

                return {
                    success: true,
                    status: "sent",
                    externalId: activityId ?? request.deliveryId,
                    metadata: activityId ? { activityId } : undefined,
                };
            }

            const errorBody = await response.text();
            const statusCode = response.status;

            this.logger.warn(
                { deliveryId: request.deliveryId, statusCode, error: errorBody.substring(0, 500) },
                "[notify:teams] Send failed",
            );

            if (statusCode === 429) {
                return { success: false, status: "failed", errorCategory: "rate_limit", error: `Rate limited (429)` };
            }
            if (statusCode >= 500) {
                return { success: false, status: "failed", errorCategory: "transient", error: `Server error (${statusCode})` };
            }

            return { success: false, status: "failed", errorCategory: "permanent", error: `Error (${statusCode}): ${errorBody.substring(0, 200)}` };
        } catch (err) {
            this.logger.error(
                { error: String(err), deliveryId: request.deliveryId },
                "[notify:teams] Network error",
            );
            return { success: false, status: "failed", errorCategory: "transient", error: String(err) };
        }
    }

    async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
        const errors: string[] = [];
        if (!this.config.webhookUrl) {
            errors.push("webhookUrl is required");
        }
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        if (!this.config.webhookUrl) {
            return { healthy: false, message: "Webhook URL not configured" };
        }
        return { healthy: true };
    }

    /**
     * Build a Teams Adaptive Card payload.
     * If the template provides bodyJson (pre-built card), use it directly.
     * Otherwise, build a simple card from subject + bodyText.
     */
    private buildAdaptiveCard(request: DeliveryRequest): Record<string, unknown> {
        // If template provides a complete Adaptive Card JSON, use it
        if (request.bodyJson && request.bodyJson.type === "AdaptiveCard") {
            return {
                type: "message",
                attachments: [
                    {
                        contentType: "application/vnd.microsoft.card.adaptive",
                        content: request.bodyJson,
                    },
                ],
            };
        }

        // Build a simple card from subject + body text
        const body: unknown[] = [];

        if (request.subject) {
            body.push({
                type: "TextBlock",
                text: request.subject,
                weight: "bolder",
                size: "medium",
            });
        }

        if (request.bodyText) {
            body.push({
                type: "TextBlock",
                text: request.bodyText,
                wrap: true,
            });
        }

        // Add action URL if present
        const actions: unknown[] = [];
        const actionUrl = request.metadata?.actionUrl as string | undefined;
        if (actionUrl) {
            actions.push({
                type: "Action.OpenUrl",
                title: "View Details",
                url: actionUrl,
            });
        }

        const card = {
            type: "AdaptiveCard",
            version: "1.4",
            body,
            ...(actions.length > 0 ? { actions } : {}),
        };

        return {
            type: "message",
            attachments: [
                {
                    contentType: "application/vnd.microsoft.card.adaptive",
                    content: card,
                },
            ],
        };
    }
}
