import { describe, expect, it, vi } from "vitest";

import { createSesEventMessageHandler } from "../ses-event-message-handler.js";
import { InvalidSesDeliveryEventError } from "../ses-delivery-events.js";

describe("createSesEventMessageHandler", () => {
  it.each(["applied", "duplicate", "ignored"] as const)("acknowledges %s idempotent processing", async (outcome) => {
    const handler = createSesEventMessageHandler({ apply: vi.fn().mockResolvedValue({ outcome }) });
    await expect(handler.process('{"detail":{}}')).resolves.toEqual({ outcome: "acknowledge" });
  });

  it("retries delivery lookup races", async () => {
    const handler = createSesEventMessageHandler({ apply: vi.fn().mockResolvedValue({ outcome: "not_found" }) });
    await expect(handler.process("{}")).resolves.toEqual({ outcome: "retry", reasonCode: "delivery_not_found" });
  });

  it("leaves malformed, invalid, and mismatched events for DLQ redrive", async () => {
    const mismatch = createSesEventMessageHandler({ apply: vi.fn().mockResolvedValue({ outcome: "correlation_mismatch" }) });
    const invalid = createSesEventMessageHandler({ apply: vi.fn().mockRejectedValue(new InvalidSesDeliveryEventError("recipient data")) });
    await expect(mismatch.process("{}")).resolves.toEqual({ outcome: "permanent_failure", reasonCode: "correlation_mismatch" });
    await expect(invalid.process("{}")).resolves.toEqual({ outcome: "permanent_failure", reasonCode: "invalid_ses_event" });
    await expect(invalid.process("not-json")).resolves.toEqual({ outcome: "permanent_failure", reasonCode: "malformed_json" });
  });

  it("propagates repository failures for transient queue retry", async () => {
    const handler = createSesEventMessageHandler({ apply: vi.fn().mockRejectedValue(new Error("database unavailable")) });
    await expect(handler.process("{}")).rejects.toThrow("database unavailable");
  });
});
