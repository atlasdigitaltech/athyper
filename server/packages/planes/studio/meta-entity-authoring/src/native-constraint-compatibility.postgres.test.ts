import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

/** Canonical table/domain/check definitions in disposable PostgreSQL. Owner
 * admission/RLS/resources are not installed or attested by this component test. */
it.skipIf(process.env.ATHYPER_NATIVE_CONSTRAINT_POSTGRES !== "1")(
  "preserves legacy constraints and admits native representations only after explicit test-only pending removal",
  async () => {
    const name = "athyper-constraint-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const read = (name: string) =>
      readFileSync(
        new URL(
          "../../../../../db/ddl/planes/studio/metadata/" + name,
          import.meta.url,
        ),
        "utf8",
      ).replace(/^\uFEFF/, "");
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
      for (let i = 0; i < 100; i++)
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
      query(
        "CREATE SCHEMA metadata;CREATE SCHEMA shared;CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';" +
          read("02_domains.sql") +
          read("03_tables.sql") +
          "ALTER TABLE metadata.entity_surface_section ADD COLUMN navigation_group_id uuid;" +
          read("26_native_column_preparation.generated.sql"),
      );
      query(read("35_native_constraint_compatibility.sql"));
      const id = randomUUID(),
        actor = randomUUID(),
        draft = randomUUID(),
        surface = randomUUID();
      const field = (extra: string) =>
        `INSERT INTO metadata.entity_field(entity_id,change_set_id,field_key,data_type,type_config,value_origin,write_mode,storage_path,created_by${extra ? "," + extra.split("|")[0] : ""}) VALUES('${id}','${draft}','value','string','{"kind":"string"}','computed','computed',NULL,'${actor}'${extra ? "," + extra.split("|")[1] : ""});`;
      query(field("computation_spec|'{}'::jsonb"));
      const reject = (source: string, message: string) => {
        try {
          query("BEGIN;" + source + "ROLLBACK;");
          throw Error("EXPECTED_REJECTION");
        } catch (e) {
          expect(String((e as { stderr?: unknown }).stderr ?? e)).toContain(
            message,
          );
        }
      };
      reject(
        "UPDATE metadata.entity_field SET computation_spec=NULL;",
        "entity_field_computation_chk",
      );
      reject(
        "UPDATE metadata.entity_field SET nullable=false,write_mode='read_only',computation_spec=NULL;",
        "entity_field_native_pending_ck",
      );
      // Removing pending checks here is confined to this disposable component
      // fixture; no production guard, grant or final-graph qualification follows.
      query(
        "ALTER TABLE metadata.entity_surface DROP CONSTRAINT entity_surface_native_pending_ck; ALTER TABLE metadata.entity_field DROP CONSTRAINT entity_field_native_pending_ck; ALTER TABLE metadata.entity_runtime_profile DROP CONSTRAINT entity_runtime_profile_native_pending_ck; ALTER TABLE metadata.entity_surface_section DROP CONSTRAINT entity_surface_section_native_pending_ck; ALTER TABLE metadata.entity_surface_field_binding DROP CONSTRAINT entity_surface_field_binding_native_pending_ck;",
      );
      query(
        "UPDATE metadata.entity_field SET nullable=false,write_mode='read_only',computation_spec=NULL;",
      );
      reject(
        "UPDATE metadata.entity_field SET computed_contract_key='formula';",
        "entity_field_computation_chk",
      );
      query(
        "UPDATE metadata.entity_field SET computed_contract_key='formula',computed_contract_version=1;",
      );
      reject(
        "UPDATE metadata.entity_field SET value_origin='runtime';",
        "entity_field_computation_chk",
      );
      reject(
        "UPDATE metadata.entity_field SET write_mode='mutable';",
        "entity_field_computation_chk",
      );
      query(
        "UPDATE metadata.entity_field SET value_origin='projected',storage_path='value',computed_contract_key=NULL,computed_contract_version=NULL;",
      );
      reject(
        "UPDATE metadata.entity_field SET write_mode='mutable';",
        "entity_field_projected_write_chk",
      );
      query(
        `INSERT INTO metadata.entity_runtime_profile(entity_id,change_set_id,backing_kind,storage_plane,storage_schema,storage_object,api_exposure,read_mode,write_mode,concurrency_mode,record_version_field_key,created_by) VALUES('${id}','${draft}','table','studio','shared','sample','api','generic','generic','optimistic','version','${actor}');`,
      );
      reject(
        "UPDATE metadata.entity_runtime_profile SET record_version_field_key=NULL;",
        "entity_runtime_profile_version_field_chk",
      );
      query(
        `UPDATE metadata.entity_runtime_profile SET id_field_id='${randomUUID()}',record_version_field_key=NULL;`,
      );
      query(
        `UPDATE metadata.entity_runtime_profile SET record_version_field_id='${randomUUID()}';`,
      );
      reject(
        "UPDATE metadata.entity_runtime_profile SET concurrency_mode='none';",
        "entity_runtime_profile_version_field_chk",
      );
      reject(
        "UPDATE metadata.entity_runtime_profile SET record_version_field_key='version';",
        "entity_runtime_profile_version_field_chk",
      );
      const section = (
        key: string,
        position: number,
        group: string,
        kind = "section",
        content = "NULL",
      ) =>
        `INSERT INTO metadata.entity_surface_section(entity_id,change_set_id,entity_surface_id,section_key,section_kind,position,navigation_group_id,content_kind,created_by) VALUES('${id}','${draft}','${surface}','${key}','${kind}',${position},'${group}',${content},'${actor}');`;
      const group1 = randomUUID(),
        group2 = randomUUID();
      query(section("first", 1, group1));
      reject(section("second", 1, group2), "LEGACY_SECTION_POSITION_CONFLICT");
      reject(
        section("child", 2, group1, "subsection"),
        "entity_section_kind_representation_ck",
      );
      query(section("legacy_other", 2, group1));
      query(
        "BEGIN;SET CONSTRAINTS metadata.entity_surface_section_position_uq,metadata.legacy_section_position_guard DEFERRED;UPDATE metadata.entity_surface_section SET position=2 WHERE section_key='first';UPDATE metadata.entity_surface_section SET position=1 WHERE section_key='legacy_other';SET CONSTRAINTS ALL IMMEDIATE;COMMIT;",
      );
      reject(
        "SET CONSTRAINTS ALL DEFERRED;UPDATE metadata.entity_surface_section SET position=1;SET CONSTRAINTS ALL IMMEDIATE;",
        "entity_surface_section_position_uq",
      );
      query(
        "DELETE FROM metadata.entity_surface_section WHERE section_key='legacy_other';UPDATE metadata.entity_surface_section SET position=1;",
      );
      query(
        "UPDATE metadata.entity_surface_section SET content_kind='fields';" +
          section("second", 1, group2, "subsection", "'fields'"),
      );
      reject(
        section("third", 1, group2, "section", "'fields'"),
        "entity_surface_section_position_uq",
      );
      reject(
        "UPDATE metadata.entity_surface_section SET section_kind='tab';",
        "entity_section_kind_representation_ck",
      );
      // Both the scoped writer's specific deferral and final duplicate rejection.
      query(
        `BEGIN;SET CONSTRAINTS metadata.entity_surface_section_position_uq,metadata.legacy_section_position_guard DEFERRED;UPDATE metadata.entity_surface_section SET navigation_group_id=CASE section_key WHEN 'first' THEN '${group2}'::uuid ELSE '${group1}'::uuid END;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;`,
      );
      const binding = (key: string, kind: string) =>
        `INSERT INTO metadata.entity_surface_field_binding(entity_id,change_set_id,entity_surface_id,entity_field_id,binding_key,binding_kind,position,created_by) VALUES('${id}','${draft}','${surface}','${randomUUID()}','${key}',${kind},1,'${actor}');`;
      query(binding("primary", "'field'") + binding("badge", "'badge'"));
      reject(
        binding("duplicate", "'field'"),
        "entity_surface_field_binding_position_uq",
      );
      query(binding("legacy", "NULL"));
      reject(
        binding("legacy_duplicate", "NULL"),
        "entity_surface_field_binding_position_uq",
      );

      query(
        "DELETE FROM metadata.entity_surface_field_binding;DELETE FROM metadata.entity_surface_section;" +
          read("29_native_root.generated.sql") +
          "ALTER TABLE metadata.entity_change_set DROP CONSTRAINT entity_change_set_native_pending_ck;CREATE TABLE metadata.entity_surface_navigation_group(id uuid,entity_surface_id uuid,change_set_id uuid);",
      );
      query(
        `INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by,native_core_layout_version) VALUES('${draft}','${id}','graph-fixture','Graph fixture','${actor}',2); INSERT INTO metadata.entity_surface(id,entity_id,change_set_id,surface_key,surface_kind,title,created_by,column_count) VALUES('${surface}','${id}','${draft}','details','detail','Details','${actor}',2);INSERT INTO metadata.entity_surface_navigation_group VALUES('${group1}','${surface}','${draft}'),('${group2}','${surface}','${draft}');`,
      );
      query(section("parent", 1, group1, "section", "'fields'"));
      query(read("36_native_layout_graph_guard.sql"));
      const graphCheck = `SELECT metadata.fn_assert_native_layout_graph('${draft}');`;
      query(graphCheck);
      // Deferred checks observe final state, including parent/cross-surface edits.
      reject(
        "UPDATE metadata.entity_surface_section SET position=3;SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_LAYOUT_ORDER_INVALID",
      );
      reject(
        `UPDATE metadata.entity_surface_section SET navigation_group_id='${randomUUID()}';SET CONSTRAINTS ALL IMMEDIATE;`,
        "NATIVE_LAYOUT_SECTION_GRAPH_INVALID",
      );
      reject(
        "UPDATE metadata.entity_surface SET surface_kind='list';SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_LAYOUT_NAVIGATION_SURFACE_INVALID",
      );
      query(section("child", 1, group2, "subsection", "'fields'"));
      reject(
        "UPDATE metadata.entity_surface_section SET parent_section_id=(SELECT id FROM metadata.entity_surface_section WHERE section_key='child') WHERE section_key='parent';SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_LAYOUT_SECTION_GRAPH_INVALID",
      );
      reject(
        `SET CONSTRAINTS ALL DEFERRED;UPDATE metadata.entity_surface_section SET navigation_group_id='${group1}',parent_section_id=CASE section_key WHEN 'parent' THEN (SELECT id FROM metadata.entity_surface_section WHERE section_key='child') ELSE (SELECT id FROM metadata.entity_surface_section WHERE section_key='parent') END;SET CONSTRAINTS ALL IMMEDIATE;`,
        "NATIVE_LAYOUT_PARENT_CYCLE",
      );
      const fieldId = query(
        "SELECT id FROM metadata.entity_field LIMIT 1;",
      ).trim();
      query(
        `INSERT INTO metadata.entity_surface_field_binding(entity_id,change_set_id,entity_surface_id,entity_field_id,binding_key,binding_kind,position,created_by,meaningful_for_form,column_span) VALUES('${id}','${draft}','${surface}','${fieldId}','display','field',1,'${actor}',false,2);`,
      );
      reject(
        "UPDATE metadata.entity_surface_field_binding SET column_span=3;SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_LAYOUT_BINDING_GRAPH_INVALID",
      );
      reject(
        `DELETE FROM metadata.entity_field;SET CONSTRAINTS ALL IMMEDIATE;`,
        "NATIVE_LAYOUT_BINDING_GRAPH_INVALID",
      );
      reject(
        "UPDATE metadata.entity_surface_field_binding SET token_key='invalid';SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_LAYOUT_BINDING_GRAPH_INVALID",
      );
      reject(
        "UPDATE metadata.entity_surface_field_binding SET meaningful_for_form=true;SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_LAYOUT_BINDING_GRAPH_INVALID",
      );
      // Intermediate invalidity may be repaired before final validation.
      query(
        "BEGIN;UPDATE metadata.entity_surface_field_binding SET column_span=3;UPDATE metadata.entity_surface_field_binding SET column_span=2;SET CONSTRAINTS ALL IMMEDIATE;COMMIT;",
      );
      query(
        "BEGIN;SAVEPOINT edit;UPDATE metadata.entity_surface_field_binding SET column_span=3;ROLLBACK TO SAVEPOINT edit;COMMIT;",
      );
      reject(
        graphCheck +
          "UPDATE metadata.entity_surface_field_binding SET column_span=3;COMMIT;",
        "NATIVE_LAYOUT_BINDING_GRAPH_INVALID",
      );
      query(graphCheck);
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
