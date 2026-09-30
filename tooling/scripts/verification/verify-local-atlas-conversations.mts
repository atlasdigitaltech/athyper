// Run: node --import tsx tooling/scripts/verification/verify-local-atlas-conversations.mts
// Local Docker only. Fixtures and all changes are rolled back; assertions run as athyper_runtime.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const root = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const requireDb = createRequire(root + "/server/db/package.json");
const { Pool } = requireDb("pg");
const requireAi = createRequire(
  root + "/server/packages/platform/ai/package.json",
);
const { Kysely, PostgresDialect, sql } = requireAi("kysely");
const { KyselyAtlasThreadRepository } = await import(
  root + "/server/packages/platform/ai/src/kysely-thread-repository.ts"
);
const { context: base } = await import(
  root + "/server/packages/platform/ai/src/__tests__/review-fixture.ts"
);
const host = execFileSync(
  "docker",
  [
    "inspect",
    "athyper-dev-db-1",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
  ],
  { encoding: "utf8" },
).trim();
const password = execFileSync(
  "docker",
  ["exec", "athyper-dev-db-1", "sh", "-c", 'cat "$POSTGRES_PASSWORD_FILE"'],
  { encoding: "utf8" },
).trim();
for (const plane of ["neon", "mesh", "studio"]) {
  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        host,
        user: "postgres",
        password,
        database: "athyper_" + plane,
        max: 1,
      }),
    }),
  });
  try {
    await db.transaction().execute(async (tx) => {
      const actor = (
        await sql`SELECT tenant_id,principal_id FROM master.principal_identity_binding WHERE username='catl.admin' AND status='active' LIMIT 1`.execute(
          tx,
        )
      ).rows[0];
      assert.ok(actor);
      const ctx = {
        ...base,
        planeKey: plane,
        tenantId: actor.tenant_id,
        principalId: actor.principal_id,
        permissions: {
          ...base.permissions,
          planeKey: plane,
          tenantId: actor.tenant_id,
          principalId: actor.principal_id,
          allowed: [plane + ".ai.agent.use"],
        },
      };
      await sql`SET LOCAL ROLE athyper_runtime`.execute(tx);
      const repo = new KyselyAtlasThreadRepository({
        run: async (p, a, work) => {
          assert.equal(p, plane);
          await sql`SELECT set_config('app.current_tenant_id',${a.tenantId},true),set_config('app.current_principal_id',${a.principalId},true)`.execute(
            tx,
          );
          return work(tx);
        },
      });
      const id = randomUUID();
      const created = await repo.create({
        context: ctx,
        threadId: id,
        title: "Atlas integration verification",
        retention: {
          policyId: "test:rollback",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          purgeAfter: null,
          legalHold: false,
        },
      });
      assert.equal(created.rowVersion, 1);
      assert.equal(created.participants[0].principalId, ctx.principalId);
      assert.ok(
        (
          await repo.list({ context: ctx, status: "active", limit: 100 })
        ).items.some((t) => t.threadId === id),
      );
      const renamed = await repo.rename({
        context: ctx,
        threadId: id,
        title: "Renamed",
        expectedRowVersion: 1,
      });
      assert.equal(renamed.rowVersion, 2);
      assert.equal(renamed.title, "Renamed");
      assert.equal(
        await repo.rename({
          context: ctx,
          threadId: id,
          title: "Stale",
          expectedRowVersion: 1,
        }),
        null,
      );
      const stranger = { ...ctx, principalId: randomUUID() };
      stranger.permissions = {
        ...ctx.permissions,
        principalId: stranger.principalId,
      };
      assert.equal(await repo.get({ context: stranger, threadId: id }), null);
      const archived = await repo.archive({
        context: ctx,
        threadId: id,
        expectedRowVersion: 2,
      });
      assert.equal(archived.status, "archived");
      assert.equal(
        await repo.softDelete({
          context: ctx,
          threadId: id,
          expectedRowVersion: 3,
          deletedAt: new Date().toISOString(),
        }),
        true,
      );
      assert.equal(await repo.get({ context: ctx, threadId: id }), null);
      await sql`SET CONSTRAINTS ALL IMMEDIATE`.execute(tx);
      console.log(
        plane +
          ": create/list/read/rename/version conflict/stranger isolation/archive/delete passed under runtime RLS",
      );
      throw new Error("ROLLBACK_OK");
    });
  } catch (e) {
    if (e.message !== "ROLLBACK_OK") throw e;
  } finally {
    await db.destroy();
  }
}
