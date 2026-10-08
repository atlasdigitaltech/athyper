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
        CREATE SCHEMA metadata; CREATE SCHEMA master;
        CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_principal_id',true)::uuid $$;
        GRANT USAGE ON SCHEMA metadata,master TO athyper_product_command_app;
        CREATE TABLE metadata.entity(id uuid PRIMARY KEY,tenant_id uuid,entity_code text,ownership_model text DEFAULT 'system');
        CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,
          source_kind text,status text,native_core_layout_version integer,lock_version bigint,created_by uuid,change_set_code text,branch_code text,title text,base_release_id uuid,entity_label_id uuid);
        ALTER TABLE metadata.entity_change_set ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity_change_set FORCE ROW LEVEL SECURITY;
        CREATE TABLE metadata.entity_operation(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,
          change_set_id uuid,operation_key text,operation_kind text,requires_mfa boolean,label_id uuid);`);
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
      query(
        read(
          "ddl/planes/studio/metadata/48_operation_bootstrap_reservation.sql",
        ),
      );
      query(read("ddl/planes/studio/metadata/47_product_draft_creation.sql"));
      const entity = randomUUID(),
        source = randomUUID(),
        target = randomUUID(),
        operation = randomUUID(),
        actor = randomUUID(),
        tenant = randomUUID();
      const hash = "b".repeat(64),
        token = "a".repeat(64);
      query(`INSERT INTO metadata.entity(id,tenant_id,entity_code) VALUES('${entity}',NULL,'fixture_reference');
        INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,source_kind,status,native_core_layout_version,lock_version) VALUES
        ('${source}','${entity}',NULL,'product','draft',NULL,4);
        INSERT INTO metadata.entity_operation(id,entity_id,tenant_id,change_set_id,operation_key,operation_kind,requires_mfa) VALUES('${operation}','${entity}',NULL,'${source}','read','read',false);
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
      // Exact private reservation precedes target creation. It cannot be used
      // until a matching native product root exists, even with admission.
      expect(query(enter + select + "ROLLBACK;")).toContain("0:none");
      expect(() =>
        query(
          `INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,source_kind,status,native_core_layout_version,lock_version) VALUES('${target}','${entity}',NULL,'product','draft',NULL,0);`,
        ),
      ).toThrow();
      query(`BEGIN; INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,source_kind,status,native_core_layout_version,lock_version) VALUES('${target}','${entity}',NULL,NULL,'draft',NULL,0);
        UPDATE metadata.entity_change_set SET source_kind='product',native_core_layout_version=2,lock_version=1 WHERE id='${target}'; COMMIT;`);
      expect(() =>
        query(`DELETE FROM metadata.entity_change_set WHERE id='${target}';`),
      ).toThrow();
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
          `UPDATE metadata.entity_change_set SET status='published' WHERE id='${target}';`,
          `UPDATE metadata.entity_change_set SET status='draft' WHERE id='${target}';`,
        ],
      ]) {
        query(change!);
        expect(query(enter + select + "ROLLBACK;")).toContain("0:none");
        query(restore!);
      }
      denied(
        `UPDATE metadata.entity_change_set SET tenant_id='${tenant}' WHERE id='${target}';`,
        "OPERATION_BOOTSTRAP_TARGET_MISMATCH",
      );
      // Exact-source SQL insertion guard, independent of the TypeScript planner.
      // Full column grants/graph constraints are checked separately, not modeled here.
      const privileges = read(
        "ddl/planes/studio/metadata/49_native_bootstrap_privileges.sql",
      );
      query(privileges.slice(0, privileges.indexOf("DO $$")));
      query(privileges.slice(privileges.indexOf("-- Protected values")));
      query(`UPDATE metadata.entity_change_set SET created_by='${actor}' WHERE id='${target}';
        UPDATE entity_command_private.admission SET creation_entity_id='${entity}';
        GRANT INSERT(id,entity_id,tenant_id,change_set_id,operation_key,operation_kind,requires_mfa,label_id) ON metadata.entity_operation TO athyper_product_command_app;`);
      const insert = (
        value: boolean,
      ) => `INSERT INTO metadata.entity_operation(id,entity_id,tenant_id,change_set_id,operation_key,operation_kind,requires_mfa,label_id)
        VALUES('${randomUUID()}','${entity}',NULL,'${target}','read','read',${value},'${randomUUID()}');`;
      denied(
        enter + insert(true),
        "NATIVE_OPERATION_INITIALIZER_SOURCE_CHANGED",
      );
      query(enter + insert(false) + "ROLLBACK;");
      query(
        `UPDATE entity_command_private.admission SET creation_entity_id=NULL;`,
      );
      denied(enter + insert(false), "NATIVE_OPERATION_INITIALIZER_REQUIRED");
      query(
        `UPDATE entity_command_private.admission SET creation_entity_id='${entity}';`,
      );
      // Source-free exception installs exact immutable member coordinates privately.
      query(
        "ALTER TABLE metadata.entity_operation ADD COLUMN authorization_effect text;",
      );
      query(
        read(
          "ddl/planes/studio/metadata/60_declared_operation_initialization.sql",
        ),
      );
      query(
        read("ddl/planes/studio/metadata/59_native_reference_target_read.sql"),
      );
      const declared = randomUUID();
      query(`INSERT INTO entity_command_private.declared_operation_initialization VALUES
        ('${target}','${entity}','${declared}','list',false,'${hash}','${hash}');
        GRANT INSERT(authorization_effect) ON metadata.entity_operation TO athyper_product_command_app;`);
      const declaredInsert = (
        id: string,
        value: boolean,
      ) => `INSERT INTO metadata.entity_operation
        (id,entity_id,tenant_id,change_set_id,operation_key,operation_kind,requires_mfa,label_id,authorization_effect)
        VALUES('${id}','${entity}',NULL,'${target}','list','read',${value},'${randomUUID()}','read');`;
      query(enter + declaredInsert(declared, false) + "ROLLBACK;");
      denied(
        enter + declaredInsert(declared, true),
        "NATIVE_OPERATION_INITIALIZER_SOURCE_CHANGED",
      );
      denied(
        enter + declaredInsert(randomUUID(), false),
        "NATIVE_OPERATION_INITIALIZER_SOURCE_CHANGED",
      );
      denied(
        `SET SESSION AUTHORIZATION bootstrap_client; DELETE FROM entity_command_private.declared_operation_initialization;`,
        "permission denied",
      );
      expect(
        query(
          enter +
            `SELECT entity_command_private.native_reference_target_exists('${target}','${entity}','fixture_reference');ROLLBACK;`,
        ),
      ).toContain("t");
      expect(
        query(
          enter +
            `SELECT entity_command_private.native_reference_target_exists('${target}','${entity}','wrong');ROLLBACK;`,
        ),
      ).toContain("f");
      denied(
        `SET SESSION AUTHORIZATION bootstrap_client; SELECT entity_command_private.native_reference_target_exists('${target}','${entity}','fixture_reference');`,
        "NATIVE_REFERENCE_TARGET_ADMISSION_REQUIRED",
      );
      const functions = read("ddl/planes/studio/metadata/07_functions.sql");
      query(
        functions.slice(
          functions.indexOf(
            "CREATE OR REPLACE FUNCTION metadata.trg_validate_entity_graph_binding()",
          ),
          functions.indexOf(
            "CREATE OR REPLACE FUNCTION metadata.fn_entity_key_reference_valid",
          ),
        ),
      );
      query(
        read("ddl/planes/studio/metadata/61_native_relation_target_guard.sql"),
      );
      const relation = randomUUID();
      query(`ALTER TABLE metadata.entity ENABLE ROW LEVEL SECURITY;
        ALTER TABLE metadata.entity FORCE ROW LEVEL SECURITY;
        GRANT SELECT ON metadata.entity TO athyper_product_command_app;
        CREATE TABLE metadata.entity_relation(id uuid,tenant_id uuid,entity_id uuid,change_set_id uuid);
        INSERT INTO metadata.entity_relation VALUES('${relation}',NULL,'${entity}','${target}');
        CREATE TABLE metadata.entity_relation_target(tenant_id uuid,entity_id uuid,change_set_id uuid,entity_relation_id uuid,target_entity_id uuid);
        GRANT SELECT ON metadata.entity_relation TO athyper_product_command_app;
        GRANT INSERT ON metadata.entity_relation_target TO athyper_product_command_app;
        CREATE TRIGGER binding_guard BEFORE INSERT ON metadata.entity_relation_target FOR EACH ROW EXECUTE FUNCTION metadata.trg_validate_entity_graph_binding();`);
      const relationInsert = (targetId: string) =>
        `INSERT INTO metadata.entity_relation_target VALUES(NULL,'${entity}','${target}','${relation}','${targetId}');`;
      query(enter + relationInsert(entity) + "ROLLBACK;");
      denied(
        enter + relationInsert(randomUUID()),
        "Relation target Entity is not visible",
      );
      denied(
        "SET SESSION AUTHORIZATION bootstrap_client;" + relationInsert(entity),
        "NATIVE_REFERENCE_TARGET_ADMISSION_REQUIRED",
      );
      // A committed admission cannot be entered twice.
      expect(query(enter + select + "COMMIT;")).toContain("1:false");
      denied(enter + select, "PRODUCT_COMMAND_ADMISSION_DENIED");
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
