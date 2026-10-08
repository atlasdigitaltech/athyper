import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

/** Real admission transport and bootstrap reader in disposable PostgreSQL.
 * Entity tables are a minimal fixture: this is not native graph/DEV qualification. */
it.skipIf(process.env.ATHYPER_OPERATION_BOOTSTRAP_POSTGRES !== "1")(
  "bounds source locks/reads to installed evidence and the transaction's admitted target",
  async () => {
    const name = "athyper-operation-bootstrap-" + randomUUID();
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
          docker("exec", name, "pg_isready", "-U", "postgres");
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
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
          ],
          { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
      const read = (p: string) =>
        readFileSync(
          new URL("../../../../../db/" + p, import.meta.url),
          "utf8",
        );
      query(`CREATE ROLE athyper_product_command_owner NOLOGIN;
        CREATE ROLE athyper_product_command_issuer NOLOGIN;
        CREATE ROLE athyper_product_command_app NOLOGIN;
        CREATE ROLE bootstrap_client LOGIN;
        GRANT athyper_product_command_app TO bootstrap_client;
        CREATE SCHEMA metadata;
        CREATE TABLE metadata.entity(id uuid PRIMARY KEY,tenant_id uuid,entity_code text);
        CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,
          source_kind text,status text,native_core_layout_version integer,lock_version bigint);
        CREATE TABLE metadata.entity_operation(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,
          change_set_id uuid,operation_key text,operation_kind text,requires_mfa boolean);`);
      const transport = read(
        "scripts/operations/upgrades/entity-product-command/20261008_entity_product_command_authority.sql",
      );
      query(
        transport.slice(
          transport.indexOf("CREATE SCHEMA entity_command_private"),
          transport.indexOf("RESET ROLE;") + "RESET ROLE;".length,
        ),
      );
      query(
        read("ddl/planes/studio/metadata/46_native_operation_bootstrap.sql"),
      );
      const entity = randomUUID(),
        source = randomUUID(),
        target = randomUUID(),
        operation = randomUUID(),
        actor = randomUUID(),
        tenant = randomUUID();
      const hash = "b".repeat(64),
        token = "a".repeat(64);
      query(`INSERT INTO metadata.entity VALUES('${entity}',NULL,'fixture_reference');
        INSERT INTO metadata.entity_change_set VALUES
        ('${source}','${entity}',NULL,'product','draft',NULL,4),
        ('${target}','${entity}',NULL,'product','draft',2,1);
        INSERT INTO metadata.entity_operation VALUES('${operation}','${entity}',NULL,'${source}','read','read',false);
        INSERT INTO entity_command_private.operation_bootstrap_source
        (target_change_set_id,source_rows_hash,entity_id,entity_code,source_change_set_id,source_revision,source_operation_id,operation_key,requires_mfa,approval_reference)
        VALUES('${target}','${hash}','${entity}','fixture_reference','${source}',4,'${operation}','read',false,'synthetic owner decision');
        INSERT INTO entity_command_private.admission
        (token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,expires_at)
        VALUES(sha256(convert_to('${token}','UTF8')),'bootstrap_client','${tenant}','${actor}','${target}','${hash}',clock_timestamp()+interval '60 seconds');`);
      const enter = `SET SESSION AUTHORIZATION bootstrap_client;BEGIN;
        SELECT set_config('app.current_tenant_id','${tenant}',true),set_config('app.current_principal_id','${actor}',true);
        SELECT entity_command_private.enter('${token}','${hash}');`;
      const select = `SELECT count(*)||':'||coalesce(bool_or(requires_mfa)::text,'none')
        FROM entity_command_private.read_operation_bootstrap_source('${target}','${hash}','${operation}');`;
      expect(query(enter + select + "ROLLBACK;")).toContain("1:false");
      // Rollback consumption permits a fresh fixture transaction; production
      // transport separately revokes admissions and requires reauthorization.
      const denied = (sql: string, message: string) => {
        try {
          query(sql);
          throw Error("EXPECTED_DENIAL");
        } catch (e) {
          expect(String((e as { stderr?: unknown }).stderr ?? e)).toContain(
            message,
          );
        }
      };
      denied(
        "SET SESSION AUTHORIZATION bootstrap_client;" + select,
        "OPERATION_BOOTSTRAP_ADMISSION_REQUIRED",
      );
      denied(
        enter + select.replace(target, source),
        "OPERATION_BOOTSTRAP_ADMISSION_REQUIRED",
      );
      denied(
        enter +
          "SELECT * FROM entity_command_private.operation_bootstrap_source;",
        "permission denied",
      );
      denied(
        enter + "SELECT * FROM metadata.entity_operation;",
        "permission denied",
      );
      denied(
        enter +
          "DELETE FROM entity_command_private.operation_bootstrap_source;",
        "permission denied",
      );
      expect(
        query(enter + select.replace(hash, "c".repeat(64)) + "ROLLBACK;"),
      ).toContain("0:none");
      for (const [change, restore] of [
        [
          "UPDATE metadata.entity_operation SET requires_mfa=true;",
          "UPDATE metadata.entity_operation SET requires_mfa=false;",
        ],
        [
          `UPDATE metadata.entity_change_set SET lock_version=5 WHERE id='${source}';`,
          `UPDATE metadata.entity_change_set SET lock_version=4 WHERE id='${source}';`,
        ],
        [
          `UPDATE metadata.entity_change_set SET tenant_id='${tenant}' WHERE id='${target}';`,
          `UPDATE metadata.entity_change_set SET tenant_id=NULL WHERE id='${target}';`,
        ],
        [
          `UPDATE metadata.entity_change_set SET status='published' WHERE id='${target}';`,
          `UPDATE metadata.entity_change_set SET status='draft' WHERE id='${target}';`,
        ],
      ]) {
        query(change!);
        expect(query(enter + select + "ROLLBACK;")).toContain("0:none");
        query(restore!);
      }
      // A committed admission cannot be entered twice.
      expect(query(enter + select + "COMMIT;")).toContain("1:false");
      denied(enter + select, "PRODUCT_COMMAND_ADMISSION_DENIED");
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
