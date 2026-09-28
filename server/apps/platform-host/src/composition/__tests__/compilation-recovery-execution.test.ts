import { afterEach, expect, it, vi } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import * as recovery from "../shared/publication/compilation-recovery-authority.js";
import * as heads from "../shared/publication/successor-targets.js";
import * as qualification from "../shared/publication/target-qualification.js";
import * as authoring from "@athyper/server-plane-studio-meta-entity-authoring";
import { executeCompilationRecovery } from "../shared/publication/compilation-recovery-execution.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture() {
  let committed = false;
  const query = vi.fn(async (q: string) => { if (q === "commit") committed = true; return { rows: q.includes("pg_try_advisory") ? [{ locked: true }] : [] }; });
  const database = new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: { connect: async () => ({ query, release() {} }), end: async () => {} } as never }) });
  const admit = vi.spyOn(recovery, "authorizeCompilationRecovery").mockResolvedValue({ graph: {} as never, evidence: { id: id(1), version: 1, hash: "a".repeat(64), policyHash: "b".repeat(64), compilerHash: "c".repeat(64) } });
  const checkHeads = vi.spyOn(heads, "assertSuccessorTargetHeads").mockResolvedValue();
  const qualify = vi.spyOn(qualification, "qualifyReferencePublicationTarget").mockResolvedValue();
  vi.spyOn(authoring, "compileSystemReferenceTarget").mockReturnValue({} as never);
  const record = vi.fn(async () => ({ id: id(8) }));
  const enqueue = vi.fn(async () => { expect(committed).toBe(true); return "recovery-job"; });
  const dependencies = { database, audit: { record }, jobs: { enqueue }, targets: { databases: {} } } as unknown as Parameters<typeof executeCompilationRecovery>[3];
  const config = { tenantId: id(2), publisher: { principalId: id(3) } } as Parameters<typeof executeCompilationRecovery>[0];
  const policy = { entityId: id(4), failedReleaseId: id(5), failedJobId: id(6), changeSetId: id(7), targets: [{ plane: "studio" }] } as Parameters<typeof executeCompilationRecovery>[1];
  const pin = { id: id(1), version: 1, hash: "a".repeat(64) };
  return { database, dependencies, config, policy, pin, record, enqueue, query, admit, checkHeads, qualify };
}
afterEach(() => vi.restoreAllMocks());
it("commits audit before queueing, rechecks after qualification, and uses a stable recovery-only enqueue key", async () => {
  const f = fixture();
  try {
    for (let i = 0; i < 2; i++) expect((await executeCompilationRecovery(f.config, f.policy, f.pin, f.dependencies)).status).toBe("recovery_queued");
    expect(f.admit).toHaveBeenCalledTimes(4); expect(f.checkHeads).toHaveBeenCalledTimes(4);
    expect(f.enqueue).toHaveBeenCalledWith("publication.authority", "publication.compile-artifact", { releaseId: id(5) }, expect.objectContaining({
      enqueueKey: `publication:compilation-recovery:${id(1)}:${"a".repeat(64)}`,
      execution: expect.objectContaining({ planeKey: "studio", scope: "tenant", principalId: id(3), tenantId: id(2) }),
    }));
  } finally { await f.database.destroy(); }
});
it.each(["authority", "heads", "qualification", "audit", "recheck"])("%s failure cannot enqueue", async failure => {
  const f = fixture();
  try {
    if (failure === "authority") f.admit.mockRejectedValue(Error("revoked"));
    if (failure === "heads") f.checkHeads.mockRejectedValue(Error("head changed"));
    if (failure === "qualification") f.qualify.mockRejectedValue(Error("unavailable"));
    if (failure === "audit") f.record.mockRejectedValue(Error("audit unavailable"));
    if (failure === "recheck") f.admit.mockResolvedValueOnce({ graph: {} as never, evidence: {} as never }).mockRejectedValue(Error("expired during probes"));
    await expect(executeCompilationRecovery(f.config, f.policy, f.pin, f.dependencies)).rejects.toThrow();
    expect(f.enqueue).not.toHaveBeenCalled(); expect(f.query.mock.calls.at(-1)?.[0]).toBe("rollback");
  } finally { await f.database.destroy(); }
});
