import { expect, it, vi } from "vitest";
import type {
  JobEnvelope,
  JobExecutionContext,
} from "@athyper/server-contract-jobs";
import {
  createLocalPublicationPreparationHandler,
  enqueueLocalPublicationPreparation,
  PREPARE_LOCAL_PUBLICATION_JOB,
} from "./local-publication-job.js";
const configuration = {
  environment: "local",
  instance: "dev",
  domainSuffix: "dev.athyper.test",
  tenantId: "tenant",
  realmKey: "platform-control",
  author: {
    principalId: "author",
    code: "dev.metadata.author",
    authEpoch: 1,
    credentialSha256: "a".repeat(64),
  },
  publisher: {
    principalId: "publisher",
    code: "dev.metadata.publisher",
    authEpoch: 1,
    credentialSha256: "b".repeat(64),
  },
  localAuthority: { id: "authority", version: 1, hash: "c".repeat(64) },
};
const hash = "d".repeat(64);
const job: JobEnvelope<
  typeof PREPARE_LOCAL_PUBLICATION_JOB,
  { requestHash: string }
> = {
  id: "job",
  name: PREPARE_LOCAL_PUBLICATION_JOB,
  queue: "publication.authority",
  data: { requestHash: hash },
  attempt: 1,
  maxAttempts: 5,
  enqueuedAt: new Date().toISOString(),
  execution: {
    planeKey: "studio",
    scope: "tenant",
    tenantId: "tenant",
    principalId: "publisher",
  },
  payloadSchema: { name: PREPARE_LOCAL_PUBLICATION_JOB, version: 1 },
};
const context = (): JobExecutionContext => ({
  signal: new AbortController().signal,
  attempt: 1,
  reportProgress: vi.fn(async () => {}),
});
it("retries admission delivery with one deterministic queue coordinate", async () => {
  const enqueue = vi
    .fn()
    .mockRejectedValueOnce(Error("queue unavailable"))
    .mockResolvedValue("job");
  const options = {
    configuration,
    jobs: { enqueue },
    admittedRequestHash: hash,
  };
  await expect(enqueueLocalPublicationPreparation(options)).rejects.toThrow(
    "queue unavailable",
  );
  await expect(enqueueLocalPublicationPreparation(options)).resolves.toBe(
    "job",
  );
  expect(enqueue.mock.calls[0]).toEqual(enqueue.mock.calls[1]);
  expect(enqueue.mock.calls[1]![2]).toEqual({ requestHash: hash });
});
it("resumes after a review failure through idempotent production transitions", async () => {
  const transition = vi.fn(
    async (requestHash: string, phase: "submit" | "review") => ({
      basis: "local_development_authority" as const,
      requestHash,
      revision: phase === "submit" ? 2 : 3,
      status:
        phase === "submit" ? ("in_review" as const) : ("approved" as const),
      replayed: false,
    }),
  );
  transition
    .mockResolvedValueOnce({
      basis: "local_development_authority",
      requestHash: hash,
      revision: 2,
      status: "in_review",
      replayed: false,
    })
    .mockRejectedValueOnce(Error("source revoked"));
  const handler = createLocalPublicationPreparationHandler({
    configuration,
    transition,
  });
  await expect(handler.handle(job, context())).rejects.toThrow(
    "source revoked",
  );
  expect(transition).toHaveBeenCalledTimes(2);
  transition.mockClear();
  const result = await handler.handle(job, context());
  expect(transition.mock.calls).toEqual([
    [hash, "submit"],
    [hash, "review"],
  ]);
  expect(result).toEqual({
    status: "completed",
    output: {
      requestHash: hash,
      stage: "approved",
      basis: "local_development_authority",
    },
  });
});
it("rejects forged execution scope and extra queued authority before calling composition", async () => {
  const transition = vi.fn();
  const handler = createLocalPublicationPreparationHandler({
    configuration,
    transition,
  });
  for (const altered of [
    { ...job, execution: { ...job.execution!, principalId: "developer" } },
    { ...job, execution: { ...job.execution!, tenantId: "other" } },
    { ...job, data: { requestHash: hash, authority: { active: true } } },
    {
      ...job,
      payloadSchema: { name: PREPARE_LOCAL_PUBLICATION_JOB, version: 2 },
    },
  ]) {
    await expect(handler.handle(altered, context())).rejects.toThrow(
      "JOB_SCOPE_DENIED",
    );
  }
  expect(transition).not.toHaveBeenCalled();
  expect(() =>
    createLocalPublicationPreparationHandler({
      configuration: { ...configuration, instance: "qa" },
      transition,
    }),
  ).toThrow("DEV_ONLY");
});
it("cancellation prevents the next durable phase", async () => {
  const abort = new AbortController();
  const transition = vi.fn(async () => {
    abort.abort();
    return {
      basis: "local_development_authority" as const,
      requestHash: hash,
      revision: 2,
      status: "in_review" as const,
      replayed: false,
    };
  });
  await expect(
    createLocalPublicationPreparationHandler({
      configuration,
      transition,
    }).handle(job, { ...context(), signal: abort.signal }),
  ).rejects.toThrow();
  expect(transition).toHaveBeenCalledTimes(1);
});
it("retries dispatch of the committed release without allocating another release", async () => {
  const transition = vi.fn(async (requestHash: string) => ({
    basis: "local_development_authority" as const,
    requestHash,
    revision: 4,
    status: "published" as const,
    replayed: true,
  }));
  const release = vi
    .fn()
    .mockResolvedValue({ id: "committed", releaseNo: 3, replayed: true });
  const dispatch = vi
    .fn()
    .mockRejectedValueOnce(Error("queue unavailable"))
    .mockResolvedValue(undefined);
  const handler = createLocalPublicationPreparationHandler({
    configuration,
    transition,
    release,
    dispatch,
  });
  await expect(handler.handle(job, context())).rejects.toThrow(
    "queue unavailable",
  );
  await expect(handler.handle(job, context())).resolves.toMatchObject({
    output: { stage: "dispatched", releaseId: "committed" },
  });
  expect(dispatch.mock.calls).toEqual([["committed"], ["committed"]]);
  expect(() =>
    createLocalPublicationPreparationHandler({
      configuration,
      transition,
      release,
    }),
  ).toThrow("RELEASE_DISPATCH_REQUIRED");
});

it("executes admitted rollback without source transitions, compilation or a new release", async () => {
  const transition = vi.fn(),
    release = vi.fn(),
    dispatch = vi.fn(),
    rollback = vi.fn(async () => true);
  const handler = createLocalPublicationPreparationHandler({
    configuration,
    transition,
    release,
    dispatch,
    rollback,
  });
  expect(await handler.handle(job, context())).toMatchObject({
    status: "completed",
    output: { stage: "rolled_back", requestHash: hash },
  });
  expect(rollback).toHaveBeenCalledWith(hash);
  expect(transition).not.toHaveBeenCalled();
  expect(release).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
});
it("does not fall back to publication when rollback authority rejects", async () => {
  const transition = vi.fn();
  const handler = createLocalPublicationPreparationHandler({
    configuration,
    transition,
    rollback: vi.fn(async () => {
      throw Error("LOCAL_PUBLICATION_AUTHORITY_CHANGED");
    }),
  });
  await expect(handler.handle(job, context())).rejects.toThrow(
    "LOCAL_PUBLICATION_AUTHORITY_CHANGED",
  );
  expect(transition).not.toHaveBeenCalled();
});
