import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { nativeAiMembers } from "@athyper/server-contract-meta-entity-authoring";
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
          "-h",
          "127.0.0.1",
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
          if (n === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      q(`CREATE ROLE athyper_product_command_owner NOLOGIN; CREATE ROLE athyper_product_command_issuer NOLOGIN; CREATE ROLE athyper_product_command_app NOLOGIN; CREATE ROLE creation_client LOGIN; GRANT athyper_product_command_app TO creation_client;
 CREATE SCHEMA metadata; CREATE SCHEMA master;
 CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.current_principal_id',true)::uuid $$;
 CREATE TABLE metadata.entity(id uuid PRIMARY KEY,tenant_id uuid,ownership_model text);
 CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid REFERENCES metadata.entity(id),tenant_id uuid,change_set_code text,branch_code text,title text,created_by uuid,base_release_id uuid,parent_change_set_id uuid,status text DEFAULT 'draft',lock_version bigint DEFAULT 0,source_kind text,native_core_layout_version integer);
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
      // Exercise the canonical trigger's Entity read; the old minimal fixture
      // omitted this RLS dependency and incorrectly proved fresh-root readiness.
      q(`CREATE TABLE metadata.entity_release(id uuid,entity_id uuid,tenant_id uuid);
        CREATE TABLE metadata.entity_relation_target(target_entity_id uuid,change_set_id uuid);
        ALTER TABLE metadata.entity ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity FORCE ROW LEVEL SECURITY;
        GRANT SELECT ON metadata.entity,metadata.entity_change_set,metadata.entity_relation_target TO athyper_product_command_app;
        CREATE POLICY proof_root_read ON metadata.entity_change_set FOR SELECT TO athyper_product_command_app USING(entity_command_private.admitted(id));`);
      q(
        transport.slice(
          transport.indexOf("CREATE POLICY product_command_entity_read"),
          transport.indexOf("CREATE POLICY product_command_class_read"),
        ),
      );
      const functions = read("ddl/planes/studio/metadata/07_functions.sql");
      const rootGuard = functions.slice(
        functions.indexOf(
          "CREATE OR REPLACE FUNCTION metadata.trg_guard_entity_change_set()",
        ),
      );
      q(
        rootGuard.slice(
          0,
          rootGuard.indexOf("$$;", rootGuard.indexOf("AS $$") + 5) + 3,
        ),
      );
      q(
        `CREATE TRIGGER proof_root_scope BEFORE INSERT ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_change_set();`,
      );
      for (const d of Object.values(nativeAiMembers)) {
        const columns = Object.values(d.columns)
          .map((c) => `${c.column} ${c.sqlType}`)
          .join(",");
        q(
          `CREATE TABLE metadata.${d.table}(id uuid,tenant_id uuid,change_set_id uuid,entity_id uuid,created_by uuid,ungranted text,${columns}); ALTER TABLE metadata.${d.table} ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.${d.table} FORCE ROW LEVEL SECURITY;`,
        );
      }
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
      // With the real root trigger, valid creation admission still fails before
      // the forward fix because no matching draft exists yet.
      expect(() => q(session + enter + insert() + "ROLLBACK;")).toThrow();
      q(read("ddl/planes/studio/metadata/50_product_creation_entity_read.sql"));
      expect(
        q(session + enter + "SELECT count(*) FROM metadata.entity; ROLLBACK;"),
      ).toMatch(/^1$/m);
      expect(
        q(session + "SELECT count(*) FROM metadata.entity; ROLLBACK;"),
      ).toMatch(/^0$/m);
      expect(
        q(
          session +
            enter +
            `SET LOCAL app.current_principal_id='${randomUUID()}'; SELECT count(*) FROM metadata.entity; ROLLBACK;`,
        ),
      ).toMatch(/^0$/m);
      expect(
        q(
          session +
            enter +
            `SET LOCAL app.current_tenant_id='${randomUUID()}'; SELECT count(*) FROM metadata.entity; ROLLBACK;`,
        ),
      ).toMatch(/^0$/m);
      for (const table of [
        "entity_ai_profile",
        "entity_ai_field",
        "entity_ai_binding",
        "entity_ai_reference",
        "entity_ai_term",
      ]) {
        q(
          `INSERT INTO metadata.${table}(id,tenant_id,change_set_id) VALUES('${randomUUID()}',NULL,'${target}'),('${randomUUID()}',NULL,'${randomUUID()}');`,
        );
        expect(
          q(
            session +
              enter +
              `SELECT count(*) FROM metadata.${table}; ROLLBACK;`,
          ),
        ).toMatch(/^1$/m);
        expect(
          q(session + `SELECT count(*) FROM metadata.${table}; ROLLBACK;`),
        ).toMatch(/^0$/m);
        expect(() =>
          q(
            session +
              enter +
              `INSERT INTO metadata.${table}(id,tenant_id,change_set_id) VALUES('${randomUUID()}',NULL,'${target}'); COMMIT;`,
          ),
        ).toThrow();
      }
      // The complete native graph includes entity-facing AI declarations.
      // Exercise real creation admission + insert fences with reduced tables:
      // this proves privileges, not provider semantics or whole-graph validity.
      const grants = read(
        "ddl/planes/studio/metadata/49_native_bootstrap_privileges.sql",
      );
      q(grants.slice(0, grants.indexOf("GRANT UPDATE")));
      q(
        read(
          "ddl/planes/studio/metadata/56_native_bootstrap_ai_privileges.sql",
        ),
      );
      q(
        insert() +
          `UPDATE metadata.entity_change_set SET source_kind='product',native_core_layout_version=2,lock_version=1 WHERE id='${target}';`,
      );
      const aiInsert = (
        table: string,
        e = entity,
        draft = target,
        author = actor,
        tenantValue = "NULL",
        extra = "",
      ) =>
        `INSERT INTO metadata.${table}(id,entity_id,change_set_id,created_by,tenant_id${table === "entity_ai_term" ? ",origin_kind" : ""}${extra ? ",ungranted" : ""}) VALUES('${randomUUID()}','${e}','${draft}','${author}',${tenantValue}${table === "entity_ai_term" ? ",'authored'" : ""}${extra ? ",'forged'" : ""});`;
      for (const d of Object.values(nativeAiMembers).filter(
        (d) => d.table !== "entity_ai_term",
      )) {
        q(session + enter + aiInsert(d.table) + "ROLLBACK;");
        for (const invalid of [
          aiInsert(d.table, other),
          aiInsert(d.table, entity, randomUUID()),
          aiInsert(d.table, entity, target, randomUUID()),
          aiInsert(d.table, entity, target, actor, `'${tenant}'`),
          aiInsert(d.table, entity, target, actor, "NULL", "ungranted"),
          `UPDATE metadata.${d.table} SET id='${randomUUID()}';`,
          `DELETE FROM metadata.${d.table};`,
        ])
          expect(() => q(session + enter + invalid + "ROLLBACK;")).toThrow();
        expect(() => q(session + aiInsert(d.table) + "ROLLBACK;")).toThrow();
        q(
          `CREATE POLICY proof_broad_insert ON metadata.${d.table} FOR INSERT TO athyper_product_command_app WITH CHECK(true);`,
        );
        expect(() =>
          q(session + enter + aiInsert(d.table, other) + "ROLLBACK;"),
        ).toThrow();
      }
      expect(() =>
        q(session + enter + aiInsert("entity_ai_term") + "ROLLBACK;"),
      ).toThrow();
      expect(() =>
        q(
          session +
            enter +
            `INSERT INTO metadata.entity_ai_profile(id,entity_id,change_set_id,created_by,tenant_id,vocabulary_locale) VALUES('${randomUUID()}','${entity}','${target}','${actor}',NULL,'en'); ROLLBACK;`,
        ),
      ).toThrow();
      q(
        `UPDATE metadata.entity_change_set SET lock_version=2 WHERE id='${target}';`,
      );
      expect(() =>
        q(session + enter + aiInsert("entity_ai_profile") + "ROLLBACK;"),
      ).toThrow();
      q(
        `UPDATE metadata.entity_change_set SET lock_version=1 WHERE id='${target}'; UPDATE entity_command_private.admission SET creation_entity_id=NULL;`,
      );
      expect(() =>
        q(session + enter + aiInsert("entity_ai_profile") + "ROLLBACK;"),
      ).toThrow();
      q(
        `UPDATE entity_command_private.admission SET creation_entity_id='${entity}'; DELETE FROM metadata.entity_change_set WHERE id='${target}';`,
      );
      // Compiler preparation must resolve existing identities before inserting
      // the fresh root. Exercise both old visibility failure and new exact scope.
      q(`CREATE TABLE metadata.entity_field_identity(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid);
        ALTER TABLE metadata.entity_field_identity ENABLE ROW LEVEL SECURITY;
        ALTER TABLE metadata.entity_field_identity FORCE ROW LEVEL SECURITY;
        GRANT SELECT ON metadata.entity_field_identity TO athyper_product_command_app;
        CREATE POLICY reference_command_read ON metadata.entity_field_identity FOR SELECT TO athyper_product_command_app
          USING(tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity_field_identity.entity_id AND entity_command_private.admitted(c.id)));
        CREATE POLICY reference_command_read_fence ON metadata.entity_field_identity AS RESTRICTIVE FOR SELECT TO athyper_product_command_app
          USING(tenant_id IS NULL AND EXISTS(SELECT 1 FROM metadata.entity_change_set c WHERE c.entity_id=entity_field_identity.entity_id AND entity_command_private.admitted(c.id)));
        INSERT INTO metadata.entity_field_identity VALUES('${randomUUID()}','${entity}',NULL),('${randomUUID()}','${other}',NULL),('${randomUUID()}','${entity}','${tenant}');`);
      const identityCount =
        "SELECT count(*) FROM metadata.entity_field_identity; ROLLBACK;";
      expect(
        q(session + enter + identityCount)
          .trim()
          .split("\n"),
      ).toContain("0");
      q(
        read(
          "ddl/planes/studio/metadata/57_native_bootstrap_identity_read.sql",
        ),
      );
      expect(
        q(session + enter + identityCount)
          .trim()
          .split("\n"),
      ).toContain("1");
      expect(
        q(session + identityCount)
          .trim()
          .split("\n"),
      ).toContain("0");
      q(
        "CREATE POLICY deliberately_broad_identity_read ON metadata.entity_field_identity FOR SELECT TO athyper_product_command_app USING(true);",
      );
      expect(
        q(session + enter + identityCount)
          .trim()
          .split("\n"),
      ).toContain("1");
      expect(
        q(
          session +
            enter +
            `SET LOCAL app.current_principal_id='${randomUUID()}';` +
            identityCount,
        )
          .trim()
          .split("\n"),
      ).toContain("0");
      // Real admission and new catalogue policies; reduced resource/member tables
      // isolate authorization, not component publication or semantic qualification.
      q(`CREATE TABLE metadata.ui_component_contract(id uuid,tenant_id uuid,status text);
        ALTER TABLE metadata.ui_component_contract ENABLE ROW LEVEL SECURITY;
        ALTER TABLE metadata.ui_component_contract FORCE ROW LEVEL SECURITY;
        CREATE TABLE metadata.entity_surface(tenant_id uuid,change_set_id uuid,component_contract_id uuid);
        CREATE TABLE metadata.entity_surface_section(LIKE metadata.entity_surface);
        CREATE TABLE metadata.entity_surface_field_binding(tenant_id uuid,change_set_id uuid,component_display_id uuid,component_input_id uuid,component_filter_id uuid,component_format_id uuid);
        GRANT SELECT ON metadata.entity_surface,metadata.entity_surface_section,metadata.entity_surface_field_binding TO athyper_product_command_app;`);
      const components = Array.from({ length: 10 }, () => randomUUID());
      q(
        components
          .map(
            (id, index) =>
              `INSERT INTO metadata.ui_component_contract VALUES('${id}',${index === 7 ? `'${tenant}'` : "NULL"},'${index === 6 ? "deprecated" : "active"}');`,
          )
          .join(""),
      );
      q(`INSERT INTO metadata.entity_surface VALUES(NULL,'${target}','${components[0]}'),(NULL,'${target}','${components[6]}'),(NULL,'${target}','${components[7]}'),(NULL,'${randomUUID()}','${components[8]}');
        INSERT INTO metadata.entity_surface_section VALUES(NULL,'${target}','${components[1]}');
        INSERT INTO metadata.entity_surface_field_binding VALUES(NULL,'${target}','${components[2]}','${components[3]}','${components[4]}','${components[5]}');`);
      q(
        read(
          "ddl/planes/studio/metadata/54_product_component_validation_read.sql",
        ),
      );
      const count =
        "SELECT count(*) FROM metadata.ui_component_contract;ROLLBACK;";
      expect(q(session + enter + count)).toMatch(/^6$/m);
      expect(q(session + count)).toMatch(/^0$/m);
      expect(
        q(
          session +
            enter +
            `SET LOCAL app.current_principal_id='${randomUUID()}';` +
            count,
        ),
      ).toMatch(/^0$/m);
      expect(
        q(
          session +
            enter +
            `SET LOCAL app.current_tenant_id='${randomUUID()}';` +
            count,
        ),
      ).toMatch(/^0$/m);
      // Even an additional permissive policy cannot widen this role's scope.
      q(
        "CREATE POLICY proof_broad_read ON metadata.ui_component_contract FOR SELECT TO athyper_product_command_app USING(true);",
      );
      expect(q(session + enter + count)).toMatch(/^6$/m);
      for (const mutation of [
        "INSERT INTO metadata.ui_component_contract DEFAULT VALUES",
        "UPDATE metadata.ui_component_contract SET status='deprecated'",
        "DELETE FROM metadata.ui_component_contract",
        "TRUNCATE metadata.ui_component_contract",
      ])
        expect(() => q(session + enter + mutation + ";ROLLBACK;")).toThrow();
      q("UPDATE entity_command_private.admission SET revoked=true;");
      expect(() => q(session + enter + count)).toThrow();
      q("UPDATE entity_command_private.admission SET revoked=false;");
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
