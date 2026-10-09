import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

it.skipIf(process.env.NATIVE_PUBLICATION_POSTGRES !== "1")(
  "validates queued native guards under exact publication authority without runtime graph reads",
  async () => {
    const name = `native-validation-${randomUUID()}`;
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const q = (input: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-XAt",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    try {
      docker(
        "run",
        "--rm",
        "-d",
        "--name",
        name,
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:16",
      );
      for (let i = 0; i < 60; i++) {
        try {
          docker("exec", name, "pg_isready", "-U", "postgres");
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      q(`CREATE SCHEMA metadata; CREATE SCHEMA publication; CREATE SCHEMA master; CREATE SCHEMA shared;
CREATE ROLE runtime NOLOGIN;
CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.actor',true),'')::uuid $$;
CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-4000-8000-000000000002'::uuid $$;
CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,native_core_layout_version int,tenant_id uuid,source_kind text,status text,valid boolean);
CREATE TABLE metadata.entity_release(id uuid PRIMARY KEY,change_set_id uuid,published_by uuid);
CREATE TABLE publication.release(id uuid PRIMARY KEY,tenant_id uuid,created_by uuid,metadata jsonb);
CREATE TABLE publication.entity_release_link(publication_release_id uuid,entity_release_id uuid);
ALTER TABLE metadata.entity_change_set ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA metadata,publication,master,shared TO runtime;
GRANT SELECT,UPDATE ON metadata.entity_change_set TO runtime;
GRANT INSERT ON publication.entity_release_link TO runtime;
CREATE FUNCTION publication.fn_system_entity_authority(uuid,text) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
 IF master.current_principal_id_soft() IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid THEN RAISE EXCEPTION 'AUTHORITY_DENIED'; END IF;
 RETURN '{"humanReview":true,"executionPolicy":{"fixture":true}}'::jsonb; END $$;
CREATE FUNCTION metadata.check_graph() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE ok boolean; BEGIN
 SELECT valid INTO STRICT ok FROM metadata.entity_change_set WHERE id=NEW.id FOR UPDATE;
 IF NOT ok THEN RAISE EXCEPTION 'INVALID_GRAPH'; END IF; RETURN NULL; END $$;
DO $$ DECLARE n text; BEGIN FOREACH n IN ARRAY ARRAY['native_core_final_guard','native_layout_final_guard','native_root_final_guard','native_snapshot_final_guard','settings_locale_check'] LOOP
 EXECUTE format('CREATE CONSTRAINT TRIGGER %I AFTER UPDATE ON metadata.entity_change_set DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.check_graph()',n); END LOOP; END $$;
INSERT INTO metadata.entity_change_set VALUES('00000000-0000-4000-8000-000000000003',2,NULL,'product','published',true);
INSERT INTO metadata.entity_release VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001');
INSERT INTO publication.release VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','{"humanExecutionPolicy":{"fixture":true}}');`);
      const begin = `BEGIN; SET LOCAL app.actor='00000000-0000-4000-8000-000000000001'; UPDATE metadata.entity_change_set SET valid=valid; SET LOCAL ROLE runtime;`;
      const link = `INSERT INTO publication.entity_release_link VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000004'); COMMIT;`;
      expect(() => q(begin + link)).toThrow(/query returned no rows/);
      q(
        readFileSync(
          new URL(
            "../../../../../../db/ddl/planes/studio/publication/38_native_publication_validation.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      expect(q(begin + link)).toContain("COMMIT");
      expect(
        q("SET ROLE runtime; SELECT count(*) FROM metadata.entity_change_set;")
          .trim()
          .split("\n")
          .at(-1),
      ).toBe("0");
      expect(() =>
        q(begin.replace("SET valid=valid", "SET valid=false") + link),
      ).toThrow(/INVALID_GRAPH/);
      expect(() =>
        q(
          begin.replace(
            "app.actor='00000000-0000-4000-8000-000000000001'",
            "app.actor='00000000-0000-4000-8000-000000000009'",
          ) + link,
        ),
      ).toThrow(/AUTHORITY_DENIED/);
      expect(
        q("SELECT count(*) FROM publication.entity_release_link;").trim(),
      ).toBe("1");
      expect(
        q(
          "SELECT has_function_privilege('runtime','publication.finish_native_publication_validation()','EXECUTE');",
        ).trim(),
      ).toBe("f");
    } finally {
      try {
        docker("rm", "-f", name);
      } catch {
        /* already stopped */
      }
    }
  },
  60000,
);
