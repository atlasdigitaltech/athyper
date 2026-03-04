/**
 * Webhook Delivery Worker
 *
 * Processes outbound webhook delivery jobs: HTTP POST to configured URL
 * with configurable retry, HMAC signature verification, and delivery logging.
 */

import { createHmac } from "node:crypto";

import type { Logger } from "../../../../kernel/logger.js";
import type { Job, JobHandler } from "@athyper/core";

// ============================================================================
// Types
// ============================================================================

export interface WebhookDeliveryPayload {
  /** Target URL */
  url: string;
  /** HTTP method (default POST) */
  method?: "POST" | "PUT" | "PATCH";
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (JSON-serializable) */
  body: unknown;
  /** HMAC secret for signing (optional) */
  hmacSecret?: string;
  /** Timeout in milliseconds (default 30000) */
  timeoutMs?: number;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Tenant ID */
  tenantId?: string;
  /** Custom metadata passed through to result */
  metadata?: Record<string, unknown>;
}

export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  responseBody?: string;
  durationMs: number;
  error?: string;
  attempt: number;
}

// ============================================================================
// Worker Factory
// ============================================================================

export function createWebhookDeliveryHandler(
  logger: Logger,
): JobHandler<WebhookDeliveryPayload, WebhookDeliveryResult> {
  return async (
    job: Job<WebhookDeliveryPayload>,
  ): Promise<WebhookDeliveryResult> => {
    const payload = job.data.payload;
    const startTime = Date.now();

    logger.info({
      msg: "webhook_delivery_started",
      jobId: job.id,
      url: redactUrl(payload.url),
      method: payload.method ?? "POST",
      attempt: job.attempts,
      correlationId: payload.correlationId,
    });

    try {
      const method = payload.method ?? "POST";
      const bodyStr = JSON.stringify(payload.body);
      const timeoutMs = payload.timeoutMs ?? 30_000;

      // Build headers
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "Athyper-Webhook/1.0",
        ...(payload.headers ?? {}),
      };

      // HMAC signature if secret provided
      if (payload.hmacSecret) {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signaturePayload = `${timestamp}.${bodyStr}`;
        const signature = createHmac("sha256", payload.hmacSecret)
          .update(signaturePayload)
          .digest("hex");

        headers["X-Webhook-Timestamp"] = timestamp;
        headers["X-Webhook-Signature"] = `sha256=${signature}`;
      }

      if (payload.correlationId) {
        headers["X-Correlation-Id"] = payload.correlationId;
      }

      // Execute HTTP request with timeout
      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(payload.url, {
          method,
          headers,
          body: bodyStr,
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);

        const durationMs = Date.now() - startTime;
        const responseBody = await response.text().catch(() => "");

        if (response.ok) {
          logger.info({
            msg: "webhook_delivery_success",
            jobId: job.id,
            statusCode: response.status,
            durationMs,
          });

          return {
            success: true,
            statusCode: response.status,
            responseBody: responseBody.substring(0, 1000),
            durationMs,
            attempt: job.attempts,
          };
        }

        // Non-2xx response
        logger.warn({
          msg: "webhook_delivery_failed",
          jobId: job.id,
          statusCode: response.status,
          durationMs,
          error: responseBody.substring(0, 500),
        });

        // Throw for retryable errors (5xx, 429)
        if (response.status >= 500 || response.status === 429) {
          throw new Error(`Webhook returned ${response.status}: retryable`);
        }

        // 4xx errors are permanent — don't retry
        return {
          success: false,
          statusCode: response.status,
          responseBody: responseBody.substring(0, 1000),
          durationMs,
          error: `HTTP ${response.status}`,
          attempt: job.attempts,
        };
      } finally {
        clearTimeout(timeoutHandle);
      }
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error({
        msg: "webhook_delivery_error",
        jobId: job.id,
        error: errorMsg,
        durationMs,
        attempt: job.attempts,
      });

      // Re-throw for BullMQ retry
      throw err;
    }
  };
}

function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return "***";
  }
}
