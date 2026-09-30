import { expect, it, vi } from "vitest";
import {
  createPublicationRecoveryHandler,
  RECOVER_STALLED_PUBLICATIONS_JOB,
  PUBLICATION_MAINTENANCE_QUEUE,
} from "./publication-jobs.js";
import type {
  JobEnvelope,
  JobExecutionContext,
} from "@athyper/server-contract-jobs";
import type { PublicationRecoveryPayload } from "./publication-jobs.js";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const job = (
  data: PublicationRecoveryPayload = {},
): JobEnvelope<
  typeof RECOVER_STALLED_PUBLICATIONS_JOB,
  PublicationRecoveryPayload
> => ({
  id: "recovery-run",
  name: RECOVER_STALLED_PUBLICATIONS_JOB,
  queue: PUBLICATION_MAINTENANCE_QUEUE,
  data,
  attempt: 1,
  maxAttempts: 3,
  enqueuedAt: "2026-09-30T00:00:00Z",
  execution: { planeKey: "studio", scope: "plane", principalId: id(1) },
});
const context = {
  signal: new AbortController().signal,
  attempt: 1,
  reportProgress: async () => {},
} as JobExecutionContext;

it("continues past the per-job budget without losing timestamp precision or later tenants", async () => {
  const enqueue = vi.fn(async () => "queued");
  const coordinates = Array.from({ length: 5001 }, (_, i) => ({
    tenantId: id((i % 2) + 1),
    deploymentId: id(i + 10),
    targetPlane: "neon" as const,
    createdAt: "2026-09-30 00:00:00.123456+00",
  }));
  const handler = createPublicationRecoveryHandler(
    {
      page: async (after, limit) => {
        const offset = after
          ? coordinates.findIndex(
              (c) => c.deploymentId === after.deploymentId,
            ) + 1
          : 0;
        return coordinates.slice(offset, offset + limit);
      },
    },
    { enqueue } as never,
    async (c) => ({
      scope: "tenant",
      planeKey: c.targetPlane,
      tenantId: c.tenantId,
      principalId: id(3),
    }),
  );
  await expect(handler.handle(job(), context)).resolves.toMatchObject({
    output: { recovered: 5000 },
  });
  const calls = enqueue.mock.calls as unknown as Array<
    [string, string, PublicationRecoveryPayload]
  >;
  const continuation = calls.find(
    (call) => call[1] === RECOVER_STALLED_PUBLICATIONS_JOB,
  )!;
  expect(continuation[2].after?.createdAt).toBe(
    "2026-09-30 00:00:00.123456+00",
  );
  await expect(
    handler.handle(job(continuation[2]), context),
  ).resolves.toMatchObject({ output: { recovered: 1 } });
});

it("cannot enqueue when discovery auditing fails", async () => {
  const enqueue = vi.fn(async () => "queued");
  const handler = createPublicationRecoveryHandler(
    {
      page: async () => [
        {
          tenantId: id(1),
          deploymentId: id(2),
          targetPlane: "neon",
          createdAt: new Date(),
        },
      ],
    },
    { enqueue },
    async () => ({
      scope: "tenant",
      planeKey: "neon",
      tenantId: id(1),
      principalId: id(3),
    }),
    undefined,
    async () => {
      throw new Error("audit unavailable");
    },
  );
  await expect(handler.handle(job(), context)).rejects.toThrow(
    "audit unavailable",
  );
  expect(enqueue).not.toHaveBeenCalled();
});
