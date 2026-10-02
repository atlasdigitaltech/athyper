import type { JobEnvelope, JobExecutionCoordinate } from "@athyper/server-contract-jobs";
import { describe, expect, it, vi } from "vitest";
import {
  createPublicationRollbackHandler,
  PUBLICATION_APPLY_QUEUE,
  ROLLBACK_PUBLICATION_RELEASE_JOB,
  type PublicationRollbackPayload,
} from "./publication-jobs.js";

const payload: PublicationRollbackPayload = {
  tenantId: "tenant-a",
  publicationKey: "metadata.entity.country",
  targetAppliedReleaseId: "applied-release",
  targetPlane: "neon",
  reason: "qualified recovery",
  actorId: "operator-a",
};
const execution: JobExecutionCoordinate = {
  scope: "tenant", tenantId: payload.tenantId,
  planeKey: payload.targetPlane, principalId: payload.actorId,
};
const job: JobEnvelope<typeof ROLLBACK_PUBLICATION_RELEASE_JOB, PublicationRollbackPayload> = {
  id: "rollback-job", name: ROLLBACK_PUBLICATION_RELEASE_JOB,
  queue: PUBLICATION_APPLY_QUEUE, data: payload, execution,
  attempt: 1, maxAttempts: 3, enqueuedAt: "2026-10-01T00:00:00Z",
};
const context = {
  signal: new AbortController().signal, attempt: 1,
  reportProgress: async () => undefined,
};

describe("rollback worker qualification", () => {
  it("uses the durable job identity instead of a caller-supplied operation ID", async () => {
    const rollback = vi.fn(async (): Promise<never> => { throw Object.assign(Error("stop"), { retryable: false }); });
    const handler = createPublicationRollbackHandler({ neon: { rollback } });
    await expect(handler.handle({ ...job, data: { ...payload, operationId: "caller-substitution" } }, context)).rejects.toThrow();
    expect(rollback).toHaveBeenCalledExactlyOnceWith({ ...payload, operationId: job.id });
  });
  it.each([
    undefined,
    { ...execution, scope: "plane" as const },
    { ...execution, tenantId: "tenant-b" },
    { ...execution, planeKey: "mesh" as const },
    { ...execution, principalId: "operator-b" },
  ])("rejects substituted execution coordinates before reaching storage: %j", async coordinate => {
    const rollback = vi.fn(async (): Promise<never> => { throw Error("must not execute"); });
    const handler = createPublicationRollbackHandler({ neon: { rollback } });
    const { execution: _execution, ...withoutExecution } = job;
    await expect(handler.handle({ ...withoutExecution, ...(coordinate ? { execution: coordinate } : {}) }, context))
      .rejects.toMatchObject({ code: "PUBLICATION_ROLLBACK_EXECUTION_MISMATCH", retryable: false });
    expect(rollback).not.toHaveBeenCalled();
  });

  it.each([
    ["23514", false],
    ["42501", false],
    ["ACTIVATION_REGRESSION", false],
    ["PUBLICATION_ROLLBACK_TENANT_MAPPING_REQUIRED", false],
    ["PUBLICATION_ROLLBACK_PLANE_MISMATCH", false],
    ["ECONNRESET", true],
    ["40001", true],
    ["40P01", true],
  ])("classifies %s without leaking dependency details", async (code, retryable) => {
    const rollback = vi.fn(async (): Promise<never> => {
      throw Object.assign(Error("private database and credential details"), { code });
    });
    const handler = createPublicationRollbackHandler({ neon: { rollback } });
    const result = handler.handle(job, context);
    await expect(result).rejects.toMatchObject({ code, retryable });
    await expect(result).rejects.not.toThrow("private database");
    expect(rollback).toHaveBeenCalledExactlyOnceWith({ ...payload, operationId: job.id });
  });

  it("honors a permanent denial expressed through the executor error contract", async () => {
    const handler = createPublicationRollbackHandler({ neon: {
      rollback: async () => { throw Object.assign(Error("approval revoked"), { code: "APPROVAL_REVOKED", retryable: false }); },
    } });
    await expect(handler.handle(job, context)).rejects.toMatchObject({ code: "APPROVAL_REVOKED", retryable: false });
  });

  it("recognizes the existing executor's message-only tenant mapping denial", async () => {
    const handler = createPublicationRollbackHandler({ neon: {
      rollback: async () => { throw Error("PUBLICATION_ROLLBACK_TENANT_MAPPING_REQUIRED"); },
    } });
    await expect(handler.handle(job, context)).rejects.toMatchObject({ code: "PUBLICATION_ROLLBACK_TENANT_MAPPING_REQUIRED", retryable: false });
  });

  it("stops retrying a message-only rollback head mismatch from the repository", async () => {
    const rollback = vi.fn(async (): Promise<never> => { throw Error("LOCAL_ROLLBACK_HEAD_MISMATCH"); });
    const handler = createPublicationRollbackHandler({ neon: { rollback } });
    await expect(handler.handle(job, context)).rejects.toMatchObject({ code: "LOCAL_ROLLBACK_HEAD_MISMATCH", retryable: false });
    expect(rollback).toHaveBeenCalledExactlyOnceWith({ ...payload, operationId: job.id });
  });
});
