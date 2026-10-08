import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

// Disposable policy regression, not authenticated DEV approval evidence.
// Replaces the retired Address/adoption rehearsal; never mutates DEV.
it.skipIf(process.env.PRODUCT_REVIEW_POSTGRES !== "1")(
  "requires native authorship and independent exact submission under the control role",
  async () => {
    const name = "athyper-native-review-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const query = (input: string) =>
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
    const id = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
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
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      query(`CREATE ROLE athyper_control_api NOLOGIN; CREATE SCHEMA metadata; CREATE SCHEMA master; CREATE SCHEMA shared;
        CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.tenant',true)::uuid $$;
        CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.actor',true)::uuid $$;
        CREATE TABLE master.principal(id uuid,tenant_id uuid,status text,principal_type text);
        CREATE TABLE master.principal_identity_binding(principal_id uuid,tenant_id uuid,service_client_id uuid,realm_key text,audience text,status text);
        CREATE TABLE metadata.entity(id uuid,tenant_id uuid,ownership_model text);
        CREATE TABLE metadata.entity_change_set(id uuid,entity_id uuid,tenant_id uuid,source_kind text,native_core_layout_version int,lock_version bigint,status text,created_by uuid,submitted_by uuid);
        CREATE TABLE metadata.entity_product_review_receipt(authority_tenant_id uuid,request_id uuid PRIMARY KEY,change_set_id uuid,actor_id uuid,action text,expected_revision bigint,contract_hash text);
        ALTER TABLE metadata.entity_product_review_receipt ENABLE ROW LEVEL SECURITY;
        ALTER TABLE metadata.entity_product_review_receipt FORCE ROW LEVEL SECURITY;
        CREATE POLICY receipt_read ON metadata.entity_product_review_receipt FOR SELECT TO athyper_control_api USING(authority_tenant_id=shared.current_tenant_id_soft());
        GRANT USAGE ON SCHEMA master,metadata,shared TO athyper_control_api;
        GRANT SELECT ON ALL TABLES IN SCHEMA master,metadata TO athyper_control_api;
        GRANT INSERT ON metadata.entity_product_review_receipt TO athyper_control_api;
        INSERT INTO master.principal VALUES('${id(1)}','${id(3)}','active','user'),('${id(2)}','${id(3)}','active','user');
        INSERT INTO master.principal_identity_binding SELECT id,tenant_id,NULL,'platform-control','athyper-platform-control-api','active' FROM master.principal;
        INSERT INTO metadata.entity VALUES('${id(4)}',NULL,'system');
        INSERT INTO metadata.entity_change_set VALUES('${id(5)}','${id(4)}',NULL,'product',2,1,'draft','${id(1)}',NULL);`);
      const ddl = readFileSync(
        new URL(
          "../../../../../db/ddl/planes/studio/metadata/62_native_product_review.sql",
          import.meta.url,
        ),
        "utf8",
      );
      query(ddl);
      let request = 10;
      const insert = (
        actor: number,
        action: string,
        revision: number,
        hash = "a".repeat(64),
        tenant = 3,
        rollback = false,
      ) =>
        query(`BEGIN; SET LOCAL ROLE athyper_control_api; SET LOCAL app.actor='${id(actor)}'; SET LOCAL app.tenant='${id(tenant)}';
        INSERT INTO metadata.entity_product_review_receipt VALUES('${id(tenant)}','${id(request++)}','${id(5)}','${id(actor)}','${action}',${revision},'${hash}'); ${rollback ? "ROLLBACK" : "COMMIT"};`);
      expect(() => insert(1, "adopt", 1)).toThrow();
      expect(() => insert(2, "submit", 1)).toThrow();
      expect(() => insert(1, "submit", 1, undefined, 6)).toThrow();
      insert(1, "submit", 1, undefined, 3, true);
      expect(
        query(
          "SELECT count(*) FROM metadata.entity_product_review_receipt",
        ).trim(),
      ).toBe("0");
      insert(1, "submit", 1);
      query(
        `UPDATE metadata.entity_change_set SET status='in_review',lock_version=2,submitted_by='${id(1)}';`,
      );
      expect(() => insert(1, "approve", 2)).toThrow();
      expect(() => insert(2, "approve", 2, "b".repeat(64))).toThrow();
      expect(() => insert(2, "approve", 1)).toThrow();
      insert(2, "approve", 2);
      expect(
        query(
          "SELECT count(*) FROM metadata.entity_product_review_receipt",
        ).trim(),
      ).toBe("2");
      query(
        `UPDATE metadata.entity_change_set SET status='draft',lock_version=1,native_core_layout_version=NULL;`,
      );
      expect(() => insert(1, "submit", 1)).toThrow();
      // Exercise the canonical source reader and immutable lifecycle capture.
      // Only the component reader is excluded here; signed component evidence is
      // exercised by the production-composition restored-database rehearsal.
      query(`CREATE SCHEMA publication; CREATE SCHEMA snapshot;
        ALTER TABLE metadata.entity_change_set ADD status_changed_by uuid;
        CREATE TABLE snapshot.entity_draft_save(change_set_id uuid,lock_version bigint,tenant_id uuid,graph jsonb,graph_hash text,captured_by uuid,capture_kind text,PRIMARY KEY(change_set_id,lock_version));
        CREATE TABLE metadata.entity_operation(id uuid,change_set_id uuid,entity_id uuid,tenant_id uuid,export_max_records bigint);
        CREATE TABLE metadata.entity_field_identity(id uuid,entity_id uuid,tenant_id uuid);
        CREATE TABLE metadata.entity_field(change_set_id uuid,field_identity_id uuid);
        GRANT USAGE ON SCHEMA publication TO athyper_control_api;
        UPDATE metadata.entity_change_set SET native_core_layout_version=2;
        INSERT INTO snapshot.entity_draft_save VALUES('${id(5)}',1,NULL,'{"exact":"source"}','${"a".repeat(64)}','${id(1)}','saved');`);
      const nativeSourceDdl = readFileSync(
        new URL(
          "../../../../../db/ddl/planes/studio/metadata/63_native_review_source.sql",
          import.meta.url,
        ),
        "utf8",
      );
      query(nativeSourceDdl.split("-- Exact installed component evidence")[0]!);
      const source = (actor: number, tenant = 3, bound = 4194304) =>
        query(`BEGIN; SET LOCAL ROLE athyper_control_api;
        SET LOCAL app.actor='${id(actor)}'; SET LOCAL app.tenant='${id(tenant)}';
        SELECT graph_hash FROM publication.read_native_product_review_source('${id(5)}',${bound}); ROLLBACK;`);
      expect(source(1)).toContain("a".repeat(64));
      expect(() => source(1, 6)).toThrow();
      expect(() => source(1, 3, 1)).toThrow();
      query(
        `UPDATE master.principal SET status='disabled' WHERE id='${id(1)}'`,
      );
      expect(() => source(1)).toThrow();
      query(`UPDATE master.principal SET status='active' WHERE id='${id(1)}'`);
      query(
        `BEGIN; UPDATE metadata.entity_change_set SET status='in_review',lock_version=2,status_changed_by='${id(1)}'; ROLLBACK;`,
      );
      expect(
        query("SELECT count(*) FROM snapshot.entity_draft_save").trim(),
      ).toBe("1");
      expect(() =>
        query(
          `UPDATE metadata.entity_change_set SET status='in_review',lock_version=2,entity_id='${id(9)}',status_changed_by='${id(1)}'`,
        ),
      ).toThrow();
      expect(() =>
        query(
          `UPDATE metadata.entity_change_set SET status='in_review',lock_version=3,status_changed_by='${id(1)}'`,
        ),
      ).toThrow();
      query(`UPDATE metadata.entity_change_set SET status='in_review',lock_version=2,status_changed_by='${id(1)}';
        UPDATE metadata.entity_change_set SET status='approved',lock_version=3,status_changed_by='${id(2)}';`);
      expect(
        query(
          "SELECT count(DISTINCT graph_hash)||'|'||count(*) FROM snapshot.entity_draft_save",
        ).trim(),
      ).toBe("1|3");
      expect(source(2)).toContain("a".repeat(64));
      // The lifecycle command must force deferred validation within its narrow
      // definer scope, without adding direct native-table read privileges.
      query(`CREATE DOMAIN metadata.entity_change_set_status_d AS text;
        CREATE FUNCTION metadata.review_test_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          NEW.lock_version:=OLD.lock_version+1;
          IF NEW.status='in_review' THEN NEW.submitted_by:=NEW.status_changed_by; END IF;
          RETURN NEW; END $$;
        CREATE TRIGGER review_test_revision BEFORE UPDATE OF status ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION metadata.review_test_revision();
        CREATE FUNCTION metadata.review_test_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
          IF current_user='athyper_control_api' THEN RAISE EXCEPTION 'DEFERRED_GUARD_OUTSIDE_COMMAND'; END IF;
          RETURN NEW; END $$;
        INSERT INTO metadata.entity_change_set(id,entity_id,source_kind,native_core_layout_version,lock_version,status,created_by)
          VALUES('${id(25)}','${id(4)}','product',2,1,'draft','${id(1)}');
        INSERT INTO snapshot.entity_draft_save VALUES('${id(25)}',1,NULL,'{"exact":"source"}','${"a".repeat(64)}','${id(1)}','saved');`);
      for (const name of [
        "native_layout_final_guard",
        "native_core_final_guard",
        "native_root_final_guard",
        "native_snapshot_final_guard",
        "settings_locale_check",
      ])
        query(
          `CREATE CONSTRAINT TRIGGER ${name} AFTER UPDATE ON metadata.entity_change_set DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.review_test_guard()`,
        );
      query(
        readFileSync(
          new URL(
            "../../../../../db/ddl/planes/studio/metadata/64_native_review_transition.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const transition = (
        actor: number,
        revision: number,
        from: string,
        to: string,
        requestedActor = actor,
      ) =>
        query(`BEGIN;
        SET LOCAL ROLE athyper_control_api; SET LOCAL app.actor='${id(actor)}'; SET LOCAL app.tenant='${id(3)}';
        SELECT publication.transition_native_product_review('${id(25)}',${revision},'${from}','${to}','${id(requestedActor)}'); COMMIT;`);
      expect(() => transition(1, 1, "draft", "in_review")).toThrow();
      query(`BEGIN; SET LOCAL ROLE athyper_control_api; SET LOCAL app.actor='${id(1)}'; SET LOCAL app.tenant='${id(3)}';
        INSERT INTO metadata.entity_product_review_receipt VALUES('${id(3)}','${id(26)}','${id(25)}','${id(1)}','submit',1,'${"a".repeat(64)}'); COMMIT;`);
      expect(() => transition(1, 1, "draft", "in_review", 2)).toThrow();
      expect(() => transition(2, 1, "draft", "in_review")).toThrow();
      transition(1, 1, "draft", "in_review");
      expect(() => transition(1, 1, "draft", "in_review")).toThrow();
      expect(() => transition(1, 2, "in_review", "approved")).toThrow();
      expect(
        query(
          `SELECT lock_version FROM metadata.entity_change_set WHERE id='${id(25)}'`,
        ).trim(),
      ).toBe("2");
      expect(
        query(
          `SELECT has_table_privilege('athyper_control_api','metadata.entity_field_identity','SELECT')`,
        ).trim(),
      ).toBe("f");

      expect(
        query(
          "SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname='athyper_control_api'",
        ).trim(),
      ).toBe("f");
    } finally {
      try {
        docker("rm", "-f", name);
      } catch {}
    }
  },
  60000,
);
