import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
// Real application-role admission/RLS, minimal root schema and synthetic issuer.
// No authenticated DEV command, initializer, native graph or publication evidence.
it.skipIf(process.env.ATHYPER_PRODUCT_CREATION_POSTGRES !== "1")(
  "restricts fresh roots to entity-bound creation tickets and rolls back creation",
  async () => {
    const name = "athyper-creation-" + randomUUID();
    let started = false;
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const read = (p: string) =>
      readFileSync(new URL("../../../../../db/" + p, import.meta.url), "utf8");
    const q = (s: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-X",
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
          "-U",
          "postgres",
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
      for (let n = 0; n < 100; n++) {
        try {
          docker("exec", name, "pg_isready", "-U", "postgres");
          break;
        } catch {
          if (n === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      q(`CREATE ROLE athyper_product_command_owner NOLOGIN; CREATE ROLE athyper_product_command_issuer NOLOGIN; CREATE ROLE athyper_product_command_app NOLOGIN; CREATE ROLE creation_client LOGIN; GRANT athyper_product_command_app TO creation_client;
 CREATE SCHEMA metadata; CREATE SCHEMA master;
 CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_principal_id',true)::uuid $$;
 CREATE TABLE metadata.entity(id uuid PRIMARY KEY,tenant_id uuid,ownership_model text);
 CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid REFERENCES metadata.entity(id),tenant_id uuid,change_set_code text,branch_code text,title text,created_by uuid,base_release_id uuid,status text DEFAULT 'draft',lock_version bigint DEFAULT 0,source_kind text,native_core_layout_version integer);
 ALTER TABLE metadata.entity_change_set ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_change_set FORCE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA metadata,master TO athyper_product_command_app;`);
      const transport = read(
        "scripts/operations/upgrades/entity-product-command/20261008_entity_product_command_authority.sql",
      );
      q(
        transport.slice(
          transport.indexOf("CREATE SCHEMA entity_command_private"),
          transport.indexOf("RESET ROLE;") + 11,
        ),
      );
      q(read("ddl/planes/studio/metadata/47_product_draft_creation.sql"));
      const entity = randomUUID(),
        other = randomUUID(),
        target = randomUUID(),
        actor = randomUUID(),
        tenant = randomUUID(),
        token = "a".repeat(64),
        hash = "b".repeat(64);
      q(`INSERT INTO metadata.entity VALUES('${entity}',NULL,'system'),('${other}','${tenant}','tenant');
 INSERT INTO entity_command_private.admission(token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,expires_at,creation_entity_id)
 VALUES(sha256(convert_to('${token}','UTF8')),'creation_client','${tenant}','${actor}','${target}','${hash}',clock_timestamp()+interval '60 seconds','${entity}');`);
      const session = `SET SESSION AUTHORIZATION creation_client; BEGIN; SET LOCAL app.current_principal_id='${actor}'; SET LOCAL app.current_tenant_id='${tenant}';`;
      const enter = `SELECT entity_command_private.enter('${token}','${hash}');`;
      const insert = (e = entity, t = target, a = actor) =>
        `INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,change_set_code,branch_code,title,created_by,base_release_id) VALUES('${t}','${e}',NULL,'test','main','Synthetic','${a}',NULL);`;
      expect(() => q(session + insert() + "COMMIT;")).toThrow();
      expect(() => q(session + enter + insert(other) + "COMMIT;")).toThrow();
      expect(() =>
        q(session + enter + insert(entity, randomUUID()) + "COMMIT;"),
      ).toThrow();
      expect(() =>
        q(session + enter + insert(entity, target, randomUUID()) + "COMMIT;"),
      ).toThrow();
      q(`UPDATE entity_command_private.admission SET creation_entity_id=NULL;`);
      expect(() => q(session + enter + insert() + "COMMIT;")).toThrow();
      q(
        `UPDATE entity_command_private.admission SET creation_entity_id='${entity}';`,
      );
      q(session + enter + insert() + "ROLLBACK;");
      expect(q("SELECT count(*) FROM metadata.entity_change_set;").trim()).toBe(
        "0",
      );
      q(
        `UPDATE metadata.entity SET ownership_model='tenant' WHERE id='${entity}';`,
      );
      expect(() => q(session + enter + insert() + "COMMIT;")).toThrow();
      q(
        `UPDATE metadata.entity SET ownership_model='system' WHERE id='${entity}';`,
      );
      q(session + enter + insert() + "COMMIT;");
      expect(q("SELECT count(*) FROM metadata.entity_change_set;").trim()).toBe(
        "1",
      );
      expect(() => q(session + enter + "COMMIT;")).toThrow();
      expect(() =>
        q(
          session +
            `INSERT INTO entity_command_private.admission DEFAULT VALUES; COMMIT;`,
        ),
      ).toThrow();
      expect(() =>
        q(
          session +
            `UPDATE metadata.entity_change_set SET native_core_layout_version=2; COMMIT;`,
        ),
      ).toThrow();
    } finally {
      if (started) docker("rm", "-f", name);
    }
  },
  30000,
);
