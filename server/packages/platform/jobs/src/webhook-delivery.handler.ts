import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import type { JobHandler } from "@athyper/server-contract-jobs";
import type {
  WebhookDelivery,
  WebhookDeliveryOutcome,
  WebhookDeliveryRepository,
  WebhookErrorCategory,
} from "@athyper/server-contract-notifications";

const MAX_PAYLOAD_BYTES = 1_048_576;

export interface WebhookDeliveryJobData {
  readonly planeKey:"studio"|"neon"|"mesh";
  readonly tenantId:string;
  readonly principalId:string;
  readonly deliveryId: string;
}

export interface WebhookDeliveryHandlerDependencies {
  readonly repository: WebhookDeliveryRepository;
  readonly fetch?: typeof fetch;
  readonly resolveHost?: (hostname: string) => Promise<readonly string[]>;
  readonly allowHttpLocalhost?: boolean;
}

export class RetryableWebhookDeliveryError extends Error {
  constructor(readonly outcome: WebhookDeliveryOutcome) {
    super("Webhook delivery should be retried");
    this.name = "RetryableWebhookDeliveryError";
  }
}

export function createWebhookDeliveryHandler(
  dependencies: WebhookDeliveryHandlerDependencies,
): JobHandler<"webhook.deliver", WebhookDeliveryJobData> {
  const fetchImplementation = dependencies.fetch ?? globalThis.fetch;
  const resolveHost = dependencies.resolveHost ?? resolveAddresses;
  return {
    async handle(job) {
      const delivery = await dependencies.repository.loadDue(job.data);
      if (!delivery) return { status: "discarded", reason: "delivery_not_due" };
      const startedAt = Date.now();
      try {
        await assertSafeTarget(
          delivery.targetUrl,
          resolveHost,
          dependencies.allowHttpLocalhost ?? false,
        );
      } catch {
        await dependencies.repository.complete(job.data, {
          delivered: false,
          retryable: false,
          errorCategory: "permanent",
          durationMs: Date.now() - startedAt,
        });
        return { status: "discarded", reason: "unsafe_target" };
      }
      const rawBody = JSON.stringify(delivery.payload);
      if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
        await dependencies.repository.complete(job.data, {
          delivered: false,
          retryable: false,
          errorCategory: "permanent",
          durationMs: Date.now() - startedAt,
        });
        return { status: "discarded", reason: "payload_too_large" };
      }

      let outcome: WebhookDeliveryOutcome;
      try {
        const response = await fetchImplementation(delivery.targetUrl, {
          method: "POST",
          headers: buildHeaders(delivery, rawBody),
          body: rawBody,
          redirect: "error",
          signal: AbortSignal.timeout(delivery.timeoutMs ?? 10_000),
        });
        outcome = {
          ...classifyWebhookResponse(response.status, response.headers.get("retry-after")),
          durationMs: Date.now() - startedAt,
        };
      } catch (error) {
        outcome = {
          delivered: false,
          retryable: true,
          errorCategory: "transient",
          durationMs: Date.now() - startedAt,
        };
      }
      await dependencies.repository.complete(job.data, outcome);
      if (outcome.retryable) throw new RetryableWebhookDeliveryError(outcome);
      return outcome.delivered
        ? { status: "completed" }
        : { status: "discarded", reason: outcome.errorCategory ?? "delivery_failed" };
    },
  };
}

export function classifyWebhookResponse(
  statusCode: number,
  retryAfter: string | null = null,
): WebhookDeliveryOutcome {
  if (statusCode >= 200 && statusCode < 300) {
    return { delivered: true, retryable: false, statusCode };
  }
  let errorCategory: WebhookErrorCategory;
  let retryable: boolean;
  if (statusCode === 401 || statusCode === 403) {
    errorCategory = "auth";
    retryable = false;
  } else if (statusCode === 429) {
    errorCategory = "rate_limit";
    retryable = true;
  } else if ([408, 409, 425].includes(statusCode) || statusCode >= 500) {
    errorCategory = "transient";
    retryable = true;
  } else {
    errorCategory = "permanent";
    retryable = false;
  }
  return {
    delivered: false,
    retryable,
    statusCode,
    errorCategory,
    ...(statusCode === 429 ? { retryAfterMs: parseRetryAfter(retryAfter) } : {}),
  };
}

function buildHeaders(delivery: WebhookDelivery, rawBody: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Webhook-Event": delivery.topic,
    "X-Webhook-Delivery": delivery.deliveryId,
    ...(delivery.signingSecret
      ? {
          "X-Webhook-Signature": `sha256=${createHmac("sha256", delivery.signingSecret)
            .update(rawBody)
            .digest("hex")}`,
        }
      : {}),
  };
}

async function assertSafeTarget(
  rawUrl: string,
  resolveHost: (hostname: string) => Promise<readonly string[]>,
  allowHttpLocalhost: boolean,
): Promise<void> {
  const url = new URL(rawUrl);
  const isLocalhost = url.hostname === "localhost" || url.hostname.endsWith(".localhost");
  if (url.protocol !== "https:" && !(allowHttpLocalhost && url.protocol === "http:" && isLocalhost)) {
    throw new Error("Webhook target must use HTTPS");
  }
  if (url.username || url.password) throw new Error("Webhook target credentials are forbidden");
  const addresses = isIP(url.hostname) ? [url.hostname] : await resolveHost(url.hostname);
  if (addresses.length === 0) throw new Error("Webhook target did not resolve");
  if (!allowHttpLocalhost && addresses.some(isPrivateAddress)) {
    throw new Error("Webhook target resolves to a private or reserved address");
  }
}

async function resolveAddresses(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:")) return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  const parts = normalized.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function parseRetryAfter(value: string | null): number {
  if (!value) return 3_600_000;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? 3_600_000 : Math.max(0, date - Date.now());
}
