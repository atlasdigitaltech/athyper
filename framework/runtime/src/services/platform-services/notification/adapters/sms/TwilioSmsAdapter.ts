/**
 * TwilioSmsAdapter — SMS delivery via Twilio REST API.
 *
 * Credentials are resolved from environment variables (accountSidRef, authTokenRef).
 * Follows the same IChannelAdapter pattern as SendGridAdapter.
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
    IChannelAdapter,
    ChannelCode,
    DeliveryRequest,
    DeliveryResult,
} from "../../domain/types.js";

export interface TwilioSmsConfig {
    accountSidRef: string;   // env var name holding Twilio Account SID
    authTokenRef: string;    // env var name holding Twilio Auth Token
    fromNumber: string;      // E.164 phone number (e.g., "+15551234567")
}

export class TwilioSmsAdapter implements IChannelAdapter {
    readonly channelCode: ChannelCode = "SMS";
    readonly providerCode = "twilio_sms";
    private accountSid: string | undefined;
    private authToken: string | undefined;

    constructor(
        private readonly config: TwilioSmsConfig,
        private readonly logger: Logger,
    ) {
        this.accountSid = process.env[config.accountSidRef];
        this.authToken = process.env[config.authTokenRef];
    }

    async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
        if (!this.accountSid || !this.authToken) {
            return {
                success: false,
                status: "failed",
                errorCategory: "auth",
                error: "Twilio credentials not configured",
            };
        }

        if (!request.recipientAddr) {
            return {
                success: false,
                status: "failed",
                errorCategory: "permanent",
                error: "Recipient phone number is required for SMS",
            };
        }

        try {
            const body = request.bodyText ?? request.subject ?? "(No content)";

            // Twilio Messages API
            const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
            const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

            const formData = new URLSearchParams({
                To: request.recipientAddr,
                From: this.config.fromNumber,
                Body: body.substring(0, 1600), // Twilio max SMS body
            });

            // Add status callback URL if correlation ID is available
            if (request.correlationId) {
                formData.set("StatusCallback",
                    `${request.metadata?.callbackBaseUrl ?? ""}/api/webhooks/notification/twilio`);
            }

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${credentials}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                body: formData.toString(),
            });

            if (response.ok) {
                const result = (await response.json()) as { sid?: string; status?: string };

                this.logger.info(
                    {
                        deliveryId: request.deliveryId,
                        to: this.redactPhone(request.recipientAddr),
                        messageSid: result.sid,
                    },
                    "[notify:twilio] SMS sent",
                );

                return {
                    success: true,
                    status: result.status === "queued" ? "queued" : "sent",
                    externalId: result.sid,
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
                "[notify:twilio] SMS send failed",
            );

            // Classify error per Twilio HTTP status codes
            if (statusCode === 429) {
                return {
                    success: false,
                    status: "failed",
                    errorCategory: "rate_limit",
                    error: "Rate limited (429)",
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

            return {
                success: false,
                status: "failed",
                errorCategory: "permanent",
                error: `Client error (${statusCode}): ${errorBody.substring(0, 200)}`,
            };
        } catch (err) {
            this.logger.error(
                { error: String(err), deliveryId: request.deliveryId },
                "[notify:twilio] Network error",
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
        if (!this.accountSid) {
            errors.push(`Twilio Account SID env var '${this.config.accountSidRef}' is not set`);
        }
        if (!this.authToken) {
            errors.push(`Twilio Auth Token env var '${this.config.authTokenRef}' is not set`);
        }
        if (!this.config.fromNumber) {
            errors.push("fromNumber is required");
        }
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        if (!this.accountSid || !this.authToken) {
            return { healthy: false, message: "Twilio credentials not configured" };
        }
        return { healthy: true };
    }

    private redactPhone(phone: string): string {
        if (phone.length <= 4) return "***";
        return `***${phone.slice(-4)}`;
    }
}
