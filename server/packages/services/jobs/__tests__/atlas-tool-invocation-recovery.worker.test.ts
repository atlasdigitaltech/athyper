import { describe, expect, it, vi } from "vitest";
import {
  processAtlasToolInvocationRecovery,
  type AtlasToolInvocationRecoveryService,
} from "../workers/atlas-tool-invocation-recovery.worker.js";

const AS_OF = new Date("2026-07-24T10:00:00.000Z");

function makeService() {
  return {
    recoverEligible: vi.fn(() => Promise.resolve({
      failedCount: 3,
      scopeCount: 2,
      skippedScopeCount: 1,
    })),
  } satisfies AtlasToolInvocationRecoveryService;
}

describe("Atlas tool invocation recovery worker", () => {
  it("derives the stale boundary from server config and passes no selectors", async () => {
    const service = makeService();
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const metrics = { observe: vi.fn() };

    await expect(processAtlasToolInvocationRecovery(
      {
        id: "job-1",
        name: "atlas-tool-invocation-recovery",
        data: {},
      } as never,
      service,
      { batchSize: 50, staleRunTimeoutMs: 900_000 },
      logger,
      metrics,
      AS_OF,
    )).resolves.toEqual({
      failedCount: 3,
      scopeCount: 2,
      skippedScopeCount: 1,
    });

    expect(service.recoverEligible).toHaveBeenCalledWith({
      staleBefore: new Date("2026-07-24T09:45:00.000Z"),
      asOf: AS_OF,
      batchSize: 50,
    });
    expect(logger.info).toHaveBeenCalledWith(
      "atlas_tool_invocation_recovery_completed",
      expect.objectContaining({
        failedCount: 3,
        scopeCount: 2,
        skippedScopeCount: 1,
      }),
    );
    expect(metrics.observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "completed",
      recoveredCount: 3,
      scopeCount: 2,
      skippedScopeCount: 1,
    }));
  });

  it("rejects all caller-supplied tenant, principal, plane, and row selectors", async () => {
    const service = makeService();

    await expect(processAtlasToolInvocationRecovery(
      {
        id: "job-2",
        name: "atlas-tool-invocation-recovery",
        data: {
          tenantId: "00000000-0000-0000-0000-000000000001",
          principalId: "00000000-0000-0000-0000-000000000002",
          plane: "admin",
          invocationId: "00000000-0000-0000-0000-000000000003",
        },
      } as never,
      service,
      { batchSize: 50, staleRunTimeoutMs: 900_000 },
      undefined,
      undefined,
      AS_OF,
    )).rejects.toThrow("payload must be empty");

    expect(service.recoverEligible).not.toHaveBeenCalled();
  });

  it("rejects unsupported names and unbounded configuration", async () => {
    const service = makeService();

    await expect(processAtlasToolInvocationRecovery(
      { id: "job-3", name: "sweep", data: {} } as never,
      service,
      { batchSize: 50, staleRunTimeoutMs: 900_000 },
      undefined,
      undefined,
      AS_OF,
    )).rejects.toThrow("Unsupported Atlas tool maintenance job");

    await expect(processAtlasToolInvocationRecovery(
      {
        id: "job-4",
        name: "atlas-tool-invocation-recovery",
        data: {},
      } as never,
      service,
      { batchSize: 1_001, staleRunTimeoutMs: 900_000 },
      undefined,
      undefined,
      AS_OF,
    )).rejects.toThrow("batch size");

    await expect(processAtlasToolInvocationRecovery(
      {
        id: "job-5",
        name: "atlas-tool-invocation-recovery",
        data: {},
      } as never,
      service,
      { batchSize: 50, staleRunTimeoutMs: 59_999 },
      undefined,
      undefined,
      AS_OF,
    )).rejects.toThrow("stale timeout");
  });

  it("reports bounded failure telemetry and preserves BullMQ retry behavior", async () => {
    const failure = new Error("database unavailable");
    const service = {
      recoverEligible: vi.fn(() => Promise.reject(failure)),
    } satisfies AtlasToolInvocationRecoveryService;
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    const metrics = { observe: vi.fn() };

    await expect(processAtlasToolInvocationRecovery(
      {
        id: "job-6",
        name: "atlas-tool-invocation-recovery",
        data: {},
      } as never,
      service,
      { batchSize: 50, staleRunTimeoutMs: 900_000 },
      logger,
      metrics,
      AS_OF,
    )).rejects.toBe(failure);

    expect(logger.error).toHaveBeenCalledWith(
      "atlas_tool_invocation_recovery_failed",
      expect.objectContaining({
        jobId: "job-6",
        errorType: "Error",
      }),
    );
    expect(metrics.observe).toHaveBeenCalledWith(expect.objectContaining({
      outcome: "failed",
      recoveredCount: 0,
    }));
  });
});
