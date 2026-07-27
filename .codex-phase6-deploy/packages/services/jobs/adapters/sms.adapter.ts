/**
 * SMS Channel Adapter — Twilio
 *
 * Delivers notification messages via Twilio Messaging API.
 * Registered in bootstrap.ts under channel key "sms" when
 * config.sms is present (TWILIO_ACCOUNT_SID env var).
 *
 * Config (from kernel config.sms.*):
 *   accountSid         — Twilio Account SID (ACxxxxxxxx)
 *   authToken          — Twilio Auth Token
 *   fromNumber         — E.164 sender number (e.g. +14155550100)
 *   messagingServiceSid — Optional Messaging Service SID (MSxxxxxxxx).
 *                         When provided, used instead of fromNumber for
 *                         optimal deliverability across pools.
 *
 * Body resolution:
 *   - payload.rendered_text is used as the SMS body if present.
 *   - Falls back to payload.body (plain text field).
 *   - Subject is prepended if both are present (subject: body).
 *   - Truncated to 1600 chars (10 GSM concatenated segments).
 *
 * The adapter uses the Twilio REST API directly (no SDK dependency).
 * Health check verifies account reachability via the /Accounts/:sid endpoint.
 */

import type { NotificationChannelHandler } from "../workers/notification.worker.js";

export interface SmsAdapterConfig {
  accountSid:          string;
  authToken:           string;
  fromNumber:          string;   // E.164 format, e.g. +14155550100
  messagingServiceSid?: string;  // MSxxxxxxxx — optional Messaging Service
}

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";
const MAX_SMS_CHARS = 1600;
const TRUNCATION_SUFFIX = " [...]";

function buildAuthHeader(accountSid: string, authToken: string): string {
  const encoded = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  return `Basic ${encoded}`;
}

function buildBody(
  subject: string | null,
  payload: Record<string, unknown>,
): string {
  const text =
    typeof payload["rendered_text"] === "string"
      ? payload["rendered_text"]
      : typeof payload["body"] === "string"
        ? payload["body"]
        : "";

  const full = subject && text ? `${subject}: ${text}` : subject ?? text;

  if (full.length <= MAX_SMS_CHARS) return full;
  // Truncate and append indicator to stay within 10 concatenated GSM segments.
  return full.slice(0, MAX_SMS_CHARS - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

export function createSmsAdapter(config: SmsAdapterConfig): NotificationChannelHandler {
  const authHeader = buildAuthHeader(config.accountSid, config.authToken);
  const messagesUrl = `${TWILIO_BASE}/Accounts/${config.accountSid}/Messages.json`;

  return {
    async send(opts) {
      const { recipientAddr, subject, payload } = opts;

      if (!recipientAddr || !recipientAddr.startsWith("+")) {
        throw new Error(`Invalid SMS recipient address: "${recipientAddr}". Must be E.164 format.`);
      }

      const body = buildBody(subject, payload);
      if (!body) {
        throw new Error("SMS body is empty — template must provide rendered_text or body.");
      }

      const formData = new URLSearchParams({
        To:   recipientAddr,
        Body: body,
        ...(config.messagingServiceSid
          ? { MessagingServiceSid: config.messagingServiceSid }
          : { From: config.fromNumber }),
      });

      const response = await fetch(messagesUrl, {
        method:  "POST",
        headers: {
          "Authorization": authHeader,
          "Content-Type":  "application/x-www-form-urlencoded",
        },
        body:   formData.toString(),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "(unreadable)");
        throw new Error(
          `Twilio SMS delivery failed: HTTP ${response.status} — ${errorBody.slice(0, 300)}`,
        );
      }

      const result = (await response.json()) as { sid: string; status: string };
      return { externalId: result.sid };
    },

    async healthCheck() {
      try {
        const response = await fetch(
          `${TWILIO_BASE}/Accounts/${config.accountSid}.json`,
          {
            headers: { Authorization: authHeader },
            signal:  AbortSignal.timeout(5_000),
          },
        );
        if (response.ok)   return "healthy";
        if (response.status === 401 || response.status === 403) return "down";
        return "degraded";
      } catch {
        return "down";
      }
    },
  };
}
