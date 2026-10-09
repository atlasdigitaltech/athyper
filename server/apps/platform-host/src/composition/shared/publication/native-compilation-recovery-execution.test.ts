import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { afterEach, expect, it, vi } from "vitest";
import { runWithRequestContext } from "@athyper/server-foundation/context";
import * as iam from "@athyper/server-platform-iam";
import * as authority from "./native-compilation-recovery-authority.js";
import * as actors from "./deployment-recovery-authority.js";
import { executeNativeCompilationRecovery } from "./native-compilation-recovery-execution.js";
afterEach(() => vi.restoreAllMocks());
function fixture() {
  let committed = false;
  const query = vi.fn(async (q: string) => {
    if (q === "commit") committed = true;
    return { rows: [] };
  });
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const member = { changeSetId: randomUUID(), entityId: randomUUID() };
  const admit = vi
    .spyOn(authority, "authorizeNativeCompilationRecovery")
    .mockResolvedValue({ plan: { members: [member] } } as never);
  const actor = vi
    .spyOn(actors, "assertPublicationWorkloadActor")
    .mockResolvedValue();
  vi.spyOn(iam, "createKyselyPermissionResolver").mockReturnValue({
    resolve: async () => ({ profileHash: "test" }),
  } as never);
  const authorize = vi.fn(async () => ({ allowed: true }));
  vi.spyOn(iam, "createPermissionAuthorizer").mockReturnValue({
    authorize,
  } as never);
  const record = vi.fn(async () => ({ id: randomUUID() }));
  const enqueue = vi.fn(async () => {
    expect(committed).toBe(true);
    return "job";
  });
  const deps = {
    database,
    audit: { record },
    jobs: { enqueue },
  } as unknown as Parameters<typeof executeNativeCompilationRecovery>[3];
  const config = {
    tenantId: randomUUID(),
    publisher: { principalId: randomUUID() },
  } as Parameters<typeof executeNativeCompilationRecovery>[0];
  const policy = {
    compiler: { buildHash: "c".repeat(64) },
    releases: [{ releaseId: randomUUID() }, { releaseId: randomUUID() }],
  } as Parameters<typeof executeNativeCompilationRecovery>[1];
  const pin = { id: randomUUID(), version: 1, hash: "a".repeat(64) };
  const run = () =>
    runWithRequestContext(
      {
        requestId: randomUUID(),
        planeKey: "studio",
        tenantId: config.tenantId,
        principalId: config.publisher.principalId,
      },
      () => executeNativeCompilationRecovery(config, policy, pin, deps),
    );
  return {
    database,
    query,
    admit,
    actor,
    authorize,
    record,
    enqueue,
    run,
    policy,
    pin,
  };
}
it("commits audit before enqueueing every existing release with replay-stable keys", async () => {
  const f = fixture();
  try {
    await f.run();
    await f.run();
    expect(f.enqueue).toHaveBeenCalledTimes(4);
    expect(
      f.query.mock.calls.some(([q]) =>
        q.includes(
          "set_config('app.current_actor_type','service_account',true)",
        ),
      ),
    ).toBe(true);
    for (const r of f.policy.releases)
      expect(f.enqueue).toHaveBeenCalledWith(
        "publication.authority",
        "publication.compile-artifact",
        { releaseId: r.releaseId },
        expect.objectContaining({
          enqueueKey: `publication:native-compilation-recovery:${f.pin.id}:${f.pin.hash}:${r.releaseId}`,
        }),
      );
  } finally {
    await f.database.destroy();
  }
});
it.each(["actor", "admission", "iam", "audit"])(
  "%s failure rolls back without queueing",
  async (failure) => {
    const f = fixture();
    try {
      if (failure === "actor") f.actor.mockRejectedValue(Error("revoked"));
      if (failure === "admission") f.admit.mockRejectedValue(Error("revoked"));
      if (failure === "iam") f.authorize.mockResolvedValue({ allowed: false });
      if (failure === "audit")
        f.record.mockRejectedValue(Error("audit failed"));
      await expect(f.run()).rejects.toThrow();
      expect(f.enqueue).not.toHaveBeenCalled();
      expect(f.query.mock.calls.at(-1)?.[0]).toBe("rollback");
    } finally {
      await f.database.destroy();
    }
  },
);
