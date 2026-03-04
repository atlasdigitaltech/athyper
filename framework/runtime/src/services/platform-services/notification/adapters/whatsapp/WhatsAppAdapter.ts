/**
 * WhatsAppAdapter — WhatsApp delivery via Meta Cloud API.
 *
 * Supports two message types:
 * - Template messages (business-initiated, requires pre-approved templates)
 * - Text messages (user-initiated, within 24h conversation window)
 *
 * Credentials resolved from environment variables (accessTokenRef in config).
 */

import type { Logger } from "../../../../../kernel/logger.js";
import type {
  IChannelAdapter,
  ChannelCode,
  DeliveryRequest,
  DeliveryResult,
} from "../../domain/types.js";
import type { WhatsAppConsentRepo } from "../../persistence/WhatsAppConsentRepo.js";

export interface WhatsAppAdapterConfig {
  phoneNumberId: string;
  accessTokenRef: string; // env var name holding the access token
  businessAccountId?: string;
  apiVersion?: string; // defaults to "v21.0"
}

export class WhatsAppAdapter implements IChannelAdapter {
  readonly channelCode: ChannelCode = "WHATSAPP";
  readonly providerCode = "meta_cloud_api";

  private accessToken: string | undefined;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly config: WhatsAppAdapterConfig,
    private readonly logger: Logger,
    private readonly consentRepo?: WhatsAppConsentRepo,
  ) {
    this.accessToken = process.env[config.accessTokenRef];
    const version = config.apiVersion ?? "v21.0";
    this.apiBaseUrl = `https://graph.facebook.com/${version}/${config.phoneNumberId}/messages`;
  }

  async deliver(request: DeliveryRequest): Promise<DeliveryResult> {
    if (!this.accessToken) {
      return {
        success: false,
        status: "failed",
        errorCategory: "auth",
        error: `WhatsApp access token not found in env var: ${this.config.accessTokenRef}`,
      };
    }

    // Pre-delivery opt-in check (if consent repo available)
    if (this.consentRepo) {
      const isOptedIn = await this.consentRepo.isOptedIn(
        request.tenantId,
        request.recipientAddr,
      );

      if (!isOptedIn) {
        this.logger.info(
          {
            deliveryId: request.deliveryId,
            to: this.redactPhone(request.recipientAddr),
          },
          "[notify:whatsapp] Recipient not opted in — blocking delivery",
        );
        return {
          success: false,
          status: "failed",
          errorCategory: "permanent",
          error: "Recipient has not opted in to WhatsApp notifications",
        };
      }

      // Non-template messages require an active 24h conversation window
      if (request.bodyJson?.type !== "template") {
        const inWindow = await this.consentRepo.isInConversationWindow(
          request.tenantId,
          request.recipientAddr,
        );

        if (!inWindow) {
          this.logger.info(
            {
              deliveryId: request.deliveryId,
              to: this.redactPhone(request.recipientAddr),
            },
            "[notify:whatsapp] Outside conversation window — non-template blocked",
          );
          return {
            success: false,
            status: "failed",
            errorCategory: "permanent",
            error:
              "Non-template message requires active 24h conversation window",
          };
        }
      }
    }

    try {
      const payload = this.buildPayload(request);

      const response = await fetch(this.apiBaseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = (await response.json()) as {
          messages?: Array<{ id: string }>;
        };
        const messageId = result.messages?.[0]?.id;

        this.logger.info(
          {
            deliveryId: request.deliveryId,
            to: this.redactPhone(request.recipientAddr),
            messageId,
          },
          "[notify:whatsapp] Message sent",
        );

        return {
          success: true,
          status: "sent",
          externalId: messageId,
        };
      }

      const errorBody = await response.text();
      const statusCode = response.status;
      const errorInfo = this.parseErrorResponse(errorBody);

      this.logger.warn(
        {
          deliveryId: request.deliveryId,
          statusCode,
          errorCode: errorInfo.code,
          error: errorBody.substring(0, 500),
        },
        "[notify:whatsapp] Send failed",
      );

      return this.classifyError(statusCode, errorInfo);
    } catch (err) {
      this.logger.error(
        { error: String(err), deliveryId: request.deliveryId },
        "[notify:whatsapp] Network error",
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
    if (!this.accessToken) {
      errors.push(
        `Access token env var '${this.config.accessTokenRef}' is not set`,
      );
    }
    if (!this.config.phoneNumberId) {
      errors.push("phoneNumberId is required");
    }
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.accessToken) {
      return { healthy: false, message: "Access token not configured" };
    }
    if (!this.config.phoneNumberId) {
      return { healthy: false, message: "Phone number ID not configured" };
    }
    return { healthy: true };
  }

  /**
   * Build the WhatsApp Cloud API message payload.
   *
   * If bodyJson.type === "template" → send as template message.
   * Otherwise → send as text message.
   */
  private buildPayload(request: DeliveryRequest): Record<string, unknown> {
    // Template message (business-initiated, pre-approved by Meta)
    if (request.bodyJson?.type === "template") {
      return {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: request.recipientAddr,
        type: "template",
        template: {
          name: request.bodyJson.name as string,
          language: {
            code: (request.bodyJson.languageCode as string) ?? "en",
          },
          components: request.bodyJson.components ?? [],
        },
      };
    }

    // Text message (within 24h conversation window)
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: request.recipientAddr,
      type: "text",
      text: {
        preview_url: false,
        body: request.bodyText ?? request.subject ?? "(No content)",
      },
    };
  }

  private parseErrorResponse(body: string): {
    code?: number;
    message?: string;
  } {
    try {
      const parsed = JSON.parse(body) as {
        error?: { code?: number; message?: string; error_subcode?: number };
      };
      return {
        code: parsed.error?.code,
        message: parsed.error?.message,
      };
    } catch {
      return { message: body.substring(0, 200) };
    }
  }

  private classifyError(
    statusCode: number,
    errorInfo: { code?: number; message?: string },
  ): DeliveryResult {
    // Rate limiting
    if (statusCode === 429 || errorInfo.code === 80007) {
      return {
        success: false,
        status: "failed",
        errorCategory: "rate_limit",
        error: `Rate limited (${statusCode}): ${errorInfo.message ?? ""}`,
      };
    }

    // Auth errors
    if (statusCode === 401 || statusCode === 403) {
      return {
        success: false,
        status: "failed",
        errorCategory: "auth",
        error: `Auth error (${statusCode}): ${errorInfo.message ?? ""}`,
      };
    }

    // WhatsApp-specific permanent errors (131xxx = template errors, invalid number, etc.)
    if (errorInfo.code && errorInfo.code >= 131000 && errorInfo.code < 132000) {
      return {
        success: false,
        status: "failed",
        errorCategory: "permanent",
        error: `WhatsApp error (${errorInfo.code}): ${errorInfo.message ?? ""}`,
      };
    }

    // Server errors — transient
    if (statusCode >= 500) {
      return {
        success: false,
        status: "failed",
        errorCategory: "transient",
        error: `Server error (${statusCode}): ${errorInfo.message ?? ""}`,
      };
    }

    // Other 4xx = permanent
    return {
      success: false,
      status: "failed",
      errorCategory: "permanent",
      error: `Client error (${statusCode}): ${errorInfo.message ?? ""}`,
    };
  }

  private redactPhone(phone: string): string {
    if (phone.length <= 4) return "***";
    return `***${phone.slice(-4)}`;
  }
}
