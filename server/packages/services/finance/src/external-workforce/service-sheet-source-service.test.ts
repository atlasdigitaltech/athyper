import { describe, expect, it, vi } from "vitest";
import { ExternalWorkforceServiceSheetService, type ServiceSheetSourceAllocationCommand } from "./service-sheet-source-service.js";

const command: ServiceSheetSourceAllocationCommand = {
  actor: { tenantId: "tenant", principalId: "actor", planeKey: "neon", correlationId: "correlation" },
  serviceSheetLineId: "service-line", source: { kind: "external_time_sheet", id: "time-sheet" },
  acceptedQuantity: "8.0000", acceptedAmount: "800.0000", currencyCode: "USD",
  sourceSnapshot: { status: "approved" }, sourceSnapshotHash: "a".repeat(64), idempotencyKey: "accept:time-sheet:1",
};

describe("ExternalWorkforceServiceSheetService", () => {
  it("writes the canonical source allocation inside the NEON transaction", async () => {
    const append = vi.fn(async () => ({ id: "allocation", ...command, source: command.source }));
    const service = new ExternalWorkforceServiceSheetService({
      transactions: { run: async (_actor, work) => work({}) }, allocations: { append },
    });
    await service.allocate(command);
    expect(append).toHaveBeenCalledOnce();
  });

  it("rejects invalid immutable evidence before persistence", async () => {
    const service = new ExternalWorkforceServiceSheetService({
      transactions: { run: async (_actor, work) => work({}) }, allocations: { append: vi.fn() },
    });
    await expect(service.allocate({ ...command, sourceSnapshotHash: "unsafe" })).rejects.toThrow("evidence");
  });
});
