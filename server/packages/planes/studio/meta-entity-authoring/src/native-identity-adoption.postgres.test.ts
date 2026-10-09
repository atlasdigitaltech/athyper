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
 CREATE TABLE metadata.entity_authoring_command_receipt(change_set_id uuid,tenant_id uuid,actor_id uuid,revision bigint,expected_revision bigint,changed boolean,identities jsonb);
 ALTER TABLE metadata.entity_change_set ADD COLUMN created_by uuid DEFAULT '${actor}';
 CREATE TABLE metadata.entity_field_identity(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,field_key text,identity_status text,introduced_change_set_id uuid);
 CREATE TABLE metadata.entity_field(id uuid PRIMARY KEY,change_set_id uuid,entity_id uuid,tenant_id uuid,field_identity_id uuid,field_key text);
 CREATE TABLE snapshot.entity_draft_save(change_set_id uuid,lock_version bigint,tenant_id uuid,graph_hash text,graph jsonb,PRIMARY KEY(change_set_id,lock_version));
 CREATE FUNCTION entity_command_private.admitted(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p='${target}'::uuid AND current_setting('app.current_principal_id',true)='${actor}' $$;
 CREATE FUNCTION entity_command_private.native_bootstrap_writable(p uuid,e uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT entity_command_private.admitted(p) AND e='${entity}'::uuid $$;
 CREATE FUNCTION metadata.guard_field_identity_binding() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE identity metadata.entity_field_identity%ROWTYPE; BEGIN SELECT * INTO STRICT identity FROM metadata.entity_field_identity WHERE id=NEW.field_identity_id; IF identity.identity_status='reserved' AND identity.introduced_change_set_id<>NEW.change_set_id THEN RAISE EXCEPTION 'Unreconciled identity reservation'; END IF; RETURN NEW; END $$;
 CREATE FUNCTION metadata.fn_assert_native_core_graph(draft uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM metadata.entity_field_identity i WHERE (i.identity_status<>'active' AND NOT(i.identity_status='reserved' AND i.introduced_change_set_id=draft))) THEN RAISE EXCEPTION 'unavailable'; END IF; END $$;
 CREATE FUNCTION metadata.fn_assert_native_typed_rows(p uuid,v integer) RETURNS void LANGUAGE plpgsql AS $$ DECLARE root record; BEGIN SELECT p id INTO root; PERFORM 1 FROM metadata.entity_field_identity target WHERE (target.identity_status='active' OR (target.identity_status='reserved' AND target.introduced_change_set_id=root.id)); END $$;
 INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,source_kind,lock_version,status) VALUES('${source}','${entity}',NULL,'product',4,'draft'),('${target}','${entity}',NULL,'product',1,'draft'),('${foreign}','${randomUUID()}',NULL,'product',1,'draft');
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
      // Different graph byte ordering is accepted only through the exact receipt.
      q(
        `UPDATE snapshot.entity_draft_save SET graph_hash='${"c".repeat(64)}' WHERE change_set_id='${target}';`,
      );
      expect(() => q(enter + adopt() + "COMMIT;")).toThrow();
      q(
        `INSERT INTO metadata.entity_authoring_command_receipt VALUES('${target}',NULL,'${actor}',1,0,true,'${JSON.stringify({ proposalHash: proposal, graphHash: "c".repeat(64) })}');`,
      );
      q(enter + adopt() + "ROLLBACK;");
      q(
        `UPDATE metadata.entity_authoring_command_receipt SET actor_id='${randomUUID()}';`,
      );
      expect(() => q(enter + adopt() + "COMMIT;")).toThrow();
      q(
        `DELETE FROM metadata.entity_authoring_command_receipt; UPDATE snapshot.entity_draft_save SET graph_hash='${proposal}' WHERE change_set_id='${target}';`,
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
      // Published native inheritance uses an exact release; it cannot enter the
      // legacy draft-adoption routine. Admission remains a synthetic test port.
      const nativeSource = randomUUID(),
        nativeTarget = randomUUID(),
        nativeIdentity = randomUUID(),
        nativeSourceField = randomUUID(),
        nativeTargetField = randomUUID(),
        release = randomUUID(),
        revision = randomUUID();
      const nativeGraph = JSON.stringify({
        fields: [{ id: nativeSourceField, fieldIdentityId: nativeIdentity }],
      });
      q(`ALTER TABLE metadata.entity_change_set ADD COLUMN base_release_id uuid, ADD COLUMN native_core_layout_version integer;
 CREATE TABLE metadata.entity_release(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,change_set_id uuid,revision_id uuid,contract_hash text,revision_hash text);
 CREATE TABLE snapshot.entity_contract_revision(id uuid PRIMARY KEY,change_set_id uuid,entity_id uuid,tenant_id uuid,validation_status text,contract_hash text,revision_hash text,contract_json jsonb);
 INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,source_kind,lock_version,status,base_release_id,native_core_layout_version) VALUES('${nativeSource}','${entity}',NULL,'product',4,'published',NULL,2),('${nativeTarget}','${entity}',NULL,'product',1,'draft','${release}',2);
 INSERT INTO metadata.entity_field_identity VALUES('${nativeIdentity}','${entity}',NULL,'native_code','reserved','${nativeSource}');
 INSERT INTO metadata.entity_field VALUES('${nativeSourceField}','${nativeSource}','${entity}',NULL,'${nativeIdentity}',NULL);
 INSERT INTO snapshot.entity_draft_save VALUES('${nativeSource}',4,NULL,'${hash}','${nativeGraph}');
 INSERT INTO metadata.entity_release VALUES('${release}','${entity}',NULL,'${nativeSource}','${revision}','${hash}','${proposal}');
 INSERT INTO snapshot.entity_contract_revision VALUES('${revision}','${nativeSource}','${entity}',NULL,'valid','${hash}','${proposal}','${nativeGraph}');
 CREATE OR REPLACE FUNCTION entity_command_private.admitted(p uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT p IN ('${target}'::uuid,'${nativeTarget}'::uuid) AND current_setting('app.current_principal_id',true)='${actor}' $$;`);
      q(
        readFileSync(
          new URL(
            "../../../../../db/ddl/planes/studio/metadata/65_native_identity_inheritance.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const inherit = (r = release, h = hash) =>
        `SELECT entity_command_private.inherit_native_identity('${nativeTarget}','${nativeIdentity}','${nativeTargetField}','${r}','${nativeSource}','${nativeSourceField}',4,'${h}','${proposal}');`;
      const original = q(
        `SELECT row_to_json(i) FROM metadata.entity_field_identity i WHERE id='${nativeIdentity}'; SELECT graph FROM snapshot.entity_draft_save WHERE change_set_id='${nativeSource}';`,
      );
      expect(() => q(enter + inherit(randomUUID()) + "COMMIT;")).toThrow();
      expect(() =>
        q(enter + inherit(release, "c".repeat(64)) + "COMMIT;"),
      ).toThrow();
      expect(() => q(enter + inherit() + "COMMIT;")).toThrow(); // missing target save
      expect(() =>
        q(
          enter +
            `SELECT entity_command_private.adopt_native_identity('${nativeTarget}','${nativeIdentity}','${nativeTargetField}','${nativeSource}','${nativeSourceField}',4,'${hash}','${proposal}'); COMMIT;`,
        ),
      ).toThrow();
      q(
        `INSERT INTO metadata.entity_field VALUES('${nativeTargetField}','${nativeTarget}','${entity}',NULL,'${nativeIdentity}',NULL); INSERT INTO snapshot.entity_draft_save VALUES('${nativeTarget}',1,NULL,'${proposal}','{}');`,
      );
      q(enter + inherit() + "ROLLBACK;");
      expect(
        q(
          `SELECT count(*) FROM metadata.entity_field_identity_adoption WHERE change_set_id='${nativeTarget}';`,
        ).trim(),
      ).toBe("0");
      q(enter + inherit() + inherit() + "COMMIT;");
      expect(
        q(
          `SELECT count(*) FROM metadata.entity_field_identity_adoption WHERE change_set_id='${nativeTarget}';`,
        ).trim(),
      ).toBe("1");
      expect(
        q(
          `SELECT metadata.native_identity_available('${nativeTarget}','${nativeIdentity}');`,
        ).trim(),
      ).toBe("t");
      expect(
        q(
          `SELECT row_to_json(i) FROM metadata.entity_field_identity i WHERE id='${nativeIdentity}'; SELECT graph FROM snapshot.entity_draft_save WHERE change_set_id='${nativeSource}';`,
        ),
      ).toBe(original);
      q(`CREATE TABLE metadata.entity(id uuid PRIMARY KEY,tenant_id uuid,ownership_model text);
 INSERT INTO metadata.entity VALUES('${entity}',NULL,'system');
 CREATE TABLE metadata.entity_operation(id uuid PRIMARY KEY,change_set_id uuid,entity_id uuid,tenant_id uuid,export_max_records bigint,requires_mfa boolean);
 INSERT INTO metadata.entity_operation VALUES('${randomUUID()}','${nativeSource}','${entity}',NULL,NULL,true);
 CREATE FUNCTION entity_command_private.admitted_creation(t uuid,e uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT entity_command_private.admitted(t) AND e='${entity}'::uuid $$;
 CREATE FUNCTION entity_command_private.read_operation_bootstrap_source(uuid,text,uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT false $$;`);
      q(
        readFileSync(
          new URL(
            "../../../../../db/ddl/planes/studio/metadata/66_native_successor_source.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const readSource = (releaseId = release, entityId = entity) =>
        `SELECT source_change_set_id,operation_rows->0->>'requires_mfa',identity_rows->0->>'native_available' FROM entity_command_private.read_native_successor_source('${nativeTarget}','${entityId}','${releaseId}',4194304);`;
      expect(q(enter + readSource() + "COMMIT;")).toContain(
        nativeSource + "|true|true",
      );
      expect(() => q(enter + readSource(randomUUID()) + "COMMIT;")).toThrow();
      expect(() =>
        q(enter + readSource(release, randomUUID()) + "COMMIT;"),
      ).toThrow();
      expect(() =>
        q(
          `SET SESSION AUTHORIZATION adoption_client;BEGIN;SET LOCAL app.current_principal_id='${randomUUID()}';` +
            readSource() +
            "COMMIT;",
        ),
      ).toThrow();
      expect(() =>
        q(enter + `SELECT * FROM metadata.entity_operation;COMMIT;`),
      ).toThrow();
      // The real base guard must use the admitted reader even when RLS hides the
      // predecessor table from the caller. This remains fixture admission.
      const ddl = readFileSync(
        new URL(
          "../../../../../db/ddl/planes/studio/metadata/07_functions.sql",
          import.meta.url,
        ),
        "utf8",
      );
      const start = ddl.indexOf(
        "CREATE OR REPLACE FUNCTION metadata.trg_guard_entity_change_set()",
      );
      q(ddl.slice(start, ddl.indexOf("$$;", start) + 3));
      q(`ALTER TABLE metadata.entity_change_set ADD COLUMN parent_change_set_id uuid;
        CREATE TABLE metadata.guard_probe (LIKE metadata.entity_change_set);
        CREATE TRIGGER base_guard BEFORE INSERT ON metadata.guard_probe FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_change_set();
        GRANT SELECT ON metadata.entity TO athyper_product_command_app;
        GRANT INSERT ON metadata.guard_probe TO athyper_product_command_app;`);
      const probe = (r = release) =>
        `INSERT INTO metadata.guard_probe(id,entity_id,tenant_id,status,base_release_id) VALUES('${nativeTarget}','${entity}',NULL,'draft','${r}');`;
      q(enter + probe() + "ROLLBACK;");
      // Publication readers are not command-role members and cannot resolve the
      // private schema. Their ordinary, scoped predecessor read must still work.
      q(`CREATE ROLE publication_probe NOLOGIN;
        GRANT USAGE ON SCHEMA metadata TO publication_probe;
        GRANT SELECT ON metadata.entity,metadata.entity_change_set,metadata.entity_release TO publication_probe;
        GRANT INSERT ON metadata.guard_probe TO publication_probe;
        CREATE POLICY publication_probe_read ON metadata.entity_release FOR SELECT TO publication_probe USING (true);`);
      q(`BEGIN; SET LOCAL ROLE publication_probe;` + probe() + "ROLLBACK;");
      expect(() =>
        q(
          `BEGIN; SET LOCAL ROLE publication_probe; SELECT entity_command_private.admitted_creation('${nativeTarget}','${entity}'); ROLLBACK;`,
        ),
      ).toThrow();

      expect(() => q(enter + probe(randomUUID()) + "COMMIT;")).toThrow();
      expect(() =>
        q(
          `SET SESSION AUTHORIZATION adoption_client;BEGIN;SET LOCAL app.current_principal_id='${randomUUID()}';` +
            probe() +
            "COMMIT;",
        ),
      ).toThrow();
      expect(() =>
        q(enter + "SELECT * FROM metadata.entity_release;COMMIT;"),
      ).toThrow();
      q(`ALTER TABLE metadata.entity_operation ADD COLUMN operation_key text DEFAULT 'read', ADD COLUMN operation_kind text DEFAULT 'read', ADD COLUMN authorization_effect text DEFAULT 'read';
        CREATE OR REPLACE FUNCTION entity_command_private.native_bootstrap_writable(p uuid,e uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT entity_command_private.admitted_creation(p,e) $$;`);
      for (const file of [
        "60_declared_operation_initialization.sql",
        "67_native_successor_operation_guard.sql",
      ])
        q(
          readFileSync(
            new URL(
              "../../../../../db/ddl/planes/studio/metadata/" + file,
              import.meta.url,
            ),
            "utf8",
          ),
        );
      q(`CREATE TRIGGER operation_guard BEFORE INSERT ON metadata.entity_operation FOR EACH ROW EXECUTE FUNCTION entity_command_private.guard_native_operation_initialization();
        GRANT INSERT ON metadata.entity_operation TO athyper_product_command_app;`);
      const operation = (control: boolean, key = "read") =>
        `INSERT INTO metadata.entity_operation(id,change_set_id,entity_id,tenant_id,requires_mfa,operation_key) VALUES('${randomUUID()}','${nativeTarget}','${entity}',NULL,${control},'${key}');`;
      q(enter + operation(true) + "ROLLBACK;");
      expect(() => q(enter + operation(false) + "COMMIT;")).toThrow();
      expect(() => q(enter + operation(true, "new") + "COMMIT;")).toThrow();
      q(
        `UPDATE metadata.entity_operation SET requires_mfa=false WHERE change_set_id='${nativeSource}';`,
      );
      q(enter + operation(false) + "ROLLBACK;");
      expect(() => q(enter + operation(true) + "COMMIT;")).toThrow();
    } finally {
      if (started) docker("rm", "-f", name);
    }
  },
  30000,
);
