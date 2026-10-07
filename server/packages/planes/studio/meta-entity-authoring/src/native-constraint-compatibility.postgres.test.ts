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
      // Canonical core semantic guard, with a synthetic catalogue anchor.
      const identityId = randomUUID();
      query(
        `CREATE TABLE metadata.entity_field_identity(id uuid,entity_id uuid,tenant_id uuid,parent_identity_id uuid,identity_status text,introduced_change_set_id uuid);ALTER TABLE metadata.entity_field ADD COLUMN field_identity_id uuid;INSERT INTO metadata.entity_field_identity VALUES('${identityId}','${id}',NULL,NULL,'reserved','${draft}');UPDATE metadata.entity_field SET field_identity_id='${identityId}',default_kind='none',key_generation='none';`,
      );
      query(read("37_native_core_graph_guard.sql"));
      const coreCheck = `SELECT metadata.fn_assert_native_core_graph('${draft}');`;
      query(coreCheck);
      reject(
        "UPDATE metadata.entity_field SET minimum=2;SET CONSTRAINTS ALL IMMEDIATE;",
        "NATIVE_CORE_FIELD_VARIANT_INVALID",
      );
      reject(
        "UPDATE metadata.entity_field SET min_length=20,max_length=10;COMMIT;",
        "NATIVE_CORE_FIELD_VARIANT_INVALID",
      );
      reject(
        "UPDATE metadata.entity_field SET default_kind='literal',default_text='value';COMMIT;",
        "NATIVE_CORE_FIELD_VARIANT_INVALID",
      );
      reject(
        "UPDATE metadata.entity_field SET currency_code='USD';COMMIT;",
        "NATIVE_CORE_FIELD_VARIANT_INVALID",
      );
      reject(
        "UPDATE metadata.entity_field SET validation_contract_key='validate';COMMIT;",
        "NATIVE_CORE_FIELD_VARIANT_INVALID",
      );
      reject(
        `UPDATE metadata.entity_field_identity SET entity_id='${randomUUID()}';COMMIT;`,
        "NATIVE_CORE_FIELD_REFERENCE_INVALID",
      );
      reject(
        "UPDATE metadata.entity_surface SET allowed_page_sizes=ARRAY[10];COMMIT;",
        "NATIVE_CORE_SURFACE_VARIANT_INVALID",
      );
      reject(
        "UPDATE metadata.entity_runtime_profile SET reference_capability_key='reference';COMMIT;",
        "NATIVE_CORE_RUNTIME_VARIANT_INVALID",
      );
      query(
        "BEGIN;UPDATE metadata.entity_field SET value_origin='stored',write_mode='mutable',default_kind='literal',default_text='value';SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;",
      );
      query(
        "BEGIN;UPDATE metadata.entity_field SET data_type='money',type_config='{\"kind\":\"money\"}',precision=12,scale=2;SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;",
      );
      reject(
        "UPDATE metadata.entity_field SET data_type='decimal',type_config='{\"kind\":\"decimal\"}',minimum='NaN';COMMIT;",
        "NATIVE_CORE_SCALAR_ENCODING_INVALID",
      );
      reject(
        "UPDATE metadata.entity_field SET data_type='date',type_config='{\"kind\":\"date\"}',minimum_date=DATE '0001-01-01 BC';COMMIT;",
        "NATIVE_CORE_SCALAR_ENCODING_INVALID",
      );
      query(
        "BEGIN;SAVEPOINT editing;UPDATE metadata.entity_field SET min_length=20,max_length=10;ROLLBACK TO SAVEPOINT editing;COMMIT;",
      );
      query(coreCheck);
      const labelId = randomUUID(),
        pin = "a".repeat(64);
      query(
        `ALTER TABLE metadata.entity_change_set ADD COLUMN reference_contract_version integer,ADD COLUMN default_locale text,ADD COLUMN required_locales text[];CREATE TABLE metadata.entity_label(id uuid,change_set_id uuid,entity_id uuid,tenant_id uuid,source_kind text);INSERT INTO metadata.entity_label VALUES('${labelId}','${draft}','${id}',NULL,'owned');UPDATE metadata.entity_change_set SET source_kind='product',authoring_schema_hash='${pin}',reference_contract_version=1,default_locale='en',required_locales=ARRAY['en'],entity_label_id='${labelId}';`,
      );
      query(read("38_native_root_guard.sql"));
      const rootCheck = `SELECT metadata.fn_assert_native_root('${draft}','${pin}',2);`;
      query(rootCheck);
      reject(
        `SELECT metadata.fn_assert_native_root('${draft}','${"b".repeat(64)}',2);`,
        "NATIVE_ROOT_PIN_INVALID",
      );
      reject(
        "UPDATE metadata.entity_change_set SET native_core_layout_version=NULL;",
        "NATIVE_ROOT_REPIN_REQUIRES_VERSIONED_MIGRATION",
      );
      reject(
        `UPDATE metadata.entity_change_set SET authoring_schema_hash='${"b".repeat(64)}';`,
        "NATIVE_ROOT_REPIN_REQUIRES_VERSIONED_MIGRATION",
      );
      reject(
        "UPDATE metadata.entity_change_set SET required_locales=ARRAY['fr'];COMMIT;",
        "NATIVE_ROOT_DEPENDENCIES_INVALID",
      );
      reject(
        "DELETE FROM metadata.entity_label;COMMIT;",
        "NATIVE_ROOT_LABEL_INVALID",
      );
      reject(
        `UPDATE metadata.entity_label SET tenant_id='${randomUUID()}';COMMIT;`,
        "NATIVE_ROOT_LABEL_INVALID",
      );
      query(
        "BEGIN;SAVEPOINT locale_edit;UPDATE metadata.entity_change_set SET required_locales=ARRAY['fr'];ROLLBACK TO SAVEPOINT locale_edit;COMMIT;",
      );
      query(rootCheck + coreCheck + graphCheck);
      for (const table of read("24_reference_members.generated.sql").matchAll(
        /CREATE TABLE metadata\.(\w+) \([\s\S]*?\n\);/g,
      )) {
        if (table[1] !== "entity_surface_navigation_group") query(table[0]);
      }
      const retained = read("25_reference_member_guards.sql").match(
        /CREATE FUNCTION metadata\.validate_reference_members\(draft uuid\)[\s\S]*?END \$\$;/,
      )![0];
      query(retained);
      const bindingId = query(
        "SELECT id FROM metadata.entity_surface_field_binding LIMIT 1;",
      ).trim();
      query(
        `INSERT INTO metadata.entity_predicate(entity_id,change_set_id,predicate_key,node_kind,purpose,field_binding_id,entity_field_id,operator,value_kind,value_text,position,created_by) VALUES('${id}','${draft}','visible','condition','visibility','${bindingId}','${fieldId}','eq','text','value',1,'${actor}');`,
      );
      const referenceCheck = `SELECT metadata.validate_reference_members('${draft}');`;
      reject(referenceCheck, "Predicate field/value type invalid");
      query(read("39_reference_predicate_native_types.sql"));
      query(referenceCheck);
      query(
        `BEGIN;UPDATE metadata.entity_field SET data_type='bigint',type_config='{\"kind\":\"bigint\"}';UPDATE metadata.entity_predicate SET operator='gte',value_kind='numeric',value_text=NULL,value_numeric=9007199254740993;${referenceCheck}SET CONSTRAINTS ALL IMMEDIATE;ROLLBACK;`,
      );
      reject(
        "UPDATE metadata.entity_predicate SET value_kind='boolean',value_text=NULL,value_boolean=true;" +
          referenceCheck,
        "Predicate field/value type invalid",
      );
      // Install actual supplemental table definitions, without host grants.
      query(read("28_native_operation.generated.sql"));
      query(
        read("27_native_ai.generated.sql").match(
          /CREATE FUNCTION metadata\.fn_native_ai_text_array_valid[\s\S]*?\$\$;/,
        )![0],
      );
      for (const table of read("27_native_ai.generated.sql").matchAll(
        /CREATE TABLE metadata\.(\w+) \([\s\S]*?\n\);/g,
      ))
        query(table[0]);
      query("ALTER TABLE metadata.entity_label ADD UNIQUE(change_set_id,id);");
      query(
        read("23_owned_label_authoring.sql").match(
          /CREATE TABLE metadata\.entity_label_translation \([\s\S]*?\n\);/,
        )![0],
      );
      query(read("33_native_typed_row_guards.generated.sql"));
      query(
        "ALTER TABLE metadata.entity_surface_navigation_group ADD COLUMN entity_id uuid, ADD COLUMN tenant_id uuid;",
      );
      query(read("40_native_snapshot_guard.sql"));
      const aggregateCheck = `SELECT metadata.fn_assert_native_authoring_snapshot('${draft}','${pin}',2);`;
      // A consistent empty native draft is a valid partial save, not a publishable entity.
      // The aggregate compiles every guarded SQL branch against canonical columns.
      query(
        `BEGIN; DELETE FROM metadata.entity_predicate; DELETE FROM metadata.entity_surface_field_binding; DELETE FROM metadata.entity_surface_section; DELETE FROM metadata.entity_surface_navigation_group; DELETE FROM metadata.entity_surface; DELETE FROM metadata.entity_runtime_profile; DELETE FROM metadata.entity_field; ${aggregateCheck} COMMIT;`,
      );
      reject(
        `INSERT INTO metadata.entity_surface(entity_id,change_set_id,surface_key,surface_kind,title,layout_kind,layout_config,component_contract_id,created_by) VALUES('${id}','${draft}','component','detail','Component','stack','{}','${randomUUID()}','${actor}');SELECT metadata.fn_assert_native_typed_rows('${draft}',2);`,
        "NATIVE_REFERENCE_STORAGE_UNAVAILABLE:ui_component_contract",
      );
      const profileId = randomUUID();
      query(
        `INSERT INTO metadata.entity_ai_profile(id,entity_id,change_set_id,enabled,aliases,context_kinds,created_by) VALUES('${profileId}','${id}','${draft}',false,ARRAY[]::text[],ARRAY[]::text[],'${actor}');${aggregateCheck}`,
      );
      reject(
        `UPDATE metadata.entity_ai_profile SET entity_id='${randomUUID()}';COMMIT;`,
        "NATIVE_SNAPSHOT_OWNER_INVALID",
      );
      reject(
        `INSERT INTO metadata.entity_ai_binding(entity_id,change_set_id,ai_profile_id,binding_kind,contract_key,contract_version,position,created_by) VALUES('${id}','${draft}','${profileId}','insight_provider','fixture.provider',1,2,'${actor}');COMMIT;`,
        "NATIVE_SNAPSHOT_AI_ORDER_INVALID",
      );
      reject(
        `SELECT metadata.fn_assert_native_authoring_contract('${draft}','${pin}');`,
        "NATIVE_ROOT_PIN_INVALID",
      );
      // A successful explicit assertion cannot authorize a later invalid edit.
      reject(
        `${aggregateCheck} UPDATE metadata.entity_ai_profile SET tenant_id='${randomUUID()}';COMMIT;`,
        "NATIVE_SNAPSHOT_OWNER_INVALID",
      );
      query(
        `BEGIN;SAVEPOINT invalid_edit;UPDATE metadata.entity_ai_profile SET entity_id='${randomUUID()}';ROLLBACK TO SAVEPOINT invalid_edit;${aggregateCheck}COMMIT;`,
      );
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
