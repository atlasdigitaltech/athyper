#!/usr/bin/env tsx
/**
 * Applies the additive M1/M2/M3 metadata migrations twice in one transaction and
 * rolls the transaction back. This verifies both current-database upgrade and
 * migration replay without changing the developer database.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  throw new Error("DATABASE_URL is required for metadata Contract upgrade verification.");
}

const migrationNames = [
  "01zz_meta_entity_contract_m1.sql",
  "01zzm_meta_entity_contract_m2.sql",
  "01zzn_meta_entity_contract_m3.sql",
  "03zz_meta_entity_contract_m1.sql",
  "03zzm_meta_entity_contract_m2.sql",
  "03zzn_meta_entity_contract_m3.sql",
  "04zz_meta_entity_contract_m1.sql",
  "04zzn_meta_entity_contract_m3.sql",
  "05zz_meta_entity_contract_m1.sql",
  "05zzn_meta_entity_contract_m3.sql",
  "06zz_meta_entity_contract_m1.sql",
  "06zzn_meta_entity_contract_m3.sql",
  "../snapshot/06zz_meta_entity_contract_m3.sql",
  "07zz_meta_entity_contract_m7_audit.sql",
  "08zz_meta_entity_contract_m1.sql",
  "08zzn_meta_entity_contract_m3.sql",
] as const;

const ddlRoot = new URL("../../ddl/control/", import.meta.url);
const migrations = await Promise.all(migrationNames.map(async (name) => ({
  name,
  source: await readFile(fileURLToPath(new URL(name, ddlRoot)), "utf8"),
})));

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  await client.query("BEGIN");
  for (let replay = 1; replay <= 2; replay += 1) {
    for (const migration of migrations) {
      await client.query(migration.source);
      process.stdout.write(`PASS replay ${replay}: ${migration.name}\n`);
    }
  }

  const result = await client.query<{
    schema_version: boolean;
    projection_hash: boolean;
    versioned_operation_unique: boolean;
    action_rule_owner_key: boolean;
    publication_evidence: boolean;
    plane_artifacts: boolean;
    ready_guard: boolean;
    immutable_plane_artifacts: boolean;
    unified_audit_view: boolean;
  }>(`
    SELECT
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'control'
           AND table_name = 'entity_version'
           AND column_name = 'contract_schema_version'
      ) AS schema_version,
      EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'control'
           AND table_name = 'entity_version'
           AND column_name = 'projection_hash'
      ) AS projection_hash,
      EXISTS (
        SELECT 1
          FROM pg_constraint constraint_record
          JOIN pg_class table_record ON table_record.oid = constraint_record.conrelid
          JOIN pg_namespace schema_record ON schema_record.oid = table_record.relnamespace
         WHERE schema_record.nspname = 'control'
           AND table_record.relname = 'entity_operation'
           AND constraint_record.conname = 'eo_binding_uq'
           AND pg_get_constraintdef(constraint_record.oid) LIKE '%entity_version_id%'
      ) AS versioned_operation_unique,
      EXISTS (
        SELECT 1
          FROM information_schema.table_constraints
         WHERE constraint_schema = 'control'
           AND table_name = 'entity_action_rule'
           AND constraint_name = 'ear_pkey'
      ) AS action_rule_owner_key
      , to_regclass('control.entity_contract_transition') IS NOT NULL AS publication_evidence
      , to_regclass('snapshot.entity_plane_compiled') IS NOT NULL AS plane_artifacts
      , EXISTS (
          SELECT 1 FROM pg_trigger
           WHERE tgrelid='control.entity_publish_state'::regclass
             AND tgname='trg_eps_m3_ready_guard'
             AND NOT tgisinternal
        ) AS ready_guard
      , EXISTS (
          SELECT 1 FROM pg_trigger
           WHERE tgrelid='snapshot.entity_plane_compiled'::regclass
             AND tgname='trg_epc_immutable'
             AND NOT tgisinternal
        ) AS immutable_plane_artifacts
      , to_regclass('control.v_meta_entity_contract_audit') IS NOT NULL AS unified_audit_view
  `);
  const checks = result.rows[0];
  if (!checks || Object.values(checks).some((value) => value !== true)) {
    throw new Error(`Metadata Contract catalog checks failed: ${JSON.stringify(checks)}`);
  }
  process.stdout.write("PASS metadata Contract M1/M2/M3 catalog checks\n");
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  await client.end().catch(() => undefined);
}
