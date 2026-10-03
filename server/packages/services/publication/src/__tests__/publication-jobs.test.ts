import { describe, expect, it, vi } from "vitest";
import type { JobEnvelope, JobPublisher } from "@athyper/server-contract-jobs";
import {
  enqueueApply,
  COMPILE_PUBLICATION_ARTIFACT_JOB,
  DISPATCH_PUBLICATION_JOB,
  PUBLICATION_APPLY_QUEUE,
  PUBLICATION_AUTHORITY_QUEUE,
  ROLLBACK_PUBLICATION_RELEASE_JOB,
  SIGN_PUBLICATION_ARTIFACT_JOB,
  createPublicationAuthorityHandlers,
  createPublicationRollbackHandler,
  createPublicationRecoveryHandler,
  type PublicationAuthorityWork,
} from "../publication-jobs.js";

const context = {
  signal: new AbortController().signal,
  attempt: 1,
  reportProgress: async () => undefined,
};
const envelope = <Name extends string, Payload extends object>(
  name: Name,
  data: Payload,
): JobEnvelope<Name, Payload> => ({
  id: `job-${name}`,
  name,
  queue: PUBLICATION_AUTHORITY_QUEUE,
  data,
  attempt: 1,
  maxAttempts: 5,
  enqueuedAt: "2026-08-10T00:00:00.000Z",
});

describe("Publication authority jobs", () => {
  it("enqueues recovered deployments with the discovered tenant and target principal", async () => {
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const deploymentId = "22222222-2222-4222-8222-222222222222";
    const enqueue = vi.fn(async () => "queued");
    const handler = createPublicationRecoveryHandler(
      { page: vi.fn(async after => after ? [] : [{ tenantId, deploymentId, targetPlane: "neon" as const, createdAt: new Date("2026-08-10") }]) },
      { enqueue },
      async coordinate => ({ planeKey: coordinate.targetPlane, tenantId: coordinate.tenantId,
        principalId: "33333333-3333-4333-8333-333333333333", scope: "tenant" }),
    );
    await handler.handle(envelope("publication.recover-stalled", {}), context);
    expect(enqueue).toHaveBeenCalledWith(PUBLICATION_APPLY_QUEUE, "publication.apply-release",
      { deploymentId, targetPlane: "neon" },
      expect.objectContaining({ execution: expect.objectContaining({ tenantId, scope: "tenant", planeKey: "neon" }) }));
  });
  it("retries an interrupted batch with the same deduplicated tenant coordinates", async () => {
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const deployments = ["22222222-2222-4222-8222-222222222221", "22222222-2222-4222-8222-222222222222"]
      .map((deploymentId, index) => ({ tenantId, deploymentId, targetPlane: "neon" as const,
        createdAt: new Date(`2026-08-10T00:0${index}:00Z`) }));
    let failSecond = true;
    const enqueue = vi.fn(async (...args: unknown[]) => {
      const payload = args[2] as { deploymentId: string };
      if (failSecond && payload.deploymentId === deployments[1]!.deploymentId) {
        failSecond = false;
        throw new Error("queue unavailable");
      }
      return "queued";
    });
    const handler = createPublicationRecoveryHandler(
      { page: async after => after ? [] : deployments },
      { enqueue },
      async coordinate => ({ planeKey: coordinate.targetPlane, tenantId: coordinate.tenantId,
        principalId: "33333333-3333-4333-8333-333333333333", scope: "tenant" }),
    );
    await expect(handler.handle(envelope("publication.recover-stalled", {}), context)).rejects.toThrow("queue unavailable");
    await expect(handler.handle(envelope("publication.recover-stalled", {}), context))
      .resolves.toMatchObject({ output: { recovered: 2 } });
    expect(enqueue).toHaveBeenCalledTimes(4);
    const calls = enqueue.mock.calls as unknown as Array<[unknown, unknown, unknown, { enqueueKey: string; execution: { tenantId: string } }]>;
    expect(calls[0]![3].enqueueKey).toBe(calls[2]![3].enqueueKey);
    expect(calls[1]![3].enqueueKey).toBe(calls[3]![3].enqueueKey);
    expect(calls.every(call => call[3].execution.tenantId === tenantId)).toBe(true);
  });
  it("persists each step before deterministically enqueueing the next", async () => {
    const enqueued: unknown[][] = [];
    const jobs: JobPublisher = {
      enqueue: vi.fn(async (...args: unknown[]) => {
        enqueued.push(args);
        return String((args[3] as { enqueueKey: string }).enqueueKey);
      }),
    };
    const work: PublicationAuthorityWork = {
      compile: vi.fn(async () => ({
        compilationIds: ["11111111-1111-4111-8111-111111111111"],
      })),
      sign: vi.fn(async () => ({
        deploymentId: "22222222-2222-4222-8222-222222222222",
      })),
      dispatch: vi.fn(async () => ({
        deploymentId: "22222222-2222-4222-8222-222222222222",
        targetPlane: "neon" as const,
      })),
      acknowledge: vi.fn(),
      recoverStalled: vi.fn(async () => []),
    };
    const handlers = createPublicationAuthorityHandlers(work, jobs);
    await handlers[COMPILE_PUBLICATION_ARTIFACT_JOB]!.handle(
      envelope(COMPILE_PUBLICATION_ARTIFACT_JOB, {
        releaseId: "33333333-3333-4333-8333-333333333333",
      }),
      context,
    );
    expect(enqueued[0]?.slice(0, 3)).toEqual([
      PUBLICATION_AUTHORITY_QUEUE,
      SIGN_PUBLICATION_ARTIFACT_JOB,
      { compilationId: "11111111-1111-4111-8111-111111111111" },
    ]);
    await handlers[SIGN_PUBLICATION_ARTIFACT_JOB]!.handle(
      envelope(SIGN_PUBLICATION_ARTIFACT_JOB, {
        compilationId: "11111111-1111-4111-8111-111111111111",
      }),
      context,
    );
    expect(enqueued[1]?.slice(0, 3)).toEqual([
      PUBLICATION_AUTHORITY_QUEUE,
      DISPATCH_PUBLICATION_JOB,
      { deploymentId: "22222222-2222-4222-8222-222222222222" },
    ]);
    await handlers[DISPATCH_PUBLICATION_JOB]!.handle(
      envelope(DISPATCH_PUBLICATION_JOB, {
        deploymentId: "22222222-2222-4222-8222-222222222222",
      }),
      context,
    );
    expect(enqueued[2]?.slice(0, 3)).toEqual([
      PUBLICATION_APPLY_QUEUE,
      "publication.apply-release",
      {
        deploymentId: "22222222-2222-4222-8222-222222222222",
        targetPlane: "neon",
      },
    ]);
    expect((enqueued[2]?.[3] as { enqueueKey: string }).enqueueKey).toBe(
      "publication:22222222-2222-4222-8222-222222222222:apply:neon:1",
    );
  });
  it("carries tenant execution through compilation, signing and apply", async () => {
    const execution = {
      planeKey: "studio" as const,
      scope: "tenant" as const,
      tenantId: "tenant",
      principalId: "worker",
    };
    const enqueue = vi.fn(async () => "transport-safe-id");
    const work: PublicationAuthorityWork = {
      compile: async () => ({ compilationIds: ["compilation"] }),
      sign: async () => ({ deploymentId: "deployment" }),
      dispatch: async () => ({
        deploymentId: "deployment",
        targetPlane: "neon",
      }),
      acknowledge: async () => {},
      recoverStalled: async () => [],
    };
    const handlers = createPublicationAuthorityHandlers(work, { enqueue });
    for (const [name, data] of [
      [COMPILE_PUBLICATION_ARTIFACT_JOB, { releaseId: "release" }],
      [SIGN_PUBLICATION_ARTIFACT_JOB, { compilationId: "compilation" }],
      [DISPATCH_PUBLICATION_JOB, { deploymentId: "deployment" }],
    ] as const) {
      await handlers[name]!.handle(
        { ...envelope(name, data), execution },
        context,
      );
    }
    expect(
      enqueue.mock.calls.map((call) => (call as unknown as unknown[])[3]),
    ).toEqual([
      expect.objectContaining({ execution, enqueueKey: expect.any(String) }),
      expect.objectContaining({ execution, enqueueKey: expect.any(String) }),
      expect.objectContaining({
        execution: { ...execution, planeKey: "neon" },
        enqueueKey: expect.any(String),
      }),
    ]);
  });
  it("executes governed rollback as durable worker work", async () => {
    const rollback = vi.fn(async () => ({
      id: "applied-1",
      publicationKey: "metadata.entity.invoice",
      deploymentId: "deployment-1",
      sourceReleaseId: "release-1",
      sourceReleaseNo: 1,
      artifactHash: "a".repeat(64),
      status: "active" as const,
      stagedAt: "2026-08-10T00:00:00.000Z",
      activatedAt: "2026-08-10T00:01:00.000Z",
    }));
    const handler = createPublicationRollbackHandler({
      neon: { rollback } as never,
    });
    const result = await handler.handle(
      { ...envelope(ROLLBACK_PUBLICATION_RELEASE_JOB, {
        tenantId: "tenant",
        publicationKey: "metadata.entity.invoice",
        targetAppliedReleaseId: "applied-1",
        targetPlane: "neon",
        reason: "canary",
        actorId: "operator",
      }), execution: { scope: "tenant" as const, tenantId: "tenant", planeKey: "neon" as const, principalId: "operator" } },
      context,
    );
    expect(rollback).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationKey: "metadata.entity.invoice",
        targetAppliedReleaseId: "applied-1",
      }),
    );
    expect(result).toMatchObject({
      status: "completed",
      output: { activeAppliedReleaseId: "applied-1", targetPlane: "neon" },
    });
  });
});

it("compile-only workers sign without enqueueing dispatch and defer queued dispatch jobs", async () => {
  const enqueue = vi.fn(async () => "job");
  const resolve = vi.fn();
  const sign = vi.fn(async () => ({
    deploymentId: "22222222-2222-4222-8222-222222222222",
  }));
  const dispatch = vi.fn();
  const handlers = createPublicationAuthorityHandlers(
    { sign, dispatch } as unknown as PublicationAuthorityWork,
    { enqueue },
    resolve,
    { dispatchEnabled: false },
  );
  await handlers[SIGN_PUBLICATION_ARTIFACT_JOB]!.handle(
    envelope(SIGN_PUBLICATION_ARTIFACT_JOB, {
      compilationId: "11111111-1111-4111-8111-111111111111",
    }),
    context,
  );
  expect(sign).toHaveBeenCalledOnce();
  expect(enqueue).not.toHaveBeenCalled();
  await handlers[DISPATCH_PUBLICATION_JOB]!.handle(
    envelope(DISPATCH_PUBLICATION_JOB, {
      deploymentId: "22222222-2222-4222-8222-222222222222",
    }),
    context,
  );
  expect(dispatch).not.toHaveBeenCalled();
  expect(resolve).not.toHaveBeenCalled();
  expect(enqueue).not.toHaveBeenCalled();
});

it("gives reviewed compiler reconciliation a stable fresh queue key without changing deployment or publisher", async () => {
  const enqueue=vi.fn(async()=>"job"),jobs={enqueue} as unknown as JobPublisher;
  const payload={deploymentId:"00000000-0000-4000-8000-000000000001",targetPlane:"neon" as const};
  const execution={scope:"tenant" as const,tenantId:"tenant",principalId:"publisher",planeKey:"neon" as const};
  await enqueueApply(jobs,payload,execution);
  await enqueueApply(jobs,payload,execution,"a".repeat(64));
  await enqueueApply(jobs,payload,execution,"a".repeat(64));
  const calls=enqueue.mock.calls as unknown as [string,string,unknown,{enqueueKey:string;execution:unknown}][];
  expect(calls[0]![3].enqueueKey).not.toBe(calls[1]![3].enqueueKey);
  expect(calls[1]![3].enqueueKey).toBe(calls[2]![3].enqueueKey);
  expect(calls[1]![2]).toEqual(payload);expect(calls[1]![3].execution).toEqual(execution);
  await expect(enqueueApply(jobs,payload,execution,"unreviewed-key")).rejects.toThrow("PUBLICATION_RECONCILIATION_KEY_INVALID");
  expect(enqueue).toHaveBeenCalledTimes(3);
});
