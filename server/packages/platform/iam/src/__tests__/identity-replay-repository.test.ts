import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type Transaction,
} from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KyselyIdentityReplayApprovalRepository } from "../kysely-identity-replay-approval.js";

const context = {
  tenantId: "tenant",
  principalId: "checker",
} as VerifiedRequestContext;
const approval = {
  id: "approval",
  authority_tenant_id: "tenant",
  attempt_id: "attempt",
  desired_version: "1",
  desired_hash: "a".repeat(64),
  requested_by: "maker",
  reason: "review",
  status: "pending",
  expires_at: new Date(Date.now() + 60000),
  approved_by: null,
};
const projection = {
  id: "projection",
  desired_version: "1",
  desired_hash: approval.desired_hash,
};
const attempt = {
  ...projection,
  status: "dead_letter",
  replay_requested_at: null,
};
const databases: Kysely<Record<string, never>>[] = [];
afterEach(async () => {
  await Promise.all(databases.splice(0).map((db) => db.destroy()));
});
function harness(results: (Record<string, unknown>[] | Error)[]) {
  const db = new Kysely<Record<string, never>>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    plugins: [
      {
        transformQuery: (args) => args.node,
        transformResult: async (args) => {
          const result = results.shift();
          if (result instanceof Error) throw result;
          return { ...args.result, rows: result ?? [] };
        },
      },
    ],
  });
  databases.push(db);
  const audit = {
    record:
      vi.fn<AuditRecorder<Transaction<Record<string, never>>>["record"]>(),
  };
  const tx = db as unknown as Transaction<Record<string, never>>;
  const repository = new KyselyIdentityReplayApprovalRepository(
    (work) => work(tx),
    audit,
  );
  return { repository, audit, tx };
}
describe("identity replay repository transitions", () => {
  it("rejects self-approval before updating or auditing", async () => {
    const test = harness([
      [{ ...approval, requested_by: context.principalId }],
      [projection],
      [attempt],
      [],
    ]);
    await expect(
      test.repository.decide(context, {
        approvalId: "approval",
        decision: "approve",
        reason: "review",
      }),
    ).rejects.toMatchObject({ status: 403, code: "IAM_REPLAY_SOD_REQUIRED" });
    expect(test.audit.record).not.toHaveBeenCalled();
  });
  it.each([
    { ...attempt, status: "running" },
    { ...attempt, replay_requested_at: new Date() },
    { ...attempt, desired_version: "2" },
    { ...attempt, desired_hash: "b".repeat(64) },
  ])("rejects stale attempt state before creation", async (stale) => {
    const test = harness([[projection], [stale], []]);
    await expect(
      test.repository.create(context, {
        attemptId: "attempt",
        reason: "review",
        ttlSeconds: 60,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(test.audit.record).not.toHaveBeenCalled();
  });
  it("rejects superseded attempts", async () => {
    const test = harness([[projection], [attempt], [{ exists: 1 }]]);
    await expect(
      test.repository.create(context, {
        attemptId: "attempt",
        reason: "review",
        ttlSeconds: 60,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("returns 404 for a missing or tenant-invisible approval", async () => {
    const test = harness([[]]);
    await expect(
      test.repository.read(context, "approval"),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("revokes without requiring a current replayable attempt and audits in the same transaction", async () => {
    const test = harness([[approval], [{ ...approval, status: "revoked" }]]);
    await expect(
      test.repository.decide(context, {
        approvalId: "approval",
        decision: "revoke",
        reason: "withdrawn",
      }),
    ).resolves.toMatchObject({ status: "revoked" });
    expect(test.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventCode: "iam.identity_replay.revoked",
        metadata: expect.objectContaining({ reason: "withdrawn" }),
      }),
      test.tx,
    );
  });
  it("returns 409 when an atomic decision loses the state or expiry race", async () => {
    const test = harness([[approval], [projection], [attempt], [], []]);
    await expect(
      test.repository.decide(context, {
        approvalId: "approval",
        decision: "approve",
        reason: "review",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(test.audit.record).not.toHaveBeenCalled();
  });
  it("maps expiry in the approval trigger to a conflict", async () => {
    const error = Object.assign(
      new Error("invalid replay approval transition"),
      { code: "23514" },
    );
    const test = harness([[approval], [projection], [attempt], [], error]);
    await expect(
      test.repository.decide(context, {
        approvalId: "approval",
        decision: "approve",
        reason: "review",
      }),
    ).rejects.toMatchObject({ status: 409, code: "IAM_REPLAY_APPROVAL_STALE" });
    expect(test.audit.record).not.toHaveBeenCalled();
  });
  it("maps expiry between consumption and the replay marker to a conflict", async () => {
    const error = Object.assign(new Error("durable replay approval required"), {
      code: "23514",
    });
    const test = harness([
      [projection],
      [attempt],
      [],
      [{ ...approval, status: "consumed", approved_by: "checker" }],
      error,
    ]);
    await expect(
      test.repository.consume(context, {
        approvalId: "approval",
        attemptId: "attempt",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(test.audit.record).not.toHaveBeenCalled();
  });
  it.each([
    Object.assign(new Error("unrelated constraint"), { code: "23514" }),
    Object.assign(new Error("invalid replay approval transition"), {
      code: "XX000",
    }),
    new Error("database unavailable"),
  ])("preserves unexpected persistence errors", async (error) => {
    const test = harness([[approval], error]);
    await expect(
      test.repository.decide(context, {
        approvalId: "approval",
        decision: "revoke",
        reason: "review",
      }),
    ).rejects.toBe(error);
  });
  it("propagates audit failures to the transaction runner", async () => {
    const test = harness([[approval], [{ ...approval, status: "revoked" }]]);
    const error = new Error("audit unavailable");
    test.audit.record.mockRejectedValueOnce(error);
    await expect(
      test.repository.decide(context, {
        approvalId: "approval",
        decision: "revoke",
        reason: "review",
      }),
    ).rejects.toBe(error);
  });
});
