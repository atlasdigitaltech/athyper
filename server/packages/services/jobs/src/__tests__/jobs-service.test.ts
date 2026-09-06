import { describe, expect, it, vi } from "vitest";

import {
  createJobDefinitionCatalog,
  createJobAdministrationService,
  createJobExecutionLifecycle,
  createJobScheduleReconciler,
} from "../index.js";

const definition = {
  code: "notifications.discovery",
  owner: "@athyper/server-platform-notifications",
  queue: "notifications-maintenance",
  name: "discover",
  scope: "plane" as const,
  payloadSchema: { name: "notifications.discovery", version: 1 },
};

describe("jobs service", () => {
  it("rejects duplicate handler ownership", () => {
    expect(() => createJobDefinitionCatalog([
      definition,
      { ...definition, code: "notifications.discovery-copy" },
    ])).toThrow("Duplicate job handler definition");
  });

  it("reconciles plane-qualified schedules and removes stale definitions", async () => {
    const upsert = vi.fn(async () => undefined);
    const remove = vi.fn(async (id: string) => id === "neon:schedule-1");
    const markReconciled = vi.fn(async () => undefined);
    let enabled = true;
    const reconciler = createJobScheduleReconciler({
      planes: ["studio", "neon", "mesh"],
      catalog: createJobDefinitionCatalog([definition]),
      scheduler: { upsert, remove, listScheduleIds: async () => ["neon:schedule-1"] },
      repository: {
        listActive: async (planeKey) => enabled && planeKey === "neon" ? [{
          id: "schedule-1",
          planeKey,
          code: "notification-discovery",
          handlerType: definition.code,
          definition: {
            scheduleId: "notification-discovery",
            queue: definition.queue,
            name: definition.name,
            data: { planeKey },
            pattern: { kind: "interval", everyMs: 60_000 },
          },
        }] : [],
        markReconciled,
      },
      now: () => new Date("2026-08-09T00:00:00.000Z"),
    });

    await expect(reconciler.reconcile()).resolves.toEqual({ upserted: 1, removed: 0 });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "neon:schedule-1" }));
    expect(markReconciled).toHaveBeenCalledWith(expect.objectContaining({ planeKey: "neon" }));

    enabled = false;
    await expect(reconciler.reconcile()).resolves.toEqual({ upserted: 0, removed: 1 });
    expect(remove).toHaveBeenCalledWith("neon:schedule-1");
  });

  it("records only explicitly governed jobs during migration", async () => {
    const recordEnqueued = vi.fn(async () => ({ executionId: "execution-1", executionKey: "key-1" }));
    const lifecycle = createJobExecutionLifecycle({
      store: {
        recordEnqueued,
        recordStarted: async () => undefined,
        recordCompleted: async () => undefined,
        recordFailed: async () => undefined,
      },
    });
    await lifecycle.enqueued({
      jobId: "job-1",
      queue: "notifications",
      name: "deliver",
      data: {},
      maxAttempts: 3,
      executionKey: "key-1",
      execution: {
        planeKey: "mesh",
        scope: "tenant",
        tenantId: "tenant-1",
        principalId: "principal-1",
      },
      enqueuedAt: "2026-08-09T00:00:00.000Z",
    });
    expect(recordEnqueued).toHaveBeenCalledWith(expect.objectContaining({
      planeKey: "mesh",
      tenantId: "tenant-1",
      principalId: "principal-1",
    }));
  });

  it("governs retry and replay through durable command evidence", async () => {
    const recordCommand = vi.fn(async () => undefined);
    const enqueue = vi.fn(async () => "replacement-job");
    const retry = vi.fn(async () => true);
    const service = createJobAdministrationService({
      store: {
        load: async () => ({
          executionId: "11111111-1111-4111-8111-111111111111",
          executionKey: "delivery-1",
          jobId: "job-1",
          queue: "notifications.delivery",
          name: "notifications.dispatch",
          data: { tenantId: "22222222-2222-4222-8222-222222222222" },
          maxAttempts: 5,
        }),
        recordCommand,
        listDeadLetters: async () => [],
      },
      transport: { cancel: async () => false, retry },
      publisher: { enqueue },
    });
    const request = {
      executionId: "11111111-1111-4111-8111-111111111111",
      execution: {
        planeKey: "neon" as const,
        scope: "tenant" as const,
        tenantId: "22222222-2222-4222-8222-222222222222",
        principalId: "33333333-3333-4333-8333-333333333333",
      },
      reason: "Operator-approved recovery",
    };
    await expect(service.retry(request)).resolves.toMatchObject({ applied: true, jobId: "job-1" });
    await expect(service.replay(request)).resolves.toMatchObject({ applied: true, jobId: "replacement-job" });
    expect(retry).toHaveBeenCalledWith("notifications.delivery", "job-1");
    expect(enqueue).toHaveBeenCalledWith(
      "notifications.delivery",
      "notifications.dispatch",
      expect.any(Object),
      expect.objectContaining({ execution: request.execution, maxAttempts: 5 }),
    );
    expect(recordCommand).toHaveBeenCalledTimes(2);
  });
});
