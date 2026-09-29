import { exerciseRecordHistory } from "./record-history.postgres-case.js";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { expect, it } from "vitest";
import { ActivitySnapshotRepository } from "../snapshots/activity-snapshot-repository.js";
const image = process.env.ATHYPER_ACTIVITY_DDL_IMAGE;
it.skipIf(!image)(
  "isolated PostgreSQL: tenant isolation, replay, concurrent capture, immutable coverage and transactional rollback",
  async () => {
    const socket = mkdtempSync(join(tmpdir(), "activity-pg-"));
    chmodSync(socket, 0o777);
    let container: string | undefined;
    let database: Kysely<Record<string, never>> | undefined;
    const ddl = (file: string) =>
      readFileSync(
        new URL(`../../../../../db/ddl/common/${file}`, import.meta.url),
        "utf8",
      );
    try {
      container = execFileSync(
        "docker",
        [
          "run",
          "--rm",
          "-d",
          "--network",
          "none",
          "--user",
          "postgres",
          "-v",
          `${socket}:/socket`,
          "--entrypoint",
          "sh",
          image!,
          "-c",
          "/usr/lib/postgresql/16/bin/initdb -D /tmp/activity-pg -A trust >/dev/null && exec /usr/lib/postgresql/16/bin/postgres -D /tmp/activity-pg -k /socket -h ''",
        ],
        { encoding: "utf8" },
      ).trim();
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          execFileSync(
            "docker",
            ["exec", container, "pg_isready", "-h", "/socket"],
            { stdio: "ignore" },
          );
          break;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      const pool = new Pool({
        host: socket,
        user: "postgres",
        database: "postgres",
        max: 8,
      });
      database = new Kysely({ dialect: new PostgresDialect({ pool }) });
      const db = database;
      const command = ddl("event/03_tables.sql")
        .split("CREATE TABLE event.command_execution (")[1]!
        .split("\n);")[0]!;
      await sql
        .raw(
          `CREATE EXTENSION pgcrypto; CREATE SCHEMA snapshot; CREATE SCHEMA event; CREATE SCHEMA shared; CREATE SCHEMA master;
      CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_tenant_id')::uuid $$;
      CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_principal_id')::uuid $$;
      CREATE DOMAIN event.command_execution_status_d AS text;
      ${ddl("snapshot/02_domains.sql")}
      ${ddl("snapshot/03_tables.sql").split("CREATE TABLE snapshot.entity_case_snapshot_lineage")[0]}
      ${ddl("snapshot/07_functions.sql").split("CREATE OR REPLACE FUNCTION snapshot.fn_get_entity_snapshot(")[0]}
      ${ddl("snapshot/08_triggers.sql").split("CREATE TRIGGER entity_case_snapshot_lineage_immutable")[0]}
      CREATE TABLE event.command_execution (${command}\n);
      CREATE ROLE activity_app;
      GRANT USAGE ON SCHEMA shared,master,snapshot,event TO activity_app;
      GRANT SELECT ON snapshot.entity_snapshot_identity,snapshot.entity_snapshot TO activity_app;
      GRANT SELECT,INSERT,UPDATE ON event.command_execution TO activity_app;
      ALTER TABLE snapshot.entity_snapshot_identity ENABLE ROW LEVEL SECURITY;
      ALTER TABLE snapshot.entity_snapshot ENABLE ROW LEVEL SECURITY;
      ALTER TABLE event.command_execution ENABLE ROW LEVEL SECURITY;
      CREATE POLICY tenant ON snapshot.entity_snapshot_identity FOR SELECT TO activity_app USING(tenant_id=shared.current_tenant_id());
      CREATE POLICY tenant ON snapshot.entity_snapshot FOR SELECT TO activity_app USING(tenant_id=shared.current_tenant_id());
      CREATE POLICY tenant ON event.command_execution TO activity_app USING(tenant_id=shared.current_tenant_id()) WITH CHECK(tenant_id=shared.current_tenant_id());`,
        )
        .execute(db);
      const repository = new ActivitySnapshotRepository({
        run: async (plane, actor, work, _signal, options) => {
          if (plane !== "neon") throw Error("PLANE_UNAVAILABLE");
          return db.transaction().setIsolationLevel(options?.isolationLevel ?? "read committed").execute(async (tx) => {
            await sql`SET LOCAL ROLE activity_app`.execute(tx);
            await sql`SELECT set_config('app.current_tenant_id',${actor.tenantId},true),set_config('app.current_principal_id',${actor.principalId},true)`.execute(
              tx,
            );
            return work(tx);
          });
        },
      });
      const input = {
        tenantId: randomUUID(),
        principalId: randomUUID(),
        planeKey: "neon" as const,
        entityType: "shared.example_reference",
        entityCode: "example_reference",
        entityId: randomUUID(),
        idempotencyKey: "capture-one",
        releaseHash: "release",
        contractHash: "a".repeat(64),
        retentionClass: "standard" as const,
        payload: { name: "First", nullable: null },
      };
      const first = await repository.capture(input);
      const replay = await repository.capture({
        ...input,
        payload: { name: "Changed live data", nullable: null },
      });
      expect(replay).toEqual({ id: first.id, replayed: true });
      const other = { ...input, tenantId: randomUUID() };
      const second = await repository.capture(other);
      expect(second.id).not.toBe(first.id);
      expect(await repository.get(other, first.id)).toBeNull();
      expect(
        await repository.get({ ...input, entityId: randomUUID() }, first.id),
      ).toBeNull();
      const captured = await repository.get(input, first.id);
      expect(captured?.payloadSchemaVersion).toBe(2);
      expect(captured?.payload).toMatchObject({
        record: { name: "First", nullable: null },
        coverage: { kind: "authorized_fields", fields: ["name", "nullable"] },
      });
      expect(captured?.sourceRecordVersion).toBeUndefined();
      await expect(
        repository.capture({ ...input, principalId: randomUUID() }),
      ).rejects.toMatchObject({ statusCode: 409 });
      const concurrent = await Promise.all([
        repository.capture({ ...input, idempotencyKey: "concurrent" }),
        repository.capture({ ...input, idempotencyKey: "concurrent" }),
      ]);
      expect(concurrent[0]!.id).toBe(concurrent[1]!.id);
      expect(concurrent.filter((r) => r.replayed)).toHaveLength(1);
      const listed = await repository.list(input, {
        from: "2020-01-01",
        until: "2100-01-01",
        limit: 1,
      });
      expect(listed).toHaveLength(1);
      const next = await repository.list(input, {
        from: "2020-01-01",
        until: "2100-01-01",
        after: {
          at: String(listed[0]!.captured_at),
          id: String(listed[0]!.id),
        },
        limit: 2,
      });
      expect(next.map((row) => row.id)).toEqual([first.id]);
      await expect(
        repository.get({ ...input, planeKey: "mesh" }, first.id),
      ).rejects.toThrow("PLANE_UNAVAILABLE");
      await expect(
        sql`UPDATE snapshot.entity_snapshot SET payload_json='{}'::jsonb WHERE snapshot_id=${first.id}::uuid`.execute(
          db,
        ),
      ).rejects.toThrow();
      await sql
        .raw(
          `CREATE FUNCTION event.fail_complete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$;
      CREATE TRIGGER fail_complete BEFORE UPDATE ON event.command_execution FOR EACH ROW EXECUTE FUNCTION event.fail_complete();`,
        )
        .execute(db);
      await expect(
        repository.capture({ ...input, idempotencyKey: "rollback" }),
      ).rejects.toThrow("injected failure");
      expect(
        await repository.list(input, {
          from: "2020-01-01",
          until: "2100-01-01",
          limit: 100,
        }),
      ).toHaveLength(2);
      expect(
        (
          await sql`SELECT id FROM event.command_execution WHERE idempotency_key='rollback'`.execute(
            db,
          )
        ).rows,
      ).toHaveLength(0);
      await sql`DROP TRIGGER fail_complete ON event.command_execution`.execute(db);
      await sql`CREATE TABLE public.capture_consistency_probe (value integer); INSERT INTO public.capture_consistency_probe VALUES (1); GRANT SELECT ON public.capture_consistency_probe TO activity_app`.execute(db);
      let reads = 0;
      const consistent = { ...input, idempotencyKey:"consistent-manual", readConsistent: async (tx: import("kysely").Transaction<Record<string,never>>) => {
        reads++;
        const root = (await sql<{value:number}>`SELECT value FROM public.capture_consistency_probe`.execute(tx)).rows[0]!;
        await sql`UPDATE public.capture_consistency_probe SET value=2`.execute(db);
        const child = (await sql<{value:number}>`SELECT value FROM public.capture_consistency_probe`.execute(tx)).rows[0]!;
        expect(child.value).toBe(root.value);
        return {record:{value:root.value},owned:{lines:{value:child.value}}};
      }};
      const manual = await repository.capture(consistent);
      expect((await repository.get(input,manual.id))?.payload).toMatchObject({record:{value:1},owned:{lines:{value:1}}});
      expect(await repository.capture(consistent)).toEqual({id:manual.id,replayed:true});
      expect(reads).toBe(1);
      await expect(repository.capture({...input,idempotencyKey:"failed-consistent",readConsistent:async()=>{throw Error("required section unavailable");}})).rejects.toThrow("required section unavailable");
      expect(await repository.capture({...input,idempotencyKey:"failed-consistent",readConsistent:async()=>({record:{},owned:{}})})).toMatchObject({replayed:false});
      await sql`CREATE TRIGGER fail_complete BEFORE UPDATE ON event.command_execution FOR EACH ROW EXECUTE FUNCTION event.fail_complete()`.execute(db);
      await exerciseRecordHistory(db,ddl("snapshot/12_record_history.sql"));
    } finally {
      await database?.destroy();
      if (container)
        execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
      rmSync(socket, { recursive: true, force: true });
    }
  },
  60000,
);
