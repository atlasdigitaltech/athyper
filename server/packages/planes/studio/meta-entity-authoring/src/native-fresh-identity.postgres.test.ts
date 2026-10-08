import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
// Actual identity DDL/guard and restricted grants; synthetic command admission.
// Does not attest deployed governance or complete native bootstrap.
it.skipIf(process.env.ATHYPER_FRESH_IDENTITY_POSTGRES !== "1")(
  "allows fresh identity coordinates while retaining transaction, actor and mutation fences",
  async () => {
    const name = "athyper-fresh-identity-" + randomUUID();
    let started = false;
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const q = (s: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
          "-X",
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
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
      started = true;
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
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      const entity = randomUUID(),
        draft = randomUUID(),
        actor = randomUUID(),
        identity = randomUUID();
      const read = (file: string) =>
        readFileSync(
          new URL(
            "../../../../../db/ddl/planes/studio/metadata/" + file,
            import.meta.url,
          ),
          "utf8",
        );
      q(`CREATE SCHEMA metadata; CREATE SCHEMA shared; CREATE SCHEMA master; CREATE SCHEMA entity_command_private;
        CREATE ROLE athyper_product_command_app NOLOGIN; CREATE ROLE identity_client LOGIN; GRANT athyper_product_command_app TO identity_client;
        CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
        CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_principal_id',true)::uuid $$;
        CREATE FUNCTION entity_command_private.admitted(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p='${draft}'::uuid AND current_setting('app.fixture_admitted',true)='yes' $$;
        CREATE TABLE metadata.entity(id uuid PRIMARY KEY);
        CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,status text,lock_version bigint);
        CREATE TABLE metadata.entity_release(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,release_kind text);
        INSERT INTO metadata.entity VALUES('${entity}');
        INSERT INTO metadata.entity_change_set VALUES('${draft}','${entity}',NULL,'draft',1);`);
      const ddl = read("25_reference_member_guards.sql");
      q(ddl.slice(0, ddl.indexOf("ALTER TABLE metadata.entity_field")));
      const start = ddl.indexOf(
        "CREATE FUNCTION metadata.guard_reference_identity()",
      );
      const end = ddl.indexOf("CREATE TRIGGER identity_guard", start);
      q(ddl.slice(start, ddl.indexOf(";", end) + 1));
      q(`ALTER TABLE metadata.entity_field_identity ENABLE ROW LEVEL SECURITY;
        ALTER TABLE metadata.entity_field_identity FORCE ROW LEVEL SECURITY;
        GRANT USAGE ON SCHEMA metadata,master,entity_command_private TO athyper_product_command_app;
        GRANT SELECT ON metadata.entity_change_set,metadata.entity_field_identity TO athyper_product_command_app;
        CREATE POLICY fixture_read ON metadata.entity_field_identity FOR SELECT TO athyper_product_command_app USING(true);`);
      const grants = read("44_reference_command_privileges.sql");
      q(
        grants.slice(
          grants.indexOf("GRANT INSERT(entity_id,tenant_id,field_key"),
          grants.indexOf("DO $$ DECLARE t text;"),
        ),
      );
      const insert = `INSERT INTO metadata.entity_field_identity(id,entity_id,tenant_id,field_key,parent_identity_id,identity_status,introduced_change_set_id,created_at,created_by)
        VALUES('${identity}','${entity}',NULL,'code',NULL,'reserved','${draft}','2026-10-09T00:00:00Z','${actor}');`;
      const enter = `SET SESSION AUTHORIZATION identity_client;BEGIN;SET LOCAL app.current_principal_id='${actor}';SET LOCAL app.entity_change_set_write_token='${draft}:1';SET LOCAL app.fixture_admitted='yes';`;
      expect(() => q(enter + insert + "COMMIT;")).toThrow(); // missing explicit-coordinate grants
      q(read("58_native_fresh_identity_privileges.sql"));
      expect(() =>
        q(enter + "SET LOCAL app.fixture_admitted='no';" + insert + "COMMIT;"),
      ).toThrow();
      expect(() =>
        q(
          enter +
            `SET LOCAL app.current_principal_id='${randomUUID()}';` +
            insert +
            "COMMIT;",
        ),
      ).toThrow();
      expect(() =>
        q(
          enter +
            "SET LOCAL app.entity_change_set_write_token='wrong';" +
            insert +
            "COMMIT;",
        ),
      ).toThrow();
      q(enter + insert + "ROLLBACK;");
      expect(
        q("SELECT count(*) FROM metadata.entity_field_identity;").trim(),
      ).toBe("0");
      q(enter + insert + "COMMIT;");
      expect(
        q(
          "SELECT id,created_by,identity_status FROM metadata.entity_field_identity;",
        ).trim(),
      ).toBe(`${identity}|${actor}|reserved`);
      expect(() => q(enter + insert + "COMMIT;")).toThrow(); // never upsert a collision
      expect(() =>
        q(
          enter +
            "UPDATE metadata.entity_field_identity SET field_key='other';COMMIT;",
        ),
      ).toThrow();
      expect(() =>
        q(enter + "DELETE FROM metadata.entity_field_identity;COMMIT;"),
      ).toThrow();
    } finally {
      if (started) docker("rm", "-f", name);
    }
  },
  30000,
);
