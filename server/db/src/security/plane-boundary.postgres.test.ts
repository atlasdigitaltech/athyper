import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  boundaryCatalogQueries,
  inspectPlaneBoundary,
  type CatalogQuery,
} from "./plane-boundary-catalog.js";
import {
  readDefinerContract,
  definerHardeningSql,
} from "./security-definer-contract.js";

const ddlRoot = new URL("../../ddl/", import.meta.url);
const migration = readFileSync(
  new URL(
    "../../migrations/20261003_entity_framework_security.sql",
    import.meta.url,
  ),
  "utf8",
);
const hardening = readFileSync(
  new URL(
    "../../ddl/common/shared/99_security_definer_hardening.sql",
    import.meta.url,
  ),
  "utf8",
);
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 32 * 1024 * 1024,
  });
function sql(
  container: string,
  database: string,
  input: string,
  user = "postgres",
) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-X",
      "-qAt",
      "-U",
      user,
      "-d",
      database,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    },
  );
}

test(
  "real three-plane definers retain RLS, bootstrap identity, and reject unlisted elevation",
  { timeout: 180_000 },
  async () => {
    const supplied = process.env["PLANE_BOUNDARY_TEST_CONTAINER"];
    const container =
      supplied ?? `athyper-plane-boundary-${randomUUID().slice(0, 8)}`;
    if (
      supplied &&
      docker(
        "inspect",
        "--format",
        '{{index .Config.Labels "athyper.purpose"}}',
        container,
      ).trim() !== "plane-boundary-test"
    )
      throw new Error(
        "Only an isolated plane-boundary-test container may receive test fixtures",
      );
    let created = false;
    try {
      if (!supplied) {
        docker(
          "run",
          "-d",
          "--name",
          container,
          "--network",
          "none",
          "--tmpfs",
          "/var/lib/postgresql/data",
          "--label",
          "athyper.purpose=plane-boundary-test",
          "-e",
          "POSTGRES_HOST_AUTH_METHOD=trust",
          "postgres:16.15-bookworm",
        );
        created = true;
        let ready = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          // The image starts a temporary socket-only server during initialization.
          // TCP readiness identifies the final server after that restart.
          try {
            docker(
              "exec",
              container,
              "pg_isready",
              "-h",
              "127.0.0.1",
              "-U",
              "postgres",
            );
            ready = true;
            break;
          } catch {
            await new Promise((done) => setTimeout(done, 250));
          }
        }
        assert.ok(ready, "isolated PostgreSQL must start");
        sql(
          container,
          "postgres",
          "CREATE ROLE athyper_control_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE athyper_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE athyper_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;",
        );
        docker("cp", fileURLToPath(ddlRoot), `${container}:/tmp/ddl`);
        for (const plane of ["studio", "neon", "mesh"]) {
          docker(
            "exec",
            container,
            "createdb",
            "-U",
            "postgres",
            `athyper_${plane}`,
          );
          const paths = readFileSync(
            new URL(`planes/${plane}/_manifest.txt`, ddlRoot),
            "utf8",
          )
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith("#"));
          assert.equal(
            paths.at(-1),
            "common/shared/99_security_definer_hardening.sql",
            "hardening must include the final manifest functions",
          );
          assert.equal(
            paths.at(-2),
            "common/shared/98_security_definer_privileges.sql",
          );
          sql(
            container,
            `athyper_${plane}`,
            `BEGIN; SELECT set_config('app.database_plane','${plane}',false); SELECT set_config('app.current_principal_id','00000000-0000-0000-0000-000000000000',false);\n${paths.map((path) => `\\i /tmp/ddl/${path}`).join("\n")}\nCOMMIT;`,
          );
        }
        sql(
          container,
          "postgres",
          "GRANT athyperapp,athyper_trustiam_service,athyper_publication_service TO athyper_runtime; GRANT athyper_jobs_service,athyper_publication_service,athyper_projection_applier TO athyper_worker;",
        );
      }
      const contract = await readDefinerContract();
      const probeHardening = definerHardeningSql({
        ...contract,
        sourceSignatures: [
          ...contract.sourceSignatures,
          "shared.boundary_probe_read()",
          "shared.boundary_probe_write(text)",
        ],
      });
      for (const plane of ["neon", "studio", "mesh"]) {
        const database = `athyper_${plane}`;
        // The immutable historical upgrade must reject a newly introduced definer.
        // Reapplying an old signature inventory to today's foundation is unsafe.
        assert.throws(
          () => sql(container, database, migration),
          /Unregistered source definer signature: runtime_meta.fn_locked_live_read_resources/,
        );
        // Today's generated hardening remains repeatable without rewriting that
        // historical migration or accepting unknown signatures.
        sql(container, database, hardening);
        sql(container, database, hardening);
        if (plane === "studio")
          sql(
            container,
            database,
            readFileSync(
              new URL("./onboarding-boundary.sql", import.meta.url),
              "utf8",
            ),
          );
        const query: CatalogQuery = async <Row extends object>(
          statement: string,
        ) =>
          JSON.parse(
            sql(
              container,
              database,
              `BEGIN READ ONLY; SELECT COALESCE(json_agg(result),'[]'::json) FROM (${statement}) result; COMMIT;`,
            ).trim(),
          ) as Row[];
        const report = await inspectPlaneBoundary(query, contract);
        assert.deepEqual(report.errors, [], `${plane} catalog qualification`);
        assert.equal(report.catalogQualified, true);

        // Fixture setup bypasses unrelated FK/trigger dependencies only. All
        // behavior assertions restore normal triggers and use the actual login.
        sql(
          container,
          database,
          `BEGIN;
        SET LOCAL session_replication_role=replica;
        INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES
          ('b0000000-0000-4000-8000-000000000001','boundary_one','Boundary one','Boundary one','boundary','active','d0000000-0000-4000-8000-000000000001'),
          ('b0000000-0000-4000-8000-000000000002','boundary_two','Boundary two','Boundary two','boundary','active','d0000000-0000-4000-8000-000000000002');
        INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES
          ('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','boundary.actor','Boundary actor','user','d0000000-0000-4000-8000-000000000001');
        INSERT INTO master.principal_identity_binding(tenant_id,principal_id,realm_key,subject_id,created_by) VALUES
          ('b0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','boundary','verified-subject','d0000000-0000-4000-8000-000000000001');
        INSERT INTO shared.country(code,name,created_by) VALUES('ZX','Boundary Country','d0000000-0000-4000-8000-000000000001');
        INSERT INTO document.conversation(id,tenant_id,type,title,status,created_by) VALUES('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','atlas_agent','Boundary conversation','active','d0000000-0000-4000-8000-000000000001');
        INSERT INTO ai.atlas_thread(conversation_id,tenant_id,plane,owner_principal_id,retention_policy_id,expires_at,created_by) VALUES('a0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','${plane}','d0000000-0000-4000-8000-000000000001','boundary-test',now()+interval '1 day','d0000000-0000-4000-8000-000000000001');
        SET LOCAL session_replication_role=origin;
        CREATE TABLE shared.boundary_probe(tenant_id uuid NOT NULL,label text NOT NULL);
        INSERT INTO shared.boundary_probe VALUES('b0000000-0000-4000-8000-000000000001','same'),('b0000000-0000-4000-8000-000000000002','foreign');
        ALTER TABLE shared.boundary_probe ENABLE ROW LEVEL SECURITY;
        ALTER TABLE shared.boundary_probe FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant ON shared.boundary_probe FOR ALL USING(tenant_id=shared.current_tenant_id_soft()) WITH CHECK(tenant_id=shared.current_tenant_id_soft());
        GRANT SELECT,UPDATE ON shared.boundary_probe TO athyper_definer_shared;
        CREATE FUNCTION shared.boundary_probe_read() RETURNS SETOF shared.boundary_probe LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,shared,pg_temp AS 'SELECT * FROM shared.boundary_probe';
        CREATE FUNCTION shared.boundary_probe_write(value text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,shared,pg_temp AS 'DECLARE n integer; BEGIN UPDATE shared.boundary_probe SET label=value; GET DIAGNOSTICS n=ROW_COUNT; RETURN n; END';
        ${probeHardening}
        GRANT EXECUTE ON FUNCTION shared.boundary_probe_read(),shared.boundary_probe_write(text) TO athyper_runtime;
        SET LOCAL SESSION AUTHORIZATION athyper_runtime;
        SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000001';
        SET LOCAL app.current_principal_id='';
        DO $assert$ BEGIN
          IF NOT EXISTS(SELECT 1 FROM master.fn_resolve_principal_identity('b0000000-0000-4000-8000-000000000001','keycloak','boundary','verified-subject')) THEN RAISE EXCEPTION 'bootstrap lost same-tenant verified subject'; END IF;
          IF EXISTS(SELECT 1 FROM master.fn_resolve_principal_identity('b0000000-0000-4000-8000-000000000002','keycloak','boundary','verified-subject')) THEN RAISE EXCEPTION 'bootstrap leaked foreign tenant identity'; END IF;
          IF EXISTS(SELECT 1 FROM master.fn_resolve_principal_identity('b0000000-0000-4000-8000-000000000001','keycloak','boundary','unbound-subject')) THEN RAISE EXCEPTION 'bootstrap accepted unbound subject'; END IF;
          IF (SELECT count(*) FROM shared.boundary_probe_read()) <> 1 OR EXISTS(SELECT 1 FROM shared.boundary_probe_read() WHERE label='foreign') THEN RAISE EXCEPTION 'unguarded definer read bypassed RLS'; END IF;
          IF shared.boundary_probe_write('changed') <> 1 THEN RAISE EXCEPTION 'unguarded definer write bypassed RLS'; END IF;
          IF NOT EXISTS(SELECT 1 FROM shared.country WHERE code='ZX') THEN RAISE EXCEPTION 'Country reference read lost access'; END IF;
          BEGIN PERFORM 1 FROM shared.boundary_probe; RAISE EXCEPTION 'runtime gained direct owner table privileges'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        END $assert$;
        SET LOCAL app.current_principal_id='d0000000-0000-4000-8000-000000000001';
        SET LOCAL app.current_atlas_plane='${plane}';
        ${plane === "studio" ? `DO $assert$ BEGIN IF EXISTS(SELECT 1 FROM metadata.fn_product_learning_source('a0000000-0000-4000-8000-000000000010','country','studio')) THEN RAISE EXCEPTION 'learning source admitted an unpublished product release'; END IF; END $assert$;` : ""}
        DO $assert$ BEGIN
          IF NOT ai.fn_atlas_conversation_access('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001',true) OR NOT ai.fn_is_atlas_conversation('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Atlas lost authorized conversation visibility'; END IF;
          IF ai.fn_atlas_conversation_access('b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001',true) THEN RAISE EXCEPTION 'Atlas accepted foreign tenant substitution'; END IF;
        END $assert$;
        DO $assert$ DECLARE saved_snapshot uuid; BEGIN
          saved_snapshot := snapshot.fn_capture_entity('country','a0000000-0000-4000-8000-000000000010','country',1,repeat('a',64),1,'boundary.capture','manual','{"name":"Boundary Country"}'::jsonb);
          IF snapshot.fn_get_entity_snapshot(saved_snapshot)->'payload'->>'name' IS DISTINCT FROM 'Boundary Country' THEN RAISE EXCEPTION 'snapshot capture/read lost same-tenant payload'; END IF;
          IF NOT snapshot.fn_verify_entity_snapshot_hash(saved_snapshot) THEN RAISE EXCEPTION 'snapshot hash verification lost access'; END IF;
          PERFORM set_config('app.current_tenant_id','b0000000-0000-4000-8000-000000000002',true);
          IF snapshot.fn_get_entity_snapshot(saved_snapshot) IS NOT NULL THEN RAISE EXCEPTION 'snapshot getter leaked foreign tenant payload'; END IF;
          PERFORM set_config('app.current_tenant_id','b0000000-0000-4000-8000-000000000001',true);
        END $assert$;
        SET LOCAL app.current_tenant_id='b0000000-0000-4000-8000-000000000002';
        DO $assert$ BEGIN
          IF ai.fn_is_atlas_conversation('b0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Atlas type helper leaked foreign tenant conversation existence'; END IF;
        END $assert$;
        SET LOCAL app.current_tenant_id='';
        DO $assert$ BEGIN IF EXISTS(SELECT 1 FROM shared.boundary_probe_read()) OR shared.boundary_probe_write('no-context') <> 0 THEN RAISE EXCEPTION 'no-context definer accessed rows'; END IF; END $assert$;
        RESET SESSION AUTHORIZATION;
        DO $assert$ BEGIN IF NOT EXISTS(SELECT 1 FROM shared.boundary_probe WHERE label='foreign') THEN RAISE EXCEPTION 'foreign row was mutated'; END IF; END $assert$;
        ROLLBACK;`,
        );
        assert.throws(
          () =>
            sql(
              container,
              database,
              `BEGIN; ALTER FUNCTION shared.current_tenant_id() SET search_path=pg_catalog,public,pg_temp; ${hardening} ROLLBACK;`,
            ),
          /untrusted search_path schema/,
        );
        assert.throws(
          () =>
            sql(
              container,
              database,
              `BEGIN; GRANT CREATE ON SCHEMA shared TO athyper_runtime; ${hardening} ROLLBACK;`,
            ),
          /writable by runtime or PUBLIC/,
        );
        assert.throws(
          () =>
            sql(
              container,
              database,
              `BEGIN; CREATE FUNCTION shared.unlisted_bypass() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog SET row_security=off AS 'SELECT 1'; ${hardening} ROLLBACK;`,
            ),
          /Unlisted or changed RLS bypass signature/,
        );
        assert.throws(
          () =>
            sql(
              container,
              database,
              `BEGIN; CREATE FUNCTION shared.deployed_only_definer() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS 'SELECT 1'; ${migration}`,
            ),
          /Unregistered source definer signature/,
        );
        assert.throws(
          () =>
            sql(
              container,
              database,
              "SET SESSION AUTHORIZATION athyper_runtime; SET ROLE athyper_bypass_ai;",
            ),
          /permission denied to set role/,
        );
        const membershipRows = JSON.parse(
          sql(
            container,
            database,
            `BEGIN; CREATE ROLE boundary_bridge NOLOGIN; GRANT athyper_bypass_ai TO boundary_bridge WITH SET TRUE, INHERIT FALSE; GRANT boundary_bridge TO athyper_runtime WITH SET TRUE, INHERIT FALSE; SELECT json_agg(result) FROM (${boundaryCatalogQueries.memberships}) result; ROLLBACK;`,
          ).trim(),
        );
        assert.ok(
          membershipRows.some(
            (row: { root: string; role: string; settable: boolean }) =>
              row.root === "athyper_runtime" &&
              row.role === "athyper_bypass_ai" &&
              row.settable,
          ),
        );
        const mixedRows = JSON.parse(
          sql(
            container,
            database,
            `BEGIN; CREATE ROLE boundary_bridge NOLOGIN; GRANT athyper_definer_shared TO boundary_bridge WITH SET FALSE, INHERIT TRUE; GRANT boundary_bridge TO athyper_runtime WITH SET TRUE, INHERIT FALSE; SELECT json_agg(result) FROM (${boundaryCatalogQueries.memberships}) result; SET LOCAL SESSION AUTHORIZATION athyper_runtime; SET LOCAL ROLE boundary_bridge; DO $assert$ BEGIN IF NOT has_function_privilege(current_user,'shared.current_tenant_id()','EXECUTE') THEN RAISE EXCEPTION 'mixed membership fixture must inherit function-owner privileges'; END IF; END $assert$; RESET SESSION AUTHORIZATION; ROLLBACK;`,
          ).trim(),
        );
        assert.ok(
          mixedRows.some(
            (row: {
              root: string;
              role: string;
              inheritable: boolean;
              settable: boolean;
            }) =>
              row.root === "athyper_runtime" &&
              row.role === "athyper_definer_shared" &&
              row.inheritable &&
              !row.settable,
          ),
        );
        const adminRows = JSON.parse(
          sql(
            container,
            database,
            `BEGIN; GRANT athyper_bypass_ai TO athyper_runtime WITH SET FALSE, INHERIT FALSE, ADMIN TRUE; SELECT json_agg(result) FROM (${boundaryCatalogQueries.memberships}) result; SET LOCAL SESSION AUTHORIZATION athyper_runtime; GRANT athyper_bypass_ai TO athyper_runtime WITH SET TRUE; SET LOCAL ROLE athyper_bypass_ai; RESET SESSION AUTHORIZATION; ROLLBACK;`,
          ).trim(),
        );
        assert.ok(
          adminRows.some(
            (row: { root: string; role: string; administrable: boolean }) =>
              row.root === "athyper_runtime" &&
              row.role === "athyper_bypass_ai" &&
              row.administrable,
          ),
        );
      }
    } finally {
      if (created) docker("rm", "-f", container);
    }
  },
);
