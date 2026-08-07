import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const queueInstances: Array<{
    name: string;
    close: ReturnType<typeof vi.fn>;
    upsertJobScheduler: ReturnType<typeof vi.fn>;
    removeJobScheduler: ReturnType<typeof vi.fn>;
    getJobCounts: ReturnType<typeof vi.fn>;
  }> = [];

  const makeWorker = () => ({
    name: "mock-worker",
    on: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  });

  const Queue = vi.fn(function MockQueue(name: string) {
    const queue = {
      name,
      close: vi.fn(() => Promise.resolve()),
      upsertJobScheduler: vi.fn(() => Promise.resolve()),
      removeJobScheduler: vi.fn(() => Promise.resolve()),
      getJobCounts: vi.fn(() => Promise.resolve({})),
    };
    queueInstances.push(queue);
    return queue;
  });

  return {
    queueInstances,
    Queue,
    Worker: vi.fn(function MockWorker() {
      return makeWorker();
    }),
    createLifecycleTimerWorker: vi.fn(makeWorker),
    createNotificationWorker: vi.fn(makeWorker),
    createDomainOutboxWorker: vi.fn(makeWorker),
    createSlaCheckWorker: vi.fn(makeWorker),
    createImportWorker: vi.fn(makeWorker),
    createCmsPreviewWorker: vi.fn(makeWorker),
    createRenderDocumentWorker: vi.fn(makeWorker),
    createKcSyncWorker: vi.fn(makeWorker),
    createEndpointHealthWorker: vi.fn(makeWorker),
    createTikaExtractWorker: vi.fn(makeWorker),
    createBackupWorker: vi.fn(makeWorker),
    createStaleLockWorker: vi.fn(makeWorker),
    createAtlasConversationPurgeWorker: vi.fn(makeWorker),
    createAtlasToolInvocationRecoveryWorker: vi.fn(makeWorker),
  };
});

vi.mock("bullmq", () => ({
  Queue: mocks.Queue,
  Worker: mocks.Worker,
}));

vi.mock("../workers/lifecycle-timer.worker.js", () => ({
  createLifecycleTimerWorker: mocks.createLifecycleTimerWorker,
}));
vi.mock("../workers/notification.worker.js", () => ({
  createNotificationWorker: mocks.createNotificationWorker,
}));
vi.mock("../workers/domain-outbox.worker.js", () => ({
  createDomainOutboxWorker: mocks.createDomainOutboxWorker,
}));
vi.mock("../workers/sla-check.worker.js", () => ({
  createSlaCheckWorker: mocks.createSlaCheckWorker,
}));
vi.mock("../workers/import.worker.js", () => ({
  createImportWorker: mocks.createImportWorker,
}));
vi.mock("../workers/cms-preview.worker.js", () => ({
  createCmsPreviewWorker: mocks.createCmsPreviewWorker,
}));
vi.mock("../workers/render-document.worker.js", () => ({
  createRenderDocumentWorker: mocks.createRenderDocumentWorker,
}));
vi.mock("../workers/kc-sync.worker.js", () => ({
  createKcSyncWorker: mocks.createKcSyncWorker,
}));
vi.mock("../workers/endpoint-health.worker.js", () => ({
  createEndpointHealthWorker: mocks.createEndpointHealthWorker,
}));
vi.mock("../workers/tika-extract.worker.js", () => ({
  createTikaExtractWorker: mocks.createTikaExtractWorker,
}));
vi.mock("../workers/backup.worker.js", () => ({
  createBackupWorker: mocks.createBackupWorker,
}));
vi.mock("../workers/stale-lock.worker.js", () => ({
  createStaleLockWorker: mocks.createStaleLockWorker,
}));
vi.mock("../workers/atlas-conversation-purge.worker.js", () => ({
  createAtlasConversationPurgeWorker:
    mocks.createAtlasConversationPurgeWorker,
}));
vi.mock("../workers/atlas-tool-invocation-recovery.worker.js", () => ({
  createAtlasToolInvocationRecoveryWorker:
    mocks.createAtlasToolInvocationRecoveryWorker,
}));

import { createJobsService, type JobsServiceDeps } from "../jobs.service.js";

const workerFactories = [
  mocks.createLifecycleTimerWorker,
  mocks.createNotificationWorker,
  mocks.createDomainOutboxWorker,
  mocks.createSlaCheckWorker,
  mocks.createImportWorker,
  mocks.createCmsPreviewWorker,
  mocks.createRenderDocumentWorker,
  mocks.createKcSyncWorker,
  mocks.createEndpointHealthWorker,
  mocks.createTikaExtractWorker,
  mocks.createBackupWorker,
  mocks.createStaleLockWorker,
  mocks.createAtlasConversationPurgeWorker,
  mocks.createAtlasToolInvocationRecoveryWorker,
];

function makeDeps(overrides: Partial<JobsServiceDeps> = {}): JobsServiceDeps {
  return {
    db: {} as JobsServiceDeps["db"],
    connection: {} as JobsServiceDeps["connection"],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    ...overrides,
  };
}

describe("createJobsService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueInstances.length = 0;
  });

  it("creates queue handles but no BullMQ worker consumers when workersEnabled is false", () => {
    const service = createJobsService(makeDeps({ workersEnabled: false }));

    expect(service.workersEnabled).toBe(false);
    expect(mocks.Queue).toHaveBeenCalled();
    expect(mocks.Worker).not.toHaveBeenCalled();
    for (const factory of workerFactories) {
      expect(factory).not.toHaveBeenCalled();
    }
  });

  it("exposes Tika extraction capability without creating a local Tika worker when workers are disabled", () => {
    const service = createJobsService(makeDeps({
      workersEnabled: false,
      tikaUrl: "http://docparser:9998",
      attachmentStorage: {
        get: vi.fn(() => Promise.resolve(Buffer.from(""))),
      },
    }));

    expect(service.tikaExtractEnabled).toBe(true);
    expect(service.workersEnabled).toBe(false);
    expect(mocks.createTikaExtractWorker).not.toHaveBeenCalled();
  });

  it("removes the Atlas purge scheduler and creates no worker without maintenance authority", async () => {
    const service = createJobsService(makeDeps({ workersEnabled: false }));

    await service.start();

    const queue = mocks.queueInstances.find(
      (candidate) => candidate.name === "jobs-atlas-conversation-purge",
    );
    expect(queue).toBeDefined();
    expect(queue!.removeJobScheduler).toHaveBeenCalledWith(
      "sched:atlas-conversation-purge",
    );
    expect(mocks.createAtlasConversationPurgeWorker).not.toHaveBeenCalled();
  });

  it("wires the hourly no-payload Atlas purge only with maintenance authority", async () => {
    const purgeEligible = vi.fn(() =>
      Promise.resolve({ expiredCount: 0, purgedCount: 0 }),
    );
    const service = createJobsService(makeDeps({
      workersEnabled: true,
      atlasConversationPurge: {
        service: { purgeEligible },
        batchSize: 250,
      },
    }));

    await service.start();

    const queue = mocks.queueInstances.find(
      (candidate) => candidate.name === "jobs-atlas-conversation-purge",
    );
    expect(queue).toBeDefined();
    expect(queue!.upsertJobScheduler).toHaveBeenCalledWith(
      "sched:atlas-conversation-purge",
      { every: 3_600_000 },
      { name: "atlas-conversation-purge", data: {} },
    );
    expect(mocks.createAtlasConversationPurgeWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        service: { purgeEligible },
        batchSize: 250,
      }),
    );
  });

  it("removes stale tool recovery scheduling without an authorized service", async () => {
    const service = createJobsService(makeDeps({ workersEnabled: false }));

    await service.start();

    const queue = mocks.queueInstances.find(
      (candidate) =>
        candidate.name === "jobs-atlas-tool-invocation-recovery",
    );
    expect(queue).toBeDefined();
    expect(queue!.removeJobScheduler).toHaveBeenCalledWith(
      "sched:atlas-tool-invocation-recovery",
    );
    expect(
      mocks.createAtlasToolInvocationRecoveryWorker,
    ).not.toHaveBeenCalled();
  });

  it("wires no-payload tool recovery with bounded server-owned settings", async () => {
    const recoverEligible = vi.fn(() => Promise.resolve({
      failedCount: 0,
      scopeCount: 0,
      skippedScopeCount: 0,
    }));
    const metrics = { observe: vi.fn() };
    const service = createJobsService(makeDeps({
      workersEnabled: true,
      atlasToolInvocationRecovery: {
        service: { recoverEligible },
        batchSize: 125,
        staleRunTimeoutMs: 900_000,
        metrics,
      },
    }));

    await service.start();

    const queue = mocks.queueInstances.find(
      (candidate) =>
        candidate.name === "jobs-atlas-tool-invocation-recovery",
    );
    expect(queue).toBeDefined();
    expect(queue!.upsertJobScheduler).toHaveBeenCalledWith(
      "sched:atlas-tool-invocation-recovery",
      { every: 300_000 },
      { name: "atlas-tool-invocation-recovery", data: {} },
    );
    expect(
      mocks.createAtlasToolInvocationRecoveryWorker,
    ).toHaveBeenCalledWith(expect.objectContaining({
      service: { recoverEligible },
      options: {
        batchSize: 125,
        staleRunTimeoutMs: 900_000,
      },
      metrics,
    }));
  });
});
