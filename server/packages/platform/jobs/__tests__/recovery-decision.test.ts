import { describe, expect, it } from "vitest";
import {
  classifyWebhookDeliveryOutcome,
  computeWebhookBackoffMs,
  isWebhookDeliveryTerminal,
} from "../workers/webhook-delivery.worker.js";
import {
  classifyNotificationDeliveryError,
  computeNotificationRetryDelayMs,
  finalNotificationMessageStatus,
  type DeliveryAggregate,
} from "../workers/notification.worker.js";

describe("webhook delivery recovery decisions", () => {
  it("treats 2xx responses as delivered terminal success", () => {
    expect(classifyWebhookDeliveryOutcome({ httpStatus: 204 })).toEqual({
      status: "delivered",
      errorCategory: null,
      retryable: false,
    });
    expect(isWebhookDeliveryTerminal("delivered")).toBe(true);
  });

  it("treats auth and permanent 4xx failures as bounced", () => {
    expect(classifyWebhookDeliveryOutcome({ httpStatus: 401 })).toMatchObject({
      status: "bounced",
      errorCategory: "auth",
      retryable: false,
    });
    expect(classifyWebhookDeliveryOutcome({ httpStatus: 410 })).toMatchObject({
      status: "bounced",
      errorCategory: "permanent",
      retryable: false,
    });
  });

  it("treats rate limits and server failures as retryable failures", () => {
    expect(classifyWebhookDeliveryOutcome({ httpStatus: 429 })).toMatchObject({
      status: "failed",
      errorCategory: "rate_limit",
      retryable: true,
    });
    expect(classifyWebhookDeliveryOutcome({ httpStatus: 503 })).toMatchObject({
      status: "failed",
      errorCategory: "transient",
      retryable: true,
    });
  });

  it("uses retry-after for rate limits and caps transient backoff", () => {
    expect(computeWebhookBackoffMs(2, "rate_limit", 12_000)).toBe(12_000);
    expect(computeWebhookBackoffMs(20, "transient")).toBe(15 * 60_000);
  });
});

describe("notification delivery recovery decisions", () => {
  it("classifies explicit provider error categories", () => {
    expect(classifyNotificationDeliveryError({ errorCategory: "auth" })).toBe("auth");
    expect(classifyNotificationDeliveryError({ error_category: "rate_limit" })).toBe("rate_limit");
  });

  it("infers categories from HTTP-like status codes and messages", () => {
    expect(classifyNotificationDeliveryError({ statusCode: 403 })).toBe("auth");
    expect(classifyNotificationDeliveryError({ httpStatus: 429 })).toBe("rate_limit");
    expect(classifyNotificationDeliveryError(new Error("invalid recipient 400"))).toBe("permanent");
    expect(classifyNotificationDeliveryError(new Error("socket hang up"))).toBe("transient");
  });

  it("calculates retry delays for provider errors", () => {
    expect(computeNotificationRetryDelayMs(1, "transient")).toBe(60_000);
    expect(computeNotificationRetryDelayMs(3, "transient")).toBe(240_000);
    expect(computeNotificationRetryDelayMs(1, "rate_limit", 5_000)).toBe(5_000);
  });

  it("finalizes messages as completed, failed, or partial", () => {
    const base: DeliveryAggregate = {
      delivered: 0,
      failed: 0,
      pending: 0,
      retryable: 0,
      total: 0,
      nextRetryAt: null,
    };

    expect(finalNotificationMessageStatus({ ...base, delivered: 2, total: 2 })).toBe("completed");
    expect(finalNotificationMessageStatus({ ...base, failed: 2, total: 2 })).toBe("failed");
    expect(finalNotificationMessageStatus({ ...base, delivered: 1, failed: 1, total: 2 })).toBe("partial");
  });
});
