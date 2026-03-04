/**
 * Twilio SMS Adapter — sends SMS via Twilio Messages API.
 * Validates Twilio inbound SMS webhook signatures.
 */

import { createHmac } from "node:crypto";

import type { ISmsProviderAdapter, SmsSendParams, SmsSendResult, SmsInboundEvent } from "./SmsProviderAdapter.js";
import type { Logger } from "../../../../kernel/logger.js";

export interface TwilioSmsConfig {
    accountSidRef: string;
    authTokenRef: string;
    fromNumber: string;
    webhookSigningSecretRef?: string;
}

export class TwilioSmsAdapter implements ISmsProviderAdapter {
    readonly provider = "twilio";

    private readonly accountSid: string;
    private readonly authToken: string;
    private readonly defaultFrom: string;
    private readonly signingSecret: string | undefined;

    constructor(
        private readonly config: TwilioSmsConfig,
        private readonly logger: Logger,
    ) {
        this.accountSid = process.env[config.accountSidRef] ?? "";
        this.authToken = process.env[config.authTokenRef] ?? "";
        this.defaultFrom = config.fromNumber;
        this.signingSecret = config.webhookSigningSecretRef
            ? process.env[config.webhookSigningSecretRef]
            : undefined;
    }

    async send(params: SmsSendParams): Promise<SmsSendResult> {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

        const formBody = new URLSearchParams({
            From: params.from || this.defaultFrom,
            To: params.to,
            Body: params.body,
        });

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            },
            body: formBody.toString(),
        });

        if (!response.ok) {
            const errBody = await response.text();
            this.logger.error({ status: response.status, body: errBody }, "[twilio:sms] Send failed");
            throw new Error(`Twilio SMS send failed: ${response.status}`);
        }

        const data = (await response.json()) as { sid: string; status: string };

        this.logger.info({ sid: data.sid, to: params.to }, "[twilio:sms] Message sent");

        return {
            messageRef: data.sid,
            provider: "twilio",
            status: data.status ?? "queued",
        };
    }

    parseInboundWebhook(rawBody: Record<string, unknown>): SmsInboundEvent {
        return {
            messageRef: String(rawBody.MessageSid ?? ""),
            from: String(rawBody.From ?? ""),
            to: String(rawBody.To ?? ""),
            body: String(rawBody.Body ?? ""),
            timestamp: new Date().toISOString(),
            rawPayload: rawBody,
        };
    }

    validateWebhookSignature(rawBody: string, signature: string, url: string): boolean {
        const secret = this.signingSecret ?? this.authToken;
        if (!secret) return false;

        const data = url + rawBody;
        const expected = createHmac("sha1", secret).update(data).digest("base64");

        return expected === signature;
    }

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        if (!this.accountSid || !this.authToken) {
            return { healthy: false, message: "Twilio SMS credentials not configured" };
        }
        return { healthy: true, message: "Twilio SMS adapter configured" };
    }
}
