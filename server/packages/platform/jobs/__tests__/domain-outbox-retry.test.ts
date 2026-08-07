import { describe, expect, it } from "vitest";

import { nextOutboxFailureState } from "../workers/domain-outbox.worker.js";

describe("domain outbox retry policy", () => {
  it("retries with bounded exponential backoff before exhaustion", () => {
    expect(nextOutboxFailureState(1, 5)).toEqual({ status: "failed", retryDelayMs: 30_000 });
    expect(nextOutboxFailureState(3, 5)).toEqual({ status: "failed", retryDelayMs: 120_000 });
  });

  it("dead-letters poison events at max attempts", () => {
    expect(nextOutboxFailureState(5, 5)).toEqual({ status: "dead_letter", retryDelayMs: 480_000 });
  });
});
