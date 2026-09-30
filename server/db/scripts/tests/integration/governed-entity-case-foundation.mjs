import assert from "node:assert/strict";
import pg from "pg";

const urls = {
  studio: process.env.ATHYPER_PLATFORM_DATABASE_ADMIN_URL,
  neon:
    process.env.ATHYPER_NEON_DATABASE_ADMIN_URL ??
    process.env.DATABASE_ADMIN_URL,
  mesh:
    process.env.ATHYPER_MESH_DATABASE_ADMIN_URL ??
    process.env.MESH_DATABASE_ADMIN_URL,
};
if (Object.values(urls).some((value) => !value))
  throw new Error(
    "Studio, NEON and MESH administrator database URLs are required",
  );
const core = [
  ["document", "entity_case"],
  ["document", "entity_case_command_evidence"],
  ["document", "entity_case_validation"],
  ["document", "entity_case_materialization"],
  ["governance", "cycle_subject"],
  ["snapshot", "entity_case_snapshot_lineage"],
];
for (const [plane, url] of Object.entries(urls)) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const tables = (
      await client.query(
        `SELECT namespace.nspname schemaname,class.relname tablename,class.relrowsecurity rowsecurity,class.relforcerowsecurity forcerowsecurity FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace WHERE (namespace.nspname,class.relname) IN (${core.map((_, index) => `($${index * 2 + 1},$${index * 2 + 2})`).join(",")}) ORDER BY 1,2`,
        core.flat(),
      )
    ).rows;
    assert.equal(tables.length, core.length, `${plane}: common relation count`);
    for (const table of tables) {
      assert.equal(table.rowsecurity, true, `${plane}:${table.tablename}:RLS`);
      assert.equal(
        table.forcerowsecurity,
        true,
        `${plane}:${table.tablename}:FORCE RLS`,
      );
    }
    const forbidden = await client.query(
      "SELECT table_schema,table_name,column_name FROM information_schema.columns WHERE (table_schema,table_name) IN (('document','entity_case')) AND column_name IN('payload','data','proposed_payload')",
    );
    assert.equal(forbidden.rowCount, 0, `${plane}: payload-free case head`);
    const constraints = await client.query(
      "SELECT count(*)::int value FROM pg_constraint WHERE conname IN('entity_case_contract_fk','entity_case_current_snapshot_fk','cycle_subject_case_fk','cycle_subject_run_fk','entity_case_snapshot_lineage_case_fk','entity_case_materialization_fingerprint_uq')",
    );
    assert.equal(
      constraints.rows[0].value,
      6,
      `${plane}: identity/FK/idempotency constraints`,
    );
    const immutable = await client.query(
      "SELECT count(*)::int value FROM pg_trigger WHERE NOT tgisinternal AND tgname IN('entity_case_command_evidence_immutable','entity_case_validation_immutable','entity_case_snapshot_lineage_immutable')",
    );
    assert.equal(
      immutable.rows[0].value,
      3,
      `${plane}: immutable evidence guards`,
    );
    const commandSurface = await client.query(
      "SELECT to_regprocedure('document.command_entity_case_draft(uuid,uuid,bigint,uuid,text,text,text,uuid,text,uuid,text,uuid,bigint,text,jsonb,text,uuid,uuid)') IS NOT NULL AS draft_exists, to_regprocedure('document.command_entity_case_lifecycle(uuid,uuid,text,bigint,uuid,uuid,text,text,uuid,uuid)') IS NOT NULL AS lifecycle_exists, EXISTS(SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname='entity_case_command_guard' AND tgrelid='document.entity_case'::regclass) AS guard_exists",
    );
    assert.deepEqual(
      commandSurface.rows[0],
      { draft_exists: true, lifecycle_exists: true, guard_exists: true },
      `${plane}: supported-upgrade command surface`,
    );
    const publicPrivileges = await client.query(
      "SELECT count(*)::int value FROM information_schema.role_table_grants WHERE grantee='PUBLIC' AND (table_schema,table_name) IN (('document','entity_case'),('document','entity_case_command_evidence'),('document','entity_case_validation'),('document','entity_case_materialization'),('governance','cycle_subject'),('snapshot','entity_case_snapshot_lineage'))",
    );
    assert.equal(
      publicPrivileges.rows[0].value,
      0,
      `${plane}: PUBLIC privileges`,
    );
    if (plane === "studio") {
      const component = (
        await client.query(
          "SELECT class.relrowsecurity rowsecurity,class.relforcerowsecurity forcerowsecurity FROM pg_class class JOIN pg_namespace namespace ON namespace.oid=class.relnamespace WHERE namespace.nspname='metadata' AND class.relname='entity_surface_component_binding'",
        )
      ).rows[0];
      assert.deepEqual(component, {
        rowsecurity: true,
        forcerowsecurity: true,
      });
      const shape = await client.query(
        "SELECT count(*)::int value FROM pg_constraint WHERE conname IN('entity_surface_component_binding_component_fk','entity_surface_component_binding_no_self_chk','entity_surface_component_binding_cardinality_chk','entity_surface_component_binding_pointer_chk')",
      );
      assert.equal(
        shape.rows[0].value,
        4,
        "studio: component binding contract",
      );
    }
    if (plane === "neon") {
      const materializer = await client.query(
        "SELECT to_regprocedure('master.command_materialize_internal_business_partner_case(uuid,uuid,bigint,text,uuid,uuid)') IS NOT NULL AS exists",
      );
      assert.deepEqual(
        materializer.rows[0],
        { exists: true },
        "neon: internal Business Partner materializer",
      );
    }
  } finally {
    await client.end();
  }
}
process.stdout.write("G1_GOVERNED_ENTITY_CASE_SUPPORTED_UPGRADE_OK\n");
