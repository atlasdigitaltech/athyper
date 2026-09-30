import { describe, expect, it, vi } from "vitest";
import {
  ExternalWorkerIdentityDeliveryWorker,
  type ExternalWorkerIdentityDeliveryItem,
  type ExternalWorkerIdentityDeliveryRepository,
} from "../external-worker-identity-delivery.js";

const item: ExternalWorkerIdentityDeliveryItem = {
  outboxId: "11111111-1111-4111-8111-111111111111",
  sourceTenantId: "22222222-2222-4222-8222-222222222222",
  eventType: "workforce.external_worker.identity_projection.requested",
  attempt: 1,
  maxAttempts: 3,
  payload: {},
};
function harness(
  consume: () => Promise<{
    disposition: "applied" | "replayed" | "stale" | "conflict";
  }>,
) {
  const repository = {
    claim: vi.fn(async () => [item]),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
  } satisfies ExternalWorkerIdentityDeliveryRepository;
  const worker = new ExternalWorkerIdentityDeliveryWorker({
    workerId: "worker",
    repository,
    consumer: async () => ({ consume }) as never,
    now: () => new Date("2026-09-03T00:00:00Z"),
  });
  return { repository, worker };
}
describe("external-worker identity delivery", () => {
  it("completes applied, replayed and stale recipient dispositions", async () => {
    for (const disposition of ["applied", "replayed", "stale"] as const) {
      const value = harness(async () => ({ disposition }));
      expect(await value.worker.deliver()).toEqual({ [disposition]: 1 });
      expect(value.repository.complete).toHaveBeenCalledWith(item, disposition);
    }
  });
  it("dead-letters a recipient projection conflict for reconciliation", async () => {
    const value = harness(async () => ({ disposition: "conflict" }));
    expect(await value.worker.deliver()).toEqual({ conflict: 1 });
    expect(value.repository.fail).toHaveBeenCalledWith(item, {
      code: "EXTERNAL_WORKER_INTENT_PROJECTION_CONFLICT",
      message: "Studio rejected a conflicting desired projection",
      permanent: true,
    });
    expect(value.repository.complete).not.toHaveBeenCalled();
  });
  it("retries missing Studio dependencies with bounded backoff", async () => {
    const error = Object.assign(new Error("organization pending"), {
        code: "EXTERNAL_WORKER_INTENT_ORGANIZATION_MISSING",
      }),
      value = harness(async () => {
        throw error;
      });
    expect(await value.worker.deliver()).toEqual({ retry: 1 });
    expect(value.repository.fail).toHaveBeenCalledWith(
      item,
      expect.objectContaining({
        permanent: false,
        retryAt: "2026-09-03T00:00:05.000Z",
      }),
    );
  });
  it("dead-letters unsafe envelopes without logging payload content", async () => {
    const error = Object.assign(new Error("bad hash"), {
        code: "EXTERNAL_WORKER_INTENT_HASH_INVALID",
      }),
      capture = vi.fn(),
      repository = {
        claim: vi.fn(async () => [item]),
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined),
      } satisfies ExternalWorkerIdentityDeliveryRepository,
      worker = new ExternalWorkerIdentityDeliveryWorker({
        workerId: "worker",
        repository,
        consumer: async () =>
          ({
            consume: async () => {
              throw error;
            },
          }) as never,
        capture,
      });
    expect(await worker.deliver()).toEqual({ dead_letter: 1 });
    expect(repository.fail).toHaveBeenCalledWith(
      item,
      expect.objectContaining({
        permanent: true,
        code: "EXTERNAL_WORKER_INTENT_HASH_INVALID",
      }),
    );
    expect(capture).toHaveBeenCalledWith(error, item);
  });
  it("admits the internal-workforce event on the same bounded worker contract", async () => {
    const internal = {
        ...item,
        eventType: "workforce.employee.identity_projection.requested" as const,
      },
      repository = {
        claim: vi.fn(async () => [internal]),
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined),
      } satisfies ExternalWorkerIdentityDeliveryRepository,
      worker = new ExternalWorkerIdentityDeliveryWorker({
        workerId: "worker",
        repository,
        consumer: async () =>
          ({ consume: async () => ({ disposition: "applied" }) }) as never,
      });
    expect(await worker.deliver()).toEqual({ applied: 1 });
    expect(repository.complete).toHaveBeenCalledWith(internal, "applied");
  });
});
