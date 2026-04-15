/**
 * Webhook HMAC-SHA256 signing utilities.
 *
 * Outbound delivery:
 *   const sig = signWebhookPayload(rawBody, signingSecret);
 *   // → "sha256=<64-hex-chars>"
 *   fetch(targetUrl, { headers: { "X-Webhook-Signature": sig, ... }, body: rawBody });
 *
 * Inbound verification (when Athyper receives webhooks from external providers):
 *   const ok = verifyWebhookSignature(rawBody, req.headers["x-webhook-signature"], secret);
 *   if (!ok) return res.status(401).json({ error: "SIGNATURE_MISMATCH" });
 *
 * Security notes:
 *   - Use timingSafeEqual for all comparisons to prevent timing attacks.
 *   - The secret is never logged or returned in API responses.
 *   - Minimum secret length enforced at 16 bytes to prevent brute-force.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/** Prefix used in the X-Webhook-Signature header value. */
export const SIGNATURE_PREFIX = "sha256=";

/**
 * Compute HMAC-SHA256 signature for an outbound webhook payload.
 *
 * @param payload   Raw request body string (must match exactly what the receiver verifies)
 * @param secret    Webhook signing secret (UTF-8 or hex string)
 * @returns         "sha256=<64-hex-chars>"
 */
export function signWebhookPayload(payload: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(payload, "utf8").digest("hex");
  return `${SIGNATURE_PREFIX}${sig}`;
}

/**
 * Verify an inbound webhook signature from an external provider.
 *
 * Returns false if:
 *   - signature does not start with "sha256="
 *   - the computed digest does not match (constant-time comparison)
 *   - either payload or secret is empty
 *
 * @param payload    Raw request body string
 * @param signature  Value of the X-Webhook-Signature (or equivalent) header
 * @param secret     Shared signing secret
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  if (!payload || !signature || !secret) return false;
  if (!signature.startsWith(SIGNATURE_PREFIX)) return false;

  const expected = Buffer.from(signWebhookPayload(payload, secret), "utf8");
  const actual   = Buffer.from(signature, "utf8");

  // Lengths must match before timingSafeEqual or it throws
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Build the set of headers to include in an outbound webhook delivery request.
 *
 * Always included:
 *   Content-Type: application/json
 *   X-Webhook-Event: <topic>
 *   X-Webhook-Delivery: <deliveryId>  (idempotency key for retries)
 *
 * Conditionally included when signingSecret is provided:
 *   X-Webhook-Signature: sha256=<digest>
 */
export function buildWebhookHeaders(params: {
  topic: string;
  deliveryId: string;
  rawBody: string;
  signingSecret?: string | null;
}): Record<string, string> {
  const { topic, deliveryId, rawBody, signingSecret } = params;

  const headers: Record<string, string> = {
    "Content-Type":       "application/json",
    "X-Webhook-Event":    topic,
    "X-Webhook-Delivery": deliveryId,
  };

  if (signingSecret) {
    headers["X-Webhook-Signature"] = signWebhookPayload(rawBody, signingSecret);
  }

  return headers;
}
