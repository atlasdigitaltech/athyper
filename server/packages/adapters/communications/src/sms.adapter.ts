import type {
  NotificationChannelHandler,
  NotificationDeliveryRequest,
} from "@athyper/server-contract-notifications";

import { CommunicationDeliveryError } from "./communication-delivery.error.js";

export interface SmsAdapterConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromNumber?: string;
  readonly messagingServiceSid?: string;
  readonly requestTimeoutMs?: number;
  readonly healthTimeoutMs?: number;
}

export interface SmsAdapterDependencies {
  readonly fetch: typeof fetch;
}

const TWILIO_BASE_URL = "https://api.twilio.com/2010-04-01";
const MAX_SMS_CHARACTERS = 1_600;
const TRUNCATION_SUFFIX = " [...]";
const E164 = /^\+[1-9]\d{7,14}$/;

export function createSmsAdapter(
  config: SmsAdapterConfig,
  dependencies: SmsAdapterDependencies = { fetch: globalThis.fetch },
): NotificationChannelHandler {
  const accountSid = requireValue(config.accountSid, "Twilio account SID");
  const authToken = requireValue(config.authToken, "Twilio auth token");
  const fromNumber = config.fromNumber?.trim();
  const messagingServiceSid = config.messagingServiceSid?.trim();
  if (!fromNumber && !messagingServiceSid) {
    throw new Error("Twilio from number or messaging service SID is required");
  }
  if (fromNumber && !E164.test(fromNumber)) {
    throw new Error("Twilio from number must use E.164 format");
  }
  const requestTimeoutMs = positiveTimeout(config.requestTimeoutMs ?? 15_000);
  const healthTimeoutMs = positiveTimeout(config.healthTimeoutMs ?? 5_000);
  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
  const accountUrl = `${TWILIO_BASE_URL}/Accounts/${encodeURIComponent(accountSid)}`;

  return {
    channel: "sms",
    async send(request) {
      assertChannel(request, "sms");
      if (!E164.test(request.recipientAddress)) {
        throw new Error("SMS recipient must use E.164 format");
      }
      const body = buildSmsBody(request);
      if (!body) {
        throw new Error("SMS body is empty; provide renderedText or body");
      }
      const form = new URLSearchParams({ To: request.recipientAddress, Body: body });
      if (messagingServiceSid) form.set("MessagingServiceSid", messagingServiceSid);
      else form.set("From", fromNumber!);

      let response: Response;
      try {
        response = await dependencies.fetch(`${accountUrl}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: authorization,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch (error) {
        throw new CommunicationDeliveryError("Twilio SMS request failed", {
          channel: "sms",
          retryable: true,
          cause: error,
        });
      }
      if (!response.ok) {
        const detail = (await response.text().catch(() => "unreadable response")).slice(0, 300);
        throw new CommunicationDeliveryError(
          `Twilio SMS delivery failed with HTTP ${response.status}: ${detail}`,
          {
            channel: "sms",
            retryable: response.status === 429 || response.status >= 500,
            statusCode: response.status,
          },
        );
      }
      const result = (await response.json()) as { sid?: unknown };
      return typeof result.sid === "string" ? { externalId: result.sid } : {};
    },
    async health() {
      const startedAt = Date.now();
      try {
        const response = await dependencies.fetch(`${accountUrl}.json`, {
          headers: { Authorization: authorization },
          signal: AbortSignal.timeout(healthTimeoutMs),
        });
        const status = response.ok
          ? "healthy"
          : response.status === 401 || response.status === 403
            ? "unhealthy"
            : "degraded";
        return { status, latencyMs: Date.now() - startedAt };
      } catch {
        return {
          status: "unhealthy",
          message: "Twilio health request failed",
          latencyMs: Date.now() - startedAt,
        };
      }
    },
  };
}

function buildSmsBody(request: NotificationDeliveryRequest): string {
  const rendered = request.payload["renderedText"] ?? request.payload["rendered_text"];
  const bodyValue = typeof rendered === "string" ? rendered : request.payload["body"];
  const text = typeof bodyValue === "string" ? bodyValue : "";
  const full = request.subject && text
    ? `${request.subject}: ${text}`
    : request.subject ?? text;
  return full.length <= MAX_SMS_CHARACTERS
    ? full
    : `${full.slice(0, MAX_SMS_CHARACTERS - TRUNCATION_SUFFIX.length)}${TRUNCATION_SUFFIX}`;
}

function assertChannel(
  request: NotificationDeliveryRequest,
  expected: "email" | "sms",
): void {
  if (request.channel !== expected) {
    throw new Error(`${expected} adapter cannot deliver channel ${request.channel}`);
  }
}

function requireValue(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveTimeout(value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Communication timeout must be a positive integer");
  }
  return value;
}
