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
          docker("exec", name, "pg_isready", "-U", "postgres");
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
