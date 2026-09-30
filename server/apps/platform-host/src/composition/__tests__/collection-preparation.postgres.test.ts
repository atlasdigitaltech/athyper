import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring/deterministic";

// Actual repository SQL functions, minimal fixture tables; not full-schema/RLS
// deployment qualification. No external database URL or application volume.
describe.skipIf(process.env["COLLECTION_PREPARATION_POSTGRES_TEST"] !== "1")("collection preparation PostgreSQL boundary", () => {
  const container = `athyper-collection-test-${randomUUID()}`;
  const password = randomUUID();
  let started = false;
  let pool: pg.Pool;
  let client: pg.PoolClient;
  let releaseId: string, tenant: string, publisher: string, reviewer: string;
  let graph: any, descriptor: Record<string, unknown>;
  const root = new URL("../../../../../../", import.meta.url);
  const docker = (...args: string[]) => execFileSync("docker", args, { encoding: "utf8", timeout: 30_000 }).trim();
  function ddlFunction(path: string, name: string) {
    const source = readFileSync(new URL(path, root), "utf8");
    const start = source.indexOf("CREATE OR REPLACE FUNCTION " + name + "(");
    const body = source.indexOf("AS $$", start);
    const end = source.indexOf("$$;", body + 5);
    if (start < 0 || body < 0 || end < 0) throw Error("SQL function extraction failed: " + name);
    return source.slice(start, end + 3);
  }
  beforeAll(async () => {
    docker("run", "--detach", "--rm", "--name", container, "--publish", "127.0.0.1::5432",
      "--tmpfs", "/var/lib/postgresql/data:rw", "--env", `POSTGRES_PASSWORD=${password}`,
      "--env", "POSTGRES_DB=collection_test", "athyper/postgres:16.15-hardened");
    started = true;
    const port = Number(docker("port", container, "5432/tcp").split(":").at(-1));
    pool = new pg.Pool({ host: "127.0.0.1", port, user: "postgres", password,
      database: "collection_test", connectionTimeoutMillis: 500 });
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { await pool.query("SELECT 1"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!ready) throw Error("Disposable PostgreSQL unavailable");
    await pool.query(`
      CREATE EXTENSION pgcrypto;
      CREATE ROLE collection_owner NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE collection_caller NOSUPERUSER NOBYPASSRLS;
      CREATE SCHEMA metadata AUTHORIZATION collection_owner;
      CREATE SCHEMA snapshot AUTHORIZATION collection_owner;
      CREATE SCHEMA publication AUTHORIZATION collection_owner;
      CREATE SCHEMA shared AUTHORIZATION collection_owner;
      CREATE SCHEMA master AUTHORIZATION collection_owner;
      SET ROLE collection_owner;
      CREATE FUNCTION shared.current_tenant_id() RETURNS uuid LANGUAGE sql AS
        'SELECT nullif(current_setting(''app.current_tenant_id'',true),'''')::uuid';
      CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS
        'SELECT nullif(current_setting(''app.current_principal_id'',true),'''')::uuid';
      CREATE TABLE metadata.entity(id uuid PRIMARY KEY, tenant_id uuid, entity_code text);
      CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY, tenant_id uuid, status text,
        approved_by uuid, created_by uuid, submitted_by uuid);
      CREATE TABLE snapshot.entity_contract_revision(id uuid PRIMARY KEY, tenant_id uuid, contract_json jsonb);
      CREATE TABLE metadata.entity_release(id uuid PRIMARY KEY, tenant_id uuid, entity_id uuid,
        change_set_id uuid, revision_id uuid, published_by uuid, release_kind text,
        target_planes text[], contract_signature text, signature_algorithm text,
        release_hash text, contract_hash text, release_no integer);
      CREATE TABLE snapshot.entity_release_artifact(tenant_id uuid, source_release_id uuid,
        source_revision_id uuid, entity_id uuid, plane_key text, release_hash text,
        contract_hash text, compiled_json jsonb, compiled_hash text, compliance_report jsonb,
        created_by uuid, UNIQUE(source_release_id,plane_key));
      CREATE DOMAIN publication.release_status_d AS text CHECK(VALUE IN ('preparing','approved','published','withdrawn'));
      CREATE TABLE publication.release(id uuid PRIMARY KEY, tenant_id uuid, release_key text,
        release_no integer, release_kind text, status publication.release_status_d,
        compatibility_level text, release_hash text, manifest_hash text, created_by uuid, metadata jsonb,
        approved_at timestamptz, approved_by uuid, published_at timestamptz, published_by uuid,
        withdrawn_at timestamptz, withdrawn_by uuid);
      CREATE TABLE publication.entity_release_link(publication_release_id uuid PRIMARY KEY
        REFERENCES publication.release(id), entity_release_id uuid REFERENCES metadata.entity_release(id));
      CREATE TABLE publication.artifact(publication_release_id uuid, status text);
      RESET ROLE;
    `);
    await pool.query("SET ROLE collection_owner");
    try {
      await pool.query(ddlFunction("server/db/ddl/planes/studio/snapshot/07_functions.sql", "snapshot.fn_compute_entity_release_artifact_hash"));
      await pool.query(ddlFunction("server/db/ddl/planes/studio/publication/07_functions.sql", "publication.fn_transition_release"));
      await pool.query(ddlFunction("server/db/ddl/planes/studio/publication/07_functions.sql", "publication.fn_prepare_document_collection_release"));
      await pool.query(`
        REVOKE ALL ON ALL FUNCTIONS IN SCHEMA publication FROM PUBLIC;
        GRANT USAGE ON SCHEMA publication TO collection_caller;
        GRANT EXECUTE ON FUNCTION publication.fn_prepare_document_collection_release(uuid,jsonb) TO collection_caller;
      `);
    } finally { await pool.query("RESET ROLE"); }
  }, 30_000);
  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");
    releaseId = randomUUID(); tenant = randomUUID(); publisher = randomUUID(); reviewer = randomUUID();
    graph = JSON.parse(readFileSync(new URL("governance/policy/reviews/bp-dependencies-20260912/child-storage.candidate.json", root), "utf8"));
    graph.surfaces[0].layoutConfig.collectionCompilation = {
      schemaVersion: 1, entityCode: "business_partner_request", planeKey: "neon",
      subjectEntityCode: "master.business_partner", permissionCode: "neon.relationship.entity_case.read",
      detailRouteTemplate: "/app/entity/business_partner_request/:recordId",
    };
    const compiled = compileGraph(graph);
    descriptor = structuredClone(compiled.descriptor);
    const entityId = randomUUID(), changeId = randomUUID(), revisionId = randomUUID();
    await client.query("INSERT INTO metadata.entity VALUES($1,$2,$3)", [entityId, tenant, graph.entity.entityCode]);
    await client.query("INSERT INTO metadata.entity_change_set VALUES($1,$2,'approved',$3,$4,$4)",
      [changeId, tenant, reviewer, randomUUID()]);
    await client.query("INSERT INTO snapshot.entity_contract_revision VALUES($1,$2,$3)", [revisionId, tenant, graph]);
    await client.query(`INSERT INTO metadata.entity_release VALUES($1,$2,$3,$4,$5,$6,'publish',
      ARRAY['neon'],'fixture-signature','Ed25519',$7,$8,1)`,
      [releaseId, tenant, entityId, changeId, revisionId, publisher, "a".repeat(64), compiled.contractHash]);
    await client.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)", [tenant, publisher]);
  });
  afterEach(async () => { if (client) { try { await client.query("ROLLBACK"); } finally { client.release(); } } });
  afterAll(async () => {
    try { await pool?.end(); } finally { if (started) docker("stop", "--time", "1", container); }
  }, 30_000);
  async function prepare() {
    await client.query("SET LOCAL ROLE collection_caller");
    // An error aborts the transaction; the test rolls back its savepoint.
    await client.query("SELECT publication.fn_prepare_document_collection_release($1,$2::jsonb)", [releaseId, JSON.stringify(descriptor)]);
  }
  async function expectDenied(pattern: RegExp) {
    await client.query("SAVEPOINT rejected_preparation");
    await expect(prepare()).rejects.toThrow(pattern);
    await client.query("ROLLBACK TO SAVEPOINT rejected_preparation");
    await client.query("RESET ROLE");
    expect((await client.query("SELECT * FROM publication.entity_release_link")).rows).toHaveLength(0);
    expect((await client.query("SELECT * FROM snapshot.entity_release_artifact")).rows).toHaveLength(0);
    expect((await client.query("SELECT * FROM publication.release")).rows).toHaveLength(0);
  }
  it("prepares approved snapshot, preserves hashes and replays without duplicate writes", async () => {
    await prepare();
    await client.query("RESET ROLE");
    const stored = (await client.query("SELECT compiled_json,compiled_hash FROM snapshot.entity_release_artifact")).rows[0];
    expect(stored.compiled_json).toEqual(descriptor);
    const hash = (await client.query(`SELECT snapshot.fn_compute_entity_release_artifact_hash(
      source_release_id,source_revision_id,entity_id,plane_key,release_hash,contract_hash,compiled_json) AS hash
      FROM snapshot.entity_release_artifact`)).rows[0].hash;
    expect(stored.compiled_hash).toBe(hash);
    expect((await client.query("SELECT status,approved_by FROM publication.release")).rows)
      .toEqual([{ status: "approved", approved_by: reviewer }]);
    await prepare();
    await client.query("RESET ROLE");
    expect((await client.query("SELECT * FROM publication.entity_release_link")).rows).toHaveLength(1);
  });
  it.each(["tenant", "actor", "makerChecker", "reviewState", "plane", "signature"])(
    "rejects invalid persisted authority: %s", async mutation => {
      if (mutation === "tenant") await client.query("SELECT set_config('app.current_tenant_id',$1,true)", [randomUUID()]);
      if (mutation === "actor") await client.query("SELECT set_config('app.current_principal_id',$1,true)", [randomUUID()]);
      if (mutation === "makerChecker") await client.query("UPDATE metadata.entity_change_set SET approved_by=created_by");
      if (mutation === "reviewState") await client.query("UPDATE metadata.entity_change_set SET status='draft'");
      if (mutation === "plane") await client.query("UPDATE metadata.entity_release SET target_planes=ARRAY['mesh']");
      if (mutation === "signature") await client.query("UPDATE metadata.entity_release SET signature_algorithm='none'");
      await expectDenied(/no rows|REVIEW_REQUIRED/);
    },
  );
  it.each(["binding", "field", "governance", "unknown", "presentation", "missingArray"])(
    "rejects descriptor tampering without writes: %s", async mutation => {
      if (mutation === "binding") (descriptor.collectionCompilation as any).permissionCode = "neon.other.read";
      if (mutation === "field") (descriptor.fields as any[])[0].storagePath = "payload_json";
      if (mutation === "governance") descriptor.changeCaseBindings = [{ handlerKey: "untrusted" }];
      if (mutation === "unknown") descriptor.unreviewed = true;
      if (mutation === "presentation") (descriptor.listPresentation as any).title = "Unreviewed";
      if (mutation === "missingArray") delete descriptor.materializationBindings;
      await expectDenied(/DOCUMENT_COLLECTION_(SOURCE|POLICY|BRANCH|PRESENTATION)_MISMATCH|DOCUMENT_COLLECTION_BRANCH_INVALID/);
    },
  );
  it("rejects nonempty governance declarations even when the snapshot contains them", async () => {
    graph.changeCaseBindings = [{ handlerKey: "untrusted" }];
    descriptor.changeCaseBindings = graph.changeCaseBindings;
    await client.query("UPDATE snapshot.entity_contract_revision SET contract_json=$1", [graph]);
    await expectDenied(/DOCUMENT_COLLECTION_GOVERNANCE_UNSUPPORTED/);
  });
  it("rejects conflicting replay without overwriting prepared artifacts", async () => {
    await prepare(); await client.query("RESET ROLE");
    await client.query("UPDATE snapshot.entity_release_artifact SET compiled_json='{}'");
    await client.query("SAVEPOINT replay");
    await expect(prepare()).rejects.toThrow("DOCUMENT_COLLECTION_RELEASE_CONFLICT");
    await client.query("ROLLBACK TO SAVEPOINT replay"); await client.query("RESET ROLE");
    expect((await client.query("SELECT compiled_json FROM snapshot.entity_release_artifact")).rows).toEqual([{ compiled_json: {} }]);
  });
  it("does not grant callers direct publication-table writes", async () => {
    await client.query("SET LOCAL ROLE collection_caller");
    expect((await client.query("SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0])
      .toEqual({ rolsuper: false, rolbypassrls: false });
    await expect(client.query("INSERT INTO publication.release(id) VALUES($1)", [randomUUID()])).rejects.toMatchObject({ code: "42501" });
  });
});
