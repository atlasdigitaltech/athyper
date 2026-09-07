import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createRuntimeCommandService } from "./runtime-command-service.js";
import { KyselyRuntimeCommandStore } from "./kysely-runtime-command-store.js";
const url = process.env["ATHYPER_RUNTIME_COMMAND_TEST_DATABASE_URL"];
const enabled =
  process.env["ATHYPER_RUNTIME_COMMAND_DB_TESTS"] === "true" && Boolean(url);
const admin = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({ connectionString: url ?? "postgres://disabled" }),
  }),
});
const db = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: url ?? "postgres://disabled",
      options: "-c role=runtime_command_test -c app.database_plane=neon",
      max: 8,
    }),
  }),
});
const ddl = (name: string) =>
  readFileSync(
    resolve(process.cwd(), "../../../db/ddl/common/ops", name),
    "utf8",
  );
const run = (text: string) => sql.raw(text).execute(admin);
const context = {
  tenantId: randomUUID(),
  principalId: randomUUID(),
  planeKey: "neon",
} as VerifiedRequestContext;
const reviewer = { ...context, principalId: randomUUID() };
const input = () => ({
  commandId: randomUUID(),
  idempotencyKey: randomUUID(),
  kind: "feature.activate",
  reason: "Reviewed test",
  payload: { enabled: true },
  expectedVersion: 1,
});
function fixture() {
  const store = new KyselyRuntimeCommandStore(db);
  const apply = vi.fn(async () => ({ enabled: true }));
  const service = createRuntimeCommandService({
    store,
    authorizer: { authorize: async () => ({ allowed: true }) },
    executor: {
      effects: "transactional",
      preview: async () => ({
        current: { enabled: false },
        proposed: { enabled: true },
        risk: "high",
      }),
      apply,
    },
  });
  return { service, store, apply };
}
describe.runIf(enabled)(
  "runtime command PostgreSQL ledger (empty disposable database only)",
  () => {
    beforeAll(async () => {
      await run(
        "CREATE EXTENSION pgcrypto;CREATE SCHEMA shared;CREATE SCHEMA ops;CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='runtime_command_test') THEN CREATE ROLE runtime_command_test; END IF; END $$;",
      );
      for (const name of [
        "submission",
        "approval_request",
        "approval_decision",
        "history",
      ]) {
        const statement = ddl("03_tables.sql").match(
          new RegExp(
            `CREATE TABLE ops.control_runtime_command_${name} \\([\\s\\S]*?\\n\\);`,
          ),
        )![0];
        await run(statement);
      }
      for (const fn of [
        "trg_guard_control_runtime_evidence",
        "trg_prepare_control_runtime_history",
      ])
        await run(
          ddl("07_functions.sql").match(
            new RegExp(
              `CREATE OR REPLACE FUNCTION ops.${fn}\\([\\s\\S]*?END \\$\\$;`,
            ),
          )![0],
        );
      for (const trigger of ddl("08_triggers.sql").matchAll(
        /CREATE TRIGGER control_runtime_command_[\s\S]*?;/g,
      ))
        await run(trigger[0]);
      await run(
        "CREATE TABLE ops.runtime_effect_test(id text PRIMARY KEY, value jsonb NOT NULL);CREATE TABLE ops.runtime_outbox_test(id text PRIMARY KEY,payload jsonb NOT NULL);CREATE TABLE ops.runtime_commit_failure_test(id text REFERENCES ops.runtime_effect_test(id) DEFERRABLE INITIALLY DEFERRED);",
      );
      await run(
        `CREATE FUNCTION ops.atomic_failure_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.reason='atomic-history-failure' AND NEW.event='applied') OR (NEW.reason='atomic-request-failure' AND NEW.event='approval_requested') OR (NEW.reason='atomic-decision-failure' AND NEW.event='approved') THEN RAISE EXCEPTION 'injected history failure';END IF;RETURN NEW;END $$;CREATE TRIGGER atomic_failure_test BEFORE INSERT ON ops.control_runtime_command_history FOR EACH ROW EXECUTE FUNCTION ops.atomic_failure_test();`,
      );
      await run(
        "GRANT USAGE ON SCHEMA ops,shared TO runtime_command_test;GRANT SELECT,INSERT ON ALL TABLES IN SCHEMA ops TO runtime_command_test;GRANT USAGE ON ALL SEQUENCES IN SCHEMA ops TO runtime_command_test;",
      );
    });
    afterAll(async () => {
      await db.destroy();
      await admin.destroy();
    });

    function atomicFixture(failure?: "executor" | "commit") {
      const store = new KyselyRuntimeCommandStore(db);
      const apply = vi.fn(
        async ({
          transaction,
          command,
          context: ctx,
        }: Parameters<
          import("./runtime-command-service.js").RuntimeCommandExecutor["apply"]
        >[0]) => {
          if (transaction.kind !== "postgres")
            throw Error("PostgreSQL transaction required");
          const tx = transaction.database;
          const settings = (
            await sql<{
              tenant: string;
              actor: string;
            }>`SELECT current_setting('app.current_tenant_id') tenant,current_setting('app.current_principal_id') actor`.execute(
              tx,
            )
          ).rows[0];
          expect(settings).toEqual({
            tenant: ctx.tenantId,
            actor: ctx.principalId,
          });
          await sql`INSERT INTO ops.runtime_effect_test VALUES(${command.commandId},'{}'::jsonb)`.execute(
            tx,
          );
          await sql`INSERT INTO ops.runtime_outbox_test VALUES(${command.commandId},'{}'::jsonb)`.execute(
            tx,
          );
          if (failure === "executor") throw Error("injected executor failure");
          if (failure === "commit")
            await sql`INSERT INTO ops.runtime_commit_failure_test VALUES('missing-parent')`.execute(
              tx,
            );
          return { done: true };
        },
      );
      return {
        store,
        apply,
        service: createRuntimeCommandService({
          store,
          authorizer: { authorize: async () => ({ allowed: true }) },
          executor: {
            effects: "transactional",
            preview: async () => ({
              current: null,
              proposed: { done: true },
              risk: "low",
            }),
            apply,
          },
        }),
      };
    }
    async function assertRolledBack(cmd: ReturnType<typeof input>) {
      for (const table of ["runtime_effect_test", "runtime_outbox_test"])
        expect(
          (
            await sql
              .raw(`SELECT * FROM ops.${table} WHERE id='${cmd.commandId}'`)
              .execute(admin)
          ).rows,
        ).toEqual([]);
      expect(
        await new KyselyRuntimeCommandStore(db).findSubmission(
          context.tenantId,
          cmd.idempotencyKey,
        ),
      ).toBeUndefined();
      expect(
        (
          await sql`SELECT * FROM ops.control_runtime_command_history WHERE command_id=${cmd.commandId}`.execute(
            admin,
          )
        ).rows,
      ).toEqual([]);
    }
    it("commits effects, outbox and ledger once across concurrent connections", async () => {
      const f = atomicFixture(),
        cmd = input();
      const results = await Promise.all([
        f.service.submit(context, cmd),
        f.service.submit(context, cmd),
      ]);
      expect(results.map((r) => r.outcome).sort()).toEqual([
        "applied",
        "replayed",
      ]);
      expect(f.apply).toHaveBeenCalledOnce();
      expect(
        (
          await sql`SELECT * FROM ops.runtime_effect_test WHERE id=${cmd.commandId}`.execute(
            admin,
          )
        ).rows,
      ).toHaveLength(1);
      expect(
        (
          await sql`SELECT * FROM ops.runtime_outbox_test WHERE id=${cmd.commandId}`.execute(
            admin,
          )
        ).rows,
      ).toHaveLength(1);
    });
    it.each(["executor", "commit"] as const)(
      "rolls back effects, outbox and evidence on %s failure",
      async (failure) => {
        const f = atomicFixture(failure),
          cmd = input();
        await expect(f.service.submit(context, cmd)).rejects.toThrow();
        await assertRolledBack(cmd);
        expect(f.apply).toHaveBeenCalledOnce();
      },
    );
    it("rolls back executor effects when applied history fails", async () => {
      const f = atomicFixture(),
        cmd = { ...input(), reason: "atomic-history-failure" };
      await expect(f.service.submit(context, cmd)).rejects.toThrow(
        "injected history failure",
      );
      expect(f.apply).toHaveBeenCalledOnce();
      await assertRolledBack(cmd);
    });
    it("rolls back approval request and submission when request history fails", async () => {
      const f = fixture(),
        cmd = { ...input(), reason: "atomic-request-failure" };
      await expect(f.service.submit(context, cmd)).rejects.toThrow(
        "injected history failure",
      );
      await assertRolledBack(cmd);
      expect(
        (
          await sql`SELECT * FROM ops.control_runtime_command_approval_request WHERE command_id=${cmd.commandId}`.execute(
            admin,
          )
        ).rows,
      ).toEqual([]);
    });
    it("rolls back approval decision when its history fails", async () => {
      const f = fixture(),
        pending = await f.service.submit(context, input());
      const id = pending.approval!.approvalId;
      await expect(
        f.service.decideApproval(
          reviewer,
          id,
          "approved",
          "atomic-decision-failure",
        ),
      ).rejects.toThrow("injected history failure");
      expect((await f.store.getApproval(id))!.status).toBe("pending");
      await expect(
        f.service.decideApproval(reviewer, id, "approved", "Reviewed"),
      ).resolves.toMatchObject({ status: "approved" });
    });
    it("rejects a mismatched physical plane before effects", async () => {
      const f = atomicFixture();
      await expect(
        f.service.submit({ ...context, planeKey: "mesh" }, input()),
      ).rejects.toMatchObject({ code: "CONTROL_ADMIN_RUNTIME_PLANE_MISMATCH" });
      expect(f.apply).not.toHaveBeenCalled();
    });
    it("concurrently requests one approval, then executes once after review", async () => {
      const f = fixture(),
        cmd = input();
      const requests = await Promise.all([
        f.service.submit(context, cmd),
        f.service.submit(context, cmd),
      ]);
      expect(requests[0]!.approval!.approvalId).toBe(
        requests[1]!.approval!.approvalId,
      );
      const id = requests[0]!.approval!.approvalId;
      expect((await f.store.getApproval(id))!.previewFingerprint).toMatch(
        /^[a-f0-9]{64}$/,
      );
      await f.service.decideApproval(reviewer, id, "approved", "Reviewed");
      expect(f.apply).not.toHaveBeenCalled();
      await Promise.all([
        f.service.submit(context, { ...cmd, approvalId: id }),
        f.service.submit(context, { ...cmd, approvalId: id }),
      ]);
      expect(f.apply).toHaveBeenCalledOnce();
      expect((await f.service.submit(context, cmd)).outcome).toBe("replayed");
    });
    it("allows only one competing decision", async () => {
      const f = fixture(),
        pending = await f.service.submit(context, input());
      const results = await Promise.allSettled(
        ["approved", "rejected"].map((decision) =>
          f.service.decideApproval(
            reviewer,
            pending.approval!.approvalId,
            decision as "approved" | "rejected",
            "Reviewed",
          ),
        ),
      );
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { statusCode: 409 },
      });
    });
    it("serializes conflicting fingerprints even for different outcome rows", async () => {
      const f = fixture(),
        cmd = input();
      const results = await Promise.allSettled([
        f.service.submit(context, cmd),
        f.service.submit(context, { ...cmd, payload: { enabled: false } }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { statusCode: 409 },
      });
    });
    it("does not replay another requester or expose another tenant history", async () => {
      const f = fixture(),
        cmd = input();
      await f.service.submit(context, cmd);
      await expect(f.service.submit(reviewer, cmd)).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(
        await f.service.history({ ...context, tenantId: randomUUID() }),
      ).toEqual([]);
    });
    it("enforces immutable history and chains concurrent entries", async () => {
      const f = fixture();
      const tenantId = randomUUID();
      const entries = await Promise.all(
        Array.from({ length: 4 }, () =>
          f.store.appendHistory({
            tenantId,
            planeKey: "neon",
            actorId: context.principalId,
            commandId: randomUUID(),
            kind: "feature.set",
            event: "submitted",
            reason: "test",
            fingerprint: "a".repeat(64),
            detail: {},
            occurredAt: new Date().toISOString(),
          }),
        ),
      );
      expect(new Set(entries.map((x) => x.entryHash)).size).toBe(4);
      const history = await f.store.listHistory({ tenantId, limit: 10 });
      for (let i = 0; i < 3; i++)
        expect(history[i]!.previousHash).toBe(history[i + 1]!.entryHash);
      await expect(
        sql`DELETE FROM ops.control_runtime_command_history WHERE tenant_id=${tenantId}::uuid`.execute(
          admin,
        ),
      ).rejects.toMatchObject({ code: "23000" });
    });
  },
);
