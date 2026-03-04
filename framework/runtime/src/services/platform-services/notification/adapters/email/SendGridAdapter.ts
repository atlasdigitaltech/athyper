/**
 * SendGridAdapter — Email delivery via SendGrid v3 API.
 *
 * Credentials are resolved from environment variables (apiKeyRef in config).
 * Supports HTML + plain text, attachments via presigned URLs.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
    IChannelAdapter,
    ChannelCode,
    DeliveryRequest,
    DeliveryResult,
} from "../../domain/types.js";

export interface SendGridConfig {
    apiKeyRef: string;      // env var name holding the API key
    fromAddress: string;
    fromName?: string;
}

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

export class SendGridAdapter implements IChannelAdapter {
    readonly channelCode: ChannelCode = "EMAIL";
    readonly providerCode = "sendgrid_primary";
    private apiKey: string | undefined;

    constructor(
        private readonly config: SendGridConfig,
        private readonly logger: Logger,
    ) {
        this.apiKey = process.env[config.apiKeyRef];
    }

    async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
        if (!this.apiKey) {
            return {
                success: false,
                status: "failed",
                errorCategory: "auth",
                error: `SendGrid API key not found in env var: ${this.config.apiKeyRef}`,
            };
        }

        try {
            const payload = this.buildPayload(request);

            const response = await fetch(SENDGRID_API_URL, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });

            if (response.ok) {
                // SendGrid returns message ID in x-message-id header
                const messageId = response.headers.get("x-message-id") ?? undefined;

                this.logger.info(
                    {
                        deliveryId: request.deliveryId,
                        to: this.redactEmail(request.recipientAddr),
                        messageId,
                    },
                    "[notify:sendgrid] Email sent",
                );

                return {
                    success: true,
                    status: "sent",
                    externalId: messageId,
                };
            }

            const errorBody = await response.text();
            const statusCode = response.status;

            this.logger.warn(
                {
                    deliveryId: request.deliveryId,
                    statusCode,
                    error: errorBody.substring(0, 500),
                },
                "[notify:sendgrid] Send failed",
            );

            // Classify error
            if (statusCode === 429) {
                return {
                    success: false,
                    status: "failed",
                    errorCategory: "rate_limit",
                    error: `Rate limited (429)`,
                };
            }

            if (statusCode === 401 || statusCode === 403) {
                return {
                    success: false,
                    status: "failed",
                    errorCategory: "auth",
                    error: `Auth error (${statusCode})`,
                };
            }

            if (statusCode >= 500) {
                return {
                    success: false,
                    status: "failed",
                    errorCategory: "transient",
                    error: `Server error (${statusCode})`,
                };
            }

            // 4xx (except 429/401/403) = permanent
            return {
                success: false,
                status: "failed",
                errorCategory: "permanent",
                error: `Client error (${statusCode}): ${errorBody.substring(0, 200)}`,
            };
        } catch (err) {
            this.logger.error(
                { error: String(err), deliveryId: request.deliveryId },
                "[notify:sendgrid] Network error",
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
        const errors: string[] = [];
        if (!this.apiKey) {
            errors.push(`API key env var '${this.config.apiKeyRef}' is not set`);
        }
        if (!this.config.fromAddress) {
            errors.push("fromAddress is required");
        }
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        if (!this.apiKey) {
            return { healthy: false, message: "API key not configured" };
        }
        return { healthy: true };
    }

    private buildPayload(request: DeliveryRequest): Record<string, unknown> {
        const content: Array<{ type: string; value: string }> = [];

        if (request.bodyText) {
            content.push({ type: "text/plain", value: request.bodyText });
        }
        if (request.bodyHtml) {
            content.push({ type: "text/html", value: request.bodyHtml });
        }

        // Fallback if no content
        if (content.length === 0) {
            content.push({ type: "text/plain", value: "(No content)" });
        }

        const payload: Record<string, unknown> = {
            personalizations: [
                {
                    to: [{ email: request.recipientAddr }],
                },
            ],
            from: {
                email: this.config.fromAddress,
                name: this.config.fromName,
            },
            subject: request.subject ?? "(No subject)",
            content,
        };

        // Custom headers for tracking
        const headers: Record<string, string> = {
            "X-Notification-Id": request.messageId,
            "X-Delivery-Id": request.deliveryId,
        };
        if (request.correlationId) {
            headers["X-Correlation-Id"] = request.correlationId;
        }

        // Email threading: Message-ID, In-Reply-To, References
        headers["Message-ID"] = `<${request.deliveryId}@notifications.athyper.com>`;

        const entityType = request.metadata?.entityType as string | undefined;
        const entityId = request.metadata?.entityId as string | undefined;
        if (entityType && entityId) {
            const threadRef = `<thread-${entityType}-${entityId}@notifications.athyper.com>`;
            const threadRoot = request.metadata?.threadRootMessageId as string | undefined;
            if (threadRoot) {
                headers["In-Reply-To"] = threadRoot;
                headers["References"] = `${threadRoot} ${threadRef}`;
            } else {
                headers["References"] = threadRef;
            }
        }

        (payload.personalizations as any[])[0].headers = headers;

        return payload;
    }

    private redactEmail(email: string): string {
        const [local, domain] = email.split("@");
        if (!domain) return "***";
        return `${local[0]}***@${domain}`;
    }
}
