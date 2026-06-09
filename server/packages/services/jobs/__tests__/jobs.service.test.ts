import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const queueInstances: Array<{
    name: string;
    close: ReturnType<typeof vi.fn>;
    upsertJobScheduler: ReturnType<typeof vi.fn>;
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
});
