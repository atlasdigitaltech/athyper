import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { nativeAiDdl } from "./native-ai-ddl.js";
const enabled = process.env.ATHYPER_NATIVE_AI_POSTGRES === "1";
/** Real generated AI constraints; disposable prerequisite tables and guard/UUID
 * functions are test doubles. This is not deployed authoring qualification. */
it.skipIf(!enabled)(
  "applies AI DDL and rejects NULL provenance and cross-draft references",
  async () => {
    const name = "athyper-native-ai-" + randomUUID();
    let created = false;
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    const query = (sql: string) =>
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
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
        ],
        { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "athyper.purpose=native-ai-ddl-test",
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        process.env.ATHYPER_TEST_POSTGRES_IMAGE ?? "postgres:16.15-bookworm",
      );
      created = true;
      let ready = false;
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
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      expect(ready).toBe(true);
      query(
        "CREATE SCHEMA metadata;CREATE SCHEMA shared;CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';CREATE FUNCTION metadata.trg_guard_entity_graph_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY);",
      );
      for (const t of [
        "entity_field",
        "entity_search_profile",
        "entity_operation",
        "entity_relation",
      ])
        query(
          `CREATE TABLE metadata.${t}(id uuid PRIMARY KEY,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id)${["entity_field", "entity_operation"].includes(t) ? ",UNIQUE(change_set_id,id)" : ""});`,
        );
      query(nativeAiDdl());
      const draft = randomUUID(),
        other = randomUUID(),
        entity = randomUUID(),
        actor = randomUUID(),
        profile = randomUUID(),
        field = randomUUID(),
        binding = randomUUID();
      query(`INSERT INTO metadata.entity_change_set VALUES('${draft}'),('${other}');INSERT INTO metadata.entity_field VALUES('${field}','${other}');
  INSERT INTO metadata.entity_ai_profile(id,entity_id,change_set_id,created_by,enabled,description,aliases,context_kinds,search_profile_id,vocabulary_locale) VALUES('${profile}','${entity}','${draft}','${actor}',true,NULL,ARRAY['reference'],ARRAY['record'],NULL,'en');
  INSERT INTO metadata.entity_ai_binding(id,entity_id,change_set_id,created_by,ai_profile_id,binding_kind,contract_key,contract_version,required,operation_id,position) VALUES('${binding}','${entity}','${draft}','${actor}','${profile}','insight_provider','entity_lookup',1,NULL,NULL,1);`);
      expect(() =>
        query(
          `INSERT INTO metadata.entity_ai_field(entity_id,change_set_id,created_by,ai_profile_id,entity_field_id,position) VALUES('${entity}','${draft}','${actor}','${profile}','${field}',1)`,
        ),
      ).toThrow(/foreign key/);
      const term = (kind: string, source: string, tenant: string) =>
        `INSERT INTO metadata.entity_ai_term(entity_id,change_set_id,created_by,ai_profile_id,provider_binding_id,phrase,origin_kind,origin_plane,origin_source_kind,origin_tenant_id,origin_candidate_id,origin_proposal_hash) VALUES('${entity}','${draft}','${actor}','${profile}','${binding}','find records','${kind}','studio',${source},${tenant},'${randomUUID()}','${"a".repeat(64)}')`;
      expect(() => query(term("learning_candidate", "NULL", "NULL"))).toThrow(
        /check constraint/,
      );
      expect(() => query(term("authored", "'platform'", "NULL"))).toThrow(
        /check constraint/,
      );
      expect(() =>
        query(term("learning_candidate", "'tenant'", "NULL")),
      ).toThrow(/check constraint/);
      query(term("learning_candidate", "'platform'", "NULL"));
      expect(() =>
        query(
          `UPDATE metadata.entity_ai_profile SET aliases=ARRAY['duplicate','duplicate'] WHERE id='${profile}'`,
        ),
      ).toThrow(/check constraint/);
      expect(() =>
        query(
          `UPDATE metadata.entity_ai_profile SET aliases=ARRAY[repeat('a',81)] WHERE id='${profile}'`,
        ),
      ).toThrow(/check constraint/);
      expect(() =>
        query(
          `UPDATE metadata.entity_ai_profile SET context_kinds=ARRAY[]::text[] WHERE id='${profile}'`,
        ),
      ).toThrow(/check constraint/);
      expect(() =>
        query(
          "UPDATE metadata.entity_ai_profile SET aliases=ARRAY[['one','two']] WHERE id='" +
            profile +
            "'",
        ),
      ).toThrow(/check constraint/);
      expect(() =>
        query(
          "UPDATE metadata.entity_ai_profile SET aliases='[0:1]={one,two}'::text[] WHERE id='" +
            profile +
            "'",
        ),
      ).toThrow(/check constraint/);
      query(
        "CREATE ROLE synthetic_ai_reader;GRANT USAGE ON SCHEMA metadata TO synthetic_ai_reader;GRANT SELECT ON metadata.entity_ai_profile TO synthetic_ai_reader;",
      );
      expect(
        query(
          "SET ROLE synthetic_ai_reader;SELECT count(*) FROM metadata.entity_ai_profile",
        )
          .split("\n")
          .at(-1),
      ).toBe("0");
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
