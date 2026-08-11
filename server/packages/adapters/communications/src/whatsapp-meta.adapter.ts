import type { NotificationChannelHandler } from "@athyper/server-contract-notifications";

import { CommunicationDeliveryError } from "./communication-delivery.error.js";

export interface MetaWhatsAppAdapterConfig {
  readonly apiVersion: string;
  readonly phoneNumberId: string;
  readonly accessToken: string;
  readonly graphBaseUrl?: string;
  readonly timeoutMs?: number;
}

export interface MetaWhatsAppAdapterDependencies {
  readonly fetch: typeof fetch;
}

export function createMetaWhatsAppAdapter(
  config: MetaWhatsAppAdapterConfig,
  dependencies: MetaWhatsAppAdapterDependencies = { fetch: globalThis.fetch },
): NotificationChannelHandler {
  const apiVersion = required(config.apiVersion, "Meta Graph API version");
  if (!/^v\d+\.\d+$/.test(apiVersion)) {
    throw new Error("Meta Graph API version must use v<major>.<minor> format");
  }
  const phoneNumberId = required(config.phoneNumberId, "WhatsApp phone number ID");
  const accessToken = required(config.accessToken, "WhatsApp access token");
  const baseUrl = (config.graphBaseUrl?.trim() || "https://graph.facebook.com").replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? 10_000;
  const messagesUrl = `${baseUrl}/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;

  return {
    channel: "whatsapp",
    async send(request) {
      if (request.channel !== "whatsapp") {
        throw new Error(`whatsapp adapter cannot deliver channel ${request.channel}`);
      }
      if (!/^\+[1-9]\d{7,14}$/.test(request.recipientAddress)) {
        throw new Error("WhatsApp recipient must use E.164 format");
      }
      const template = readTemplate(request.payload);
      let response: Response;
      try {
        response = await dependencies.fetch(messagesUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: request.recipientAddress.slice(1),
            type: "template",
            template,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new CommunicationDeliveryError("Meta WhatsApp request failed", {
          channel: "whatsapp",
          retryable: true,
          cause: error,
        });
      }
      const body = (await response.json().catch(() => ({}))) as {
        messages?: Array<{ id?: unknown }>;
      };
      if (!response.ok) {
        throw new CommunicationDeliveryError(
          `Meta WhatsApp delivery failed with HTTP ${response.status}`,
          {
            channel: "whatsapp",
            retryable: response.status === 429 || response.status >= 500,
            statusCode: response.status,
          },
        );
      }
      const id = body.messages?.[0]?.id;
      return typeof id === "string" ? { externalId: id } : {};
    },
    async health() {
      const startedAt = Date.now();
      try {
        const response = await dependencies.fetch(
          `${baseUrl}/${apiVersion}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: AbortSignal.timeout(timeoutMs),
          },
        );
        return {
          status: response.ok
            ? "healthy"
            : response.status >= 500
              ? "degraded"
              : "unhealthy",
          latencyMs: Date.now() - startedAt,
        };
      } catch {
        return {
          status: "unhealthy",
          message: "Meta Graph API health request failed",
        };
      }
    },
  };
}

function readTemplate(payload: Readonly<Record<string, unknown>>): {
  name: string;
  language: { code: string };
  components?: unknown[];
} {
  const value = payload["whatsappTemplate"];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("WhatsApp delivery requires payload.whatsappTemplate");
  }
  const template = value as Record<string, unknown>;
  const name = typeof template["name"] === "string" ? template["name"].trim() : "";
  const languageCode = typeof template["languageCode"] === "string"
    ? template["languageCode"].trim()
    : "";
  if (!name || !languageCode) {
    throw new Error("WhatsApp template requires name and languageCode");
  }
  const components = template["components"];
  return {
    name,
    language: { code: languageCode },
    ...(Array.isArray(components) ? { components } : {}),
  };
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}
