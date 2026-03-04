/**
 * Twilio CTI Adapter — initiates/ends calls via Twilio Voice API.
 * Validates Twilio webhook signatures (HMAC-SHA1).
 */

import { createHmac } from "node:crypto";

import type { ICtiAdapter, CallInitiateParams, CallInitiateResult, CtiStatusEvent } from "./CtiAdapter.js";
import type { Logger } from "../../../../kernel/logger.js";

export interface TwilioCtiConfig {
    accountSidRef: string;
    authTokenRef: string;
    webhookSigningSecretRef?: string;
}

export class TwilioCtiAdapter implements ICtiAdapter {
    readonly provider = "twilio";

    private readonly accountSid: string;
    private readonly authToken: string;
    private readonly signingSecret: string | undefined;

    constructor(
        private readonly config: TwilioCtiConfig,
        private readonly logger: Logger,
    ) {
        this.accountSid = process.env[config.accountSidRef] ?? "";
        this.authToken = process.env[config.authTokenRef] ?? "";
        this.signingSecret = config.webhookSigningSecretRef
            ? process.env[config.webhookSigningSecretRef]
            : undefined;
    }

    async initiateCall(params: CallInitiateParams): Promise<CallInitiateResult> {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`;

        const formBody = new URLSearchParams({
            From: params.from,
            To: params.to,
            ...(params.callbackUrl ? { StatusCallback: params.callbackUrl } : {}),
            StatusCallbackMethod: "POST",
            StatusCallbackEvent: "initiated ringing answered completed",
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
            this.logger.error({ status: response.status, body: errBody }, "[twilio:cti] Call initiation failed");
            throw new Error(`Twilio call failed: ${response.status}`);
        }

        const data = (await response.json()) as { sid: string; status: string };

        this.logger.info({ sid: data.sid, to: params.to }, "[twilio:cti] Call initiated");

        return {
            sessionRef: data.sid,
            provider: "twilio",
            status: data.status ?? "initiated",
        };
    }

    async endCall(sessionRef: string): Promise<void> {
        const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls/${sessionRef}.json`;

        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64")}`,
            },
            body: new URLSearchParams({ Status: "completed" }).toString(),
        });

        if (!response.ok) {
            this.logger.error({ status: response.status, sessionRef }, "[twilio:cti] End call failed");
            throw new Error(`Twilio end call failed: ${response.status}`);
        }

        this.logger.info({ sessionRef }, "[twilio:cti] Call ended");
    }

    parseWebhookEvent(rawBody: Record<string, unknown>): CtiStatusEvent {
        return {
            sessionRef: String(rawBody.CallSid ?? ""),
            status: this.mapTwilioStatus(String(rawBody.CallStatus ?? "unknown")),
            durationSeconds: rawBody.CallDuration ? Number(rawBody.CallDuration) : undefined,
            timestamp: new Date().toISOString(),
            rawPayload: rawBody,
        };
    }

    validateWebhookSignature(rawBody: string, signature: string, url: string): boolean {
        const secret = this.signingSecret ?? this.authToken;
        if (!secret) return false;

        // Twilio signature: HMAC-SHA1 of URL + sorted POST body params
        const data = url + rawBody;
        const expected = createHmac("sha1", secret).update(data).digest("base64");

        return expected === signature;
    }

    async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
        if (!this.accountSid || !this.authToken) {
            return { healthy: false, message: "Twilio credentials not configured" };
        }
        return { healthy: true, message: "Twilio CTI adapter configured" };
    }

    private mapTwilioStatus(twilioStatus: string): string {
        const map: Record<string, string> = {
            queued: "initiated",
            ringing: "ringing",
            "in-progress": "in-progress",
            completed: "completed",
            failed: "failed",
            busy: "busy",
            "no-answer": "no-answer",
            canceled: "canceled",
        };
        return map[twilioStatus] ?? twilioStatus;
    }
}
