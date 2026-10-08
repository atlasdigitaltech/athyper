import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
// Real adoption SQL and FK/immutable/deferred guards; synthetic admission port.
// This does not attest authenticated DEV authority or whole native compilation.
it.skipIf(process.env.ATHYPER_IDENTITY_ADOPTION_POSTGRES !== "1")(
  "preserves reservation provenance and binds adoption to source and final saved target",
  async () => {
    const name = "athyper-identity-adoption-" + randomUUID();
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
        source = randomUUID(),
        target = randomUUID(),
        foreign = randomUUID(),
        identity = randomUUID(),
        sourceField = randomUUID(),
        targetField = randomUUID(),
        actor = randomUUID(),
        hash = "a".repeat(64),
        proposal = "b".repeat(64);
      q(`CREATE SCHEMA metadata;CREATE SCHEMA snapshot;CREATE SCHEMA entity_command_private;
 CREATE ROLE athyper_product_command_app NOLOGIN; CREATE ROLE adoption_client LOGIN;GRANT athyper_product_command_app TO adoption_client;
 CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,source_kind text,lock_version bigint,status text);
 CREATE TABLE metadata.entity_field_identity(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,field_key text,identity_status text,introduced_change_set_id uuid);
 CREATE TABLE metadata.entity_field(id uuid PRIMARY KEY,change_set_id uuid,entity_id uuid,tenant_id uuid,field_identity_id uuid,field_key text);
 CREATE TABLE snapshot.entity_draft_save(change_set_id uuid,lock_version bigint,tenant_id uuid,graph_hash text,graph jsonb,PRIMARY KEY(change_set_id,lock_version));
 CREATE FUNCTION entity_command_private.admitted(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p='${target}'::uuid AND current_setting('app.current_principal_id',true)='${actor}' $$;
 CREATE FUNCTION entity_command_private.native_bootstrap_writable(p uuid,e uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT entity_command_private.admitted(p) AND e='${entity}'::uuid $$;
 CREATE FUNCTION metadata.guard_field_identity_binding() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE identity metadata.entity_field_identity%ROWTYPE; BEGIN SELECT * INTO STRICT identity FROM metadata.entity_field_identity WHERE id=NEW.field_identity_id; IF identity.identity_status='reserved' AND identity.introduced_change_set_id<>NEW.change_set_id THEN RAISE EXCEPTION 'Unreconciled identity reservation'; END IF; RETURN NEW; END $$;
 CREATE FUNCTION metadata.fn_assert_native_core_graph(draft uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM metadata.entity_field_identity i WHERE (i.identity_status<>'active' AND NOT(i.identity_status='reserved' AND i.introduced_change_set_id=draft))) THEN RAISE EXCEPTION 'unavailable'; END IF; END $$;
 CREATE FUNCTION metadata.fn_assert_native_typed_rows(p uuid,v integer) RETURNS void LANGUAGE plpgsql AS $$ DECLARE root record; BEGIN SELECT p id INTO root; PERFORM 1 FROM metadata.entity_field_identity target WHERE (target.identity_status='active' OR (target.identity_status='reserved' AND target.introduced_change_set_id=root.id)); END $$;
 INSERT INTO metadata.entity_change_set VALUES('${source}','${entity}',NULL,'product',4,'draft'),('${target}','${entity}',NULL,'product',1,'draft'),('${foreign}','${randomUUID()}',NULL,'product',1,'draft');
 INSERT INTO metadata.entity_field_identity VALUES('${identity}','${entity}',NULL,'code','reserved','${source}');
 INSERT INTO metadata.entity_field VALUES('${sourceField}','${source}','${entity}',NULL,'${identity}','code');
 INSERT INTO snapshot.entity_draft_save VALUES('${source}',4,NULL,'${hash}','${JSON.stringify({ fields: [{ id: sourceField, fieldKey: "code" }], fieldIdentities: [{ id: identity, entityId: entity, fieldKey: "code", introducedChangeSetId: source, identityStatus: "reserved" }] })}'::jsonb);
 GRANT USAGE ON SCHEMA metadata,entity_command_private TO athyper_product_command_app;`);
      q(
        readFileSync(
          new URL(
            "../../../../../db/ddl/planes/studio/metadata/51_native_identity_adoption.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const before = q(
        `SELECT row_to_json(i) FROM metadata.entity_field_identity i;`,
      );
      const enter = `SET SESSION AUTHORIZATION adoption_client;BEGIN;SET LOCAL app.current_principal_id='${actor}';`;
      const adopt = (h = hash, t = target, f = targetField) =>
        `SELECT entity_command_private.adopt_native_identity('${t}','${identity}','${f}','${source}','${sourceField}',4,'${h}','${proposal}');`;
      expect(() => q(enter + adopt("c".repeat(64)) + "COMMIT;")).toThrow();
      expect(() => q(enter + adopt(hash, foreign) + "COMMIT;")).toThrow();
      expect(() => q(enter + adopt() + "COMMIT;")).toThrow(); // target field/snapshot missing
      expect(
        q(
          `SELECT count(*) FROM metadata.entity_field_identity_adoption;`,
        ).trim(),
      ).toBe("0");
      q(
        `INSERT INTO metadata.entity_field VALUES('${targetField}','${target}','${entity}',NULL,'${identity}',NULL); INSERT INTO snapshot.entity_draft_save VALUES('${target}',1,NULL,'${proposal}','{}');`,
      );
      q(enter + adopt() + adopt() + "COMMIT;");
      expect(
        q(
          `SELECT count(*) FROM metadata.entity_field_identity_adoption;`,
        ).trim(),
      ).toBe("1");
      expect(
        q(`SELECT row_to_json(i) FROM metadata.entity_field_identity i;`),
      ).toBe(before);
      expect(
        q(
          `SELECT metadata.native_identity_available('${target}','${identity}'),metadata.native_identity_available('${foreign}','${identity}');`,
        ).trim(),
      ).toBe("t|f");
      expect(() =>
        q(enter + adopt(hash, target, randomUUID()) + "COMMIT;"),
      ).toThrow();
      expect(() =>
        q(
          enter + `DELETE FROM metadata.entity_field_identity_adoption;COMMIT;`,
        ),
      ).toThrow();
      expect(() =>
        q(
          `UPDATE metadata.entity_field_identity_adoption SET proposal_hash='${hash}';`,
        ),
      ).toThrow();
      expect(() =>
        q(
          `DELETE FROM snapshot.entity_draft_save WHERE change_set_id='${source}';`,
        ),
      ).toThrow();
      expect(() =>
        q(`DELETE FROM metadata.entity_field WHERE id='${targetField}';`),
      ).toThrow();
    } finally {
      if (started) docker("rm", "-f", name);
    }
  },
  30000,
);
