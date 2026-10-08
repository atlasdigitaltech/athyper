import { promisify } from "node:util";
import { execFile, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
it.skipIf(process.env.ATHYPER_LIVE_READ_POSTGRES !== "1")(
  "reads and locks scoped evidence without application UPDATE grants",
  async () => {
    const name = "athyper-live-read-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    let created = false;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        process.env.ATHYPER_TEST_POSTGRES_IMAGE ?? "postgres:16.15-bookworm",
      );
      created = true;
      for (let i = 0; i < 100; i++) {
        try {
          docker(
            "exec",
            name,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
          );
          break;
        } catch {
          if (i === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      const query = (source: string) =>
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            name,
            "psql",
            "-h",
            "127.0.0.1",
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
          ],
          { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
      query(`CREATE SCHEMA runtime_meta;CREATE SCHEMA shared;
    CREATE ROLE athyper_runtime NOLOGIN; CREATE ROLE test_runtime LOGIN;GRANT athyper_runtime TO test_runtime;
    CREATE ROLE athyper_definer_runtime_meta NOLOGIN;
    GRANT USAGE ON SCHEMA runtime_meta,shared TO athyper_runtime,athyper_definer_runtime_meta;
    CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
    CREATE TABLE runtime_meta.release_activation_head(publication_key text,applied_release_id uuid,source_release_no bigint,artifact_hash text,row_version bigint);
    CREATE TABLE runtime_meta.applied_release(id uuid,publication_key text,source_release_id uuid,source_release_no bigint,artifact_hash text,status text);
    CREATE TABLE runtime_meta.applied_release_payload(applied_release_id uuid,payload_hash text,payload_json jsonb,coordinates jsonb,tenant_id uuid,artifact_kind text);
    GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA runtime_meta TO athyper_definer_runtime_meta;
    GRANT SELECT ON ALL TABLES IN SCHEMA runtime_meta TO athyper_runtime;
    ALTER TABLE runtime_meta.applied_release ENABLE ROW LEVEL SECURITY;
    ALTER TABLE runtime_meta.applied_release FORCE ROW LEVEL SECURITY;
    ALTER TABLE runtime_meta.release_activation_head ENABLE ROW LEVEL SECURITY;
    ALTER TABLE runtime_meta.release_activation_head FORCE ROW LEVEL SECURITY;
    ALTER TABLE runtime_meta.applied_release_payload ENABLE ROW LEVEL SECURITY;
    ALTER TABLE runtime_meta.applied_release_payload FORCE ROW LEVEL SECURITY;
    CREATE POLICY scoped_read ON runtime_meta.applied_release_payload FOR SELECT USING(tenant_id=shared.current_tenant_id_soft());
    INSERT INTO runtime_meta.release_activation_head VALUES('fixture.security','00000000-0000-4000-8000-000000000001',1,repeat('a',64),1);
    INSERT INTO runtime_meta.applied_release VALUES('00000000-0000-4000-8000-000000000001','fixture.security','00000000-0000-4000-8000-000000000002',1,repeat('a',64),'active');
    INSERT INTO runtime_meta.applied_release_payload VALUES('00000000-0000-4000-8000-000000000001',repeat('b',64),'{}','{"plane_code":"studio","signed_document":{}}','00000000-0000-4000-8000-000000000003','entity_security_manifest');`);
      query(
        readFileSync(
          new URL(
            "../../../../../../db/scripts/operations/upgrades/entity-product-command/20261008_entity_locked_live_read_resources.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const scoped = `SET SESSION AUTHORIZATION test_runtime;BEGIN;SET LOCAL app.current_tenant_id='00000000-0000-4000-8000-000000000003';SET LOCAL app.current_principal_id='00000000-0000-4000-8000-000000000004';SET LOCAL app.database_plane='studio';`;
      const call = `SELECT publication_key FROM runtime_meta.fn_locked_live_read_resources(ARRAY['fixture.security'],'00000000-0000-4000-8000-000000000003','studio',10000);`;
      expect(query(scoped + call + "ROLLBACK;")).toContain("fixture.security");
      expect(() =>
        query(
          scoped +
            "SELECT * FROM runtime_meta.release_activation_head FOR SHARE;",
        ),
      ).toThrow();
      expect(
        query(
          "SELECT has_table_privilege('test_runtime','runtime_meta.release_activation_head','UPDATE');",
        ).trim(),
      ).toBe("f");
      expect(() =>
        query("SET SESSION AUTHORIZATION test_runtime;" + call),
      ).toThrow();
      expect(() =>
        query(scoped + call.replace("'studio',10000", "'mesh',10000")),
      ).toThrow();
      expect(() =>
        query(
          scoped +
            call.replace(
              "00000000-0000-4000-8000-000000000003','studio'",
              "00000000-0000-4000-8000-000000000099','studio'",
            ),
        ),
      ).toThrow();
      expect(() => query(scoped + call.replace("10000", "4194305"))).toThrow();
      expect(() =>
        query(
          scoped +
            call.replace(
              "ARRAY['fixture.security']",
              "ARRAY['fixture.security','fixture.security']",
            ),
        ),
      ).toThrow();
      expect(() =>
        query(
          "SET SESSION AUTHORIZATION athyper_definer_live_read;UPDATE runtime_meta.applied_release SET status='superseded';",
        ),
      ).not.toThrow();
      // No runtime caller membership means no visible update rows for the isolated owner.
      expect(
        query("SELECT status FROM runtime_meta.applied_release;"),
      ).toContain("active");
      const holding = promisify(execFile)("docker", [
        "exec",
        name,
        "psql",
        "-h",
        "127.0.0.1",
        "-X",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-c",
        scoped + call + "SELECT pg_sleep(2);ROLLBACK;",
      ]);
      for (let i = 0; i < 100; i++) {
        if (
          query(
            "SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep';",
          ).trim() === "1"
        )
          break;
        if (i === 99) throw Error("LOCK_READER_NOT_READY");
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(() =>
        query(
          "SET lock_timeout='100ms';UPDATE runtime_meta.release_activation_head SET row_version=row_version+1;",
        ),
      ).toThrow();
      await holding;
      query("UPDATE runtime_meta.applied_release SET status='superseded';");
      expect(query(scoped + call + "ROLLBACK;")).not.toContain(
        "fixture.security",
      );
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
