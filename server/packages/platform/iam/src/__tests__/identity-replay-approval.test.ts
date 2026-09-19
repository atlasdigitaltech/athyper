import { describe, expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  IdentityReplayApprovalService,
  type IdentityReplayApprovalRepository,
} from "../identity-replay-approval.js";
const context = {
  planeKey: "studio",
  tenantId: "tenant",
  principalId: "requester",
  assurance: "elevated",
} as VerifiedRequestContext;
function harness(enabled = true, allowed = true) {
  const repository = {
    create: vi.fn(),
    read: vi.fn(),
    decide: vi.fn(),
    consume: vi.fn(),
  } satisfies IdentityReplayApprovalRepository;
  const authorize = vi.fn(async () =>
    allowed
      ? { allowed: true as const }
      : { allowed: false as const, reason: "missing_permission" },
  );
  return {
    repository,
    authorize,
    service: new IdentityReplayApprovalService(
      repository,
      { authorize },
      enabled,
    ),
  };
}
describe("durable identity replay service", () => {
  it("keeps consumption disabled by default", async () => {
    const test = harness(false);
    await expect(
      test.service.replay(context, { attemptId: "a", approvalId: "r" }),
    ).rejects.toMatchObject({ code: "IAM_REPLAY_DISABLED" });
    expect(test.repository.consume).not.toHaveBeenCalled();
  });
  it.each([
    { ...context, planeKey: "neon" },
    { ...context, assurance: "baseline" },
  ])("rejects wrong plane or missing MFA", async (input) => {
    const test = harness();
    await expect(
      test.service.replay(input as VerifiedRequestContext, {
        attemptId: "a",
        approvalId: "r",
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(test.repository.consume).not.toHaveBeenCalled();
  });
  it("checks authorization before any write", async () => {
    const test = harness(true, false);
    await expect(
      test.service.create(context, { attemptId: "a", reason: "review" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(test.repository.create).not.toHaveBeenCalled();
  });
  it("passes verified context and tenant-bound governance coordinates to the atomic repository", async () => {
    const test = harness();
    const input = { attemptId: "a", approvalId: "r" };
    await test.service.replay(context, input);
    expect(test.authorize).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: {
          ...input,
          tenantId: context.tenantId,
          identityReplayGoverned: true,
        },
      }),
    );
    expect(test.repository.consume).toHaveBeenCalledWith(context, input);
  });
  it.each([0, 59, 3601, NaN, 60.5])(
    "rejects invalid expiry %s",
    async (ttlSeconds) => {
      const test = harness();
      await expect(
        test.service.create(context, {
          attemptId: "a",
          reason: "review",
          ttlSeconds,
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect(test.repository.create).not.toHaveBeenCalled();
    },
  );
  it("requires a bounded reason for requests and decisions", async () => {
    const test = harness();
    await expect(
      test.service.create(context, { attemptId: "a", reason: " " }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      test.service.decide(context, {
        approvalId: "r",
        decision: "revoke",
        reason: "x".repeat(1001),
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects PostgreSQL-incompatible reasons before persistence", async () => {
    const test = harness();
    await expect(
      test.service.create(context, { attemptId: "a", reason: "review\0" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      test.service.decide(context, {
        approvalId: "r",
        decision: "approve",
        reason: "review\0",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(test.repository.create).not.toHaveBeenCalled();
    expect(test.repository.decide).not.toHaveBeenCalled();
  });
});
