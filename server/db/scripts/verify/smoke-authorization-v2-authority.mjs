#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(here, "../../../..");
const pgliteRoot = join(
  repositoryRoot,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist",
);
const { PGlite } = await import(pathToFileURL(join(pgliteRoot, "index.js")).href);
const { pgcrypto } = await import(
  pathToFileURL(join(pgliteRoot, "contrib/pgcrypto.js")).href
);

async function source(path) {
  return readFile(join(repositoryRoot, path), "utf8");
}

async function mustFail(db, label, statement) {
  try {
    await db.exec(statement);
  } catch {
    return;
  }
  throw new Error(`${label}: statement unexpectedly succeeded`);
}

async function smokeNeon() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE EXTENSION pgcrypto;
    CREATE SCHEMA shared;
    CREATE SCHEMA master;
    CREATE SCHEMA control;
    CREATE FUNCTION shared.uuidv7()
    RETURNS uuid LANGUAGE sql VOLATILE AS 'SELECT gen_random_uuid()';
    CREATE TABLE master.principal (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      UNIQUE (tenant_id, id)
    );
    CREATE TABLE master.auth_plane_membership (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (tenant_id, plane_code, id)
    );
    CREATE TABLE master.auth_scope_target (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (tenant_id, plane_code, id)
    );
    CREATE TABLE master.auth_group_role_v2 (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (tenant_id, plane_code, id)
    );
    CREATE TABLE master.auth_override (
      id uuid NOT NULL,
      tenant_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (tenant_id, plane_code, id)
    );
  `);
  await db.exec(await source(
    "server/db/ddl/planes/neon/authz/03_tables.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/planes/neon/authz/05_constraints.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/planes/neon/authz/07_functions.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/planes/neon/authz/08_triggers.sql",
  ));
  await db.exec(`
    INSERT INTO master.principal VALUES (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    );
    INSERT INTO master.auth_plane_membership VALUES (
      '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      'neon'
    );
    INSERT INTO control.authorization_v3_subject_mapping (
      tenant_id, plane_code, principal_id, source_watermark_id,
      source_row_sha256, disposition, target_membership_id, target_group_ids,
      approval_ticket, mapping_reason, created_by
    ) VALUES (
      '20000000-0000-4000-8000-000000000001', 'neon',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001', repeat('a', 64),
      'mapped', '30000000-0000-4000-8000-000000000001',
      ARRAY['50000000-0000-4000-8000-000000000001'::uuid],
      'AUTH-1', 'smoke mapping',
      '10000000-0000-4000-8000-000000000001'
    );
  `);
  await mustFail(db, "Neon mapped subject requires a group", `
    INSERT INTO control.authorization_v3_subject_mapping (
      tenant_id, plane_code, principal_id, source_watermark_id,
      source_row_sha256, disposition, target_membership_id, target_group_ids,
      approval_ticket, mapping_reason, created_by
    ) VALUES (
      '20000000-0000-4000-8000-000000000001', 'neon',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002', repeat('b', 64),
      'mapped', '30000000-0000-4000-8000-000000000001', '{}',
      'AUTH-2', 'must fail',
      '10000000-0000-4000-8000-000000000001'
    )
  `);
  await mustFail(db, "Neon company scope cannot be empty", `
    INSERT INTO control.authorization_v3_scope_mapping (
      tenant_id, plane_code, legacy_group_role_id, source_watermark_id,
      legacy_scope_kind, disposition, target_scope_id, target_group_role_id,
      created_by
    ) VALUES (
      '20000000-0000-4000-8000-000000000001', 'neon',
      '60000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'company_code', 'scoped_group_role',
      '70000000-0000-4000-8000-000000000001',
      '80000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001'
    )
  `);
  await db.close();
}

async function smokeMesh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE EXTENSION pgcrypto;
    CREATE SCHEMA mesh;
    CREATE SCHEMA mesh_control;
    CREATE TABLE mesh.principal (id uuid PRIMARY KEY);
    CREATE TABLE mesh.network_account (id uuid PRIMARY KEY);
    CREATE TABLE mesh.auth_plane_membership (
      id uuid NOT NULL,
      account_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (account_id, plane_code, id)
    );
    CREATE TABLE mesh.auth_scope_target (
      id uuid NOT NULL,
      account_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (account_id, plane_code, id)
    );
    CREATE TABLE mesh.auth_group_role_v2 (
      id uuid NOT NULL,
      account_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (account_id, plane_code, id)
    );
    CREATE TABLE mesh.auth_override (
      id uuid NOT NULL,
      account_id uuid NOT NULL,
      plane_code text NOT NULL,
      UNIQUE (account_id, plane_code, id)
    );
  `);
  await db.exec(await source(
    "server/db/ddl/planes/mesh/authz/03_tables.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/planes/mesh/authz/05_constraints.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/planes/mesh/authz/07_functions.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/planes/mesh/authz/08_triggers.sql",
  ));
  await mustFail(db, "Mesh scope can never be implicit account-wide", `
    INSERT INTO mesh_control.authorization_v3_scope_mapping (
      account_id, legacy_grant_id, source_watermark_id,
      legacy_scope_kind, disposition, target_scope_id, target_group_role_id
    ) VALUES (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'account', 'scoped_group_role',
      '40000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001'
    )
  `);
  await mustFail(db, "Mesh rejects Neon plane", `
    INSERT INTO mesh_control.authorization_v3_subject_mapping (
      account_id, plane_code, principal_id, source_watermark_id,
      source_row_sha256, disposition, approval_ticket, mapping_reason
    ) VALUES (
      '10000000-0000-4000-8000-000000000001', 'neon',
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      repeat('a', 64), 'retired', 'AUTH-3', 'must fail'
    )
  `);
  await db.close();
}

await smokeNeon();
await smokeMesh();
console.log(JSON.stringify({
  postgres: "17 (PGlite 0.4.1)",
  ddlFiles: 8,
  authorities: ["neon-admin", "mesh"],
  mappedSubjectRequiresGroup: true,
  emptyScopeDenied: true,
  meshPlaneSealed: true,
  result: "pass",
}));
