import { describe, expect, it, vi } from "vitest";
import {
  RECONCILE_ATTACHMENT_RETENTION_JOB,
  createAttachmentRetentionReconciliationHandler,
} from "./quota-recovery.js";

describe("attachment retention reconciliation", () => {
  it("claims a bounded plane batch and schedules each candidate once", async () => {
    const claim = vi.fn(async () => [
      {
        planeKey: "neon" as const,
        tenantId: "11111111-1111-4111-8111-111111111111",
        principalId: "00000000-0000-0000-0000-000000000000",
        attachmentId: "22222222-2222-4222-8222-222222222222",
      },
    ]);
    const schedulePurge = vi.fn(async () => undefined);
    const handler = createAttachmentRetentionReconciliationHandler({
      claim,
      schedulePurge,
    });
    await expect(
      handler.handle({
        name: RECONCILE_ATTACHMENT_RETENTION_JOB,
        data: { planeKey: "neon", batchSize: 100 },
      } as never, {} as never),
    ).resolves.toEqual({
      status: "completed",
      output: { examined: 1, enqueued: 1 },
    });
    expect(claim).toHaveBeenCalledWith({ planeKey: "neon", batchSize: 100 });
    expect(schedulePurge).toHaveBeenCalledOnce();
  });
});
