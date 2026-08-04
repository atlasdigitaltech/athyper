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
    CREATE SCHEMA control;
    CREATE SCHEMA master;
    CREATE FUNCTION shared.uuidv7()
    RETURNS uuid LANGUAGE sql VOLATILE AS 'SELECT gen_random_uuid()';
    CREATE TABLE control.auth_permission (
      id uuid PRIMARY KEY,
      module_id uuid,
      feature_id uuid,
      status text NOT NULL,
      effective_from timestamptz NOT NULL,
      effective_until timestamptz
    );
    CREATE TABLE control.auth_permission_plane (
      permission_id uuid NOT NULL,
      plane_code text NOT NULL,
      status text NOT NULL,
      effective_from timestamptz NOT NULL,
      effective_until timestamptz,
      PRIMARY KEY (permission_id, plane_code)
    );
    CREATE TABLE shared.subscription_plan (
      id uuid PRIMARY KEY,
      code text NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE shared.subscription_plan_version (
      id uuid PRIMARY KEY,
      plan_id uuid NOT NULL,
      status text NOT NULL,
      valid_from date NOT NULL,
      valid_to date
    );
    CREATE TABLE shared.plan_module_access (
      plan_version_id uuid NOT NULL,
      module_id uuid NOT NULL,
      is_included boolean NOT NULL,
      is_addon boolean NOT NULL
    );
    CREATE TABLE shared.plan_feature_access (
      plan_version_id uuid NOT NULL,
      feature_id uuid NOT NULL,
      is_included boolean NOT NULL,
      is_addon boolean NOT NULL
    );
    CREATE TABLE master.tenant (
      id uuid PRIMARY KEY,
      subscription text NOT NULL,
      status text NOT NULL
    );
    CREATE TABLE master.tenant_module_subscription (
      tenant_id uuid NOT NULL,
      module_id uuid NOT NULL,
      status text NOT NULL,
      expires_at timestamptz
    );
    CREATE TABLE master.tenant_feature_entitlement (
      tenant_id uuid NOT NULL,
      feature_id uuid NOT NULL,
      status text NOT NULL,
      expires_at timestamptz
    );
    CREATE TABLE master.tenant_entitlement_override (
      tenant_id uuid NOT NULL,
      plane_code text NOT NULL,
      module_id uuid,
      feature_id uuid,
      decision text NOT NULL,
      status text NOT NULL,
      effective_from timestamptz NOT NULL,
      effective_until timestamptz
    );
  `);
  await db.exec(await source(
    "server/db/ddl/control/01zzv_authorization_v4_entitlement_migration.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/control/05zv_authorization_v4_entitlement_functions.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/master/05zzd_authorization_v4_entitlement_functions.sql",
  ));
  const admin = await db.query(`
    SELECT count(*)::int AS count
    FROM control.auth_admin_entitlement_policy
    WHERE policy_code = 'platform_managed' AND status = 'active'
  `);
  if (admin.rows[0]?.count !== 1) {
    throw new Error("Admin platform_managed policy was not installed");
  }
  await mustFail(db, "reviewed grant disposition requires zero diff", `
    INSERT INTO control.authorization_v4_access_grant_disposition (
      tenant_id, source_access_grant_id, source_watermark_id,
      source_row_sha256, source_effect, source_subject_kind,
      source_has_resource, classification, target_relation, target_row_ids,
      affected_user_count, legacy_decision_sha256,
      canonical_decision_sha256, affected_user_diff_count, status,
      disposition_reason, approval_ticket, reviewed_by, reviewed_at, created_by
    ) VALUES (
      gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), repeat('a', 64),
      'allow', 'principal', false, 'principal_allow_override',
      'master.auth_override', ARRAY[gen_random_uuid()], 1,
      repeat('b', 64), repeat('c', 64), 1, 'reviewed',
      'bad diff', 'AUTH-4', gen_random_uuid(), now(), gen_random_uuid()
    )
  `);
  const tenantId = "11111111-1111-4111-8111-111111111111";
  const moduleId = "22222222-2222-4222-8222-222222222222";
  const permissionId = "33333333-3333-4333-8333-333333333333";
  const planId = "44444444-4444-4444-8444-444444444444";
  const planVersionId = "55555555-5555-4555-8555-555555555555";
  await db.exec(`
    INSERT INTO control.auth_permission
      (id, module_id, status, effective_from)
    VALUES
      ('${permissionId}', '${moduleId}', 'published', now() - interval '1 day');
    INSERT INTO control.auth_permission_plane
      (permission_id, plane_code, status, effective_from)
    VALUES
      ('${permissionId}', 'admin', 'active', now() - interval '1 day'),
      ('${permissionId}', 'neon', 'active', now() - interval '1 day');
    INSERT INTO shared.subscription_plan (id, code, status)
    VALUES ('${planId}', 'enterprise', 'active');
    INSERT INTO shared.subscription_plan_version
      (id, plan_id, status, valid_from)
    VALUES ('${planVersionId}', '${planId}', 'active', current_date - 1);
    INSERT INTO shared.plan_module_access
      (plan_version_id, module_id, is_included, is_addon)
    VALUES ('${planVersionId}', '${moduleId}', true, false);
    INSERT INTO master.tenant (id, subscription, status)
    VALUES ('${tenantId}', 'enterprise', 'active');
    INSERT INTO master.tenant_module_subscription
      (tenant_id, module_id, status)
    VALUES ('${tenantId}', '${moduleId}', 'active');
  `);
  const adminResult = await db.query(`
    SELECT available
    FROM control.resolve_admin_permission_entitlement('${permissionId}')
  `);
  if (adminResult.rows[0]?.available !== true) {
    throw new Error("Admin platform_managed resolver did not allow");
  }
  const neonResult = await db.query(`
    SELECT available
    FROM master.resolve_neon_permission_entitlement(
      '${tenantId}', '${permissionId}'
    )
  `);
  if (neonResult.rows[0]?.available !== true) {
    throw new Error("Neon plan/module resolver did not allow");
  }
  await db.exec(`
    INSERT INTO master.tenant_entitlement_override (
      tenant_id, plane_code, module_id, decision, status, effective_from
    ) VALUES (
      '${tenantId}', 'neon', '${moduleId}', 'deny', 'active',
      now() - interval '1 minute'
    )
  `);
  const neonDenied = await db.query(`
    SELECT available, reason_code
    FROM master.resolve_neon_permission_entitlement(
      '${tenantId}', '${permissionId}'
    )
  `);
  if (
    neonDenied.rows[0]?.available !== false
    || neonDenied.rows[0]?.reason_code !== "entitlement_deny_override"
  ) {
    throw new Error("Neon entitlement deny override did not win");
  }
  await db.close();
}

async function smokeMesh() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    CREATE EXTENSION pgcrypto;
    CREATE SCHEMA mesh;
    CREATE SCHEMA mesh_control;
    CREATE TABLE mesh.network_account (
      id uuid PRIMARY KEY,
      status text NOT NULL
    );
    CREATE TABLE mesh_control.auth_permission (
      id uuid PRIMARY KEY,
      account_id uuid,
      product_code text,
      capability_code text,
      status text NOT NULL,
      effective_from timestamptz NOT NULL,
      effective_until timestamptz
    );
    CREATE TABLE mesh_control.auth_permission_plane (
      permission_id uuid NOT NULL,
      plane_code text NOT NULL,
      status text NOT NULL,
      effective_from timestamptz NOT NULL,
      effective_until timestamptz,
      PRIMARY KEY (permission_id, plane_code)
    );
    CREATE TABLE mesh.account_entitlement_override (
      account_id uuid NOT NULL,
      plane_code text NOT NULL,
      product_code text,
      capability_code text,
      decision text NOT NULL,
      status text NOT NULL,
      effective_from timestamptz NOT NULL,
      effective_until timestamptz
    );
  `);
  await db.exec(await source(
    "server/db/ddl/mesh_control/01zzv_authorization_v4_entitlement_migration.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/mesh/01zza_authorization_v4_account_entitlement.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/mesh/03za_authorization_v4_account_entitlement_constraints.sql",
  ));
  await db.exec(await source(
    "server/db/ddl/mesh/05za_authorization_v4_entitlement_functions.sql",
  ));
  await mustFail(db, "Mesh entitlement requires product code", `
    INSERT INTO mesh.account_entitlement (
      account_id, product_code, status, source_type, source_ref
    ) VALUES (
      gen_random_uuid(), '', 'active', 'migration', 'smoke'
    )
  `);
  await mustFail(db, "Mesh entitlement rejects unknown account", `
    INSERT INTO mesh.account_entitlement (
      account_id, product_code, status, source_type, source_ref
    ) VALUES (
      gen_random_uuid(), 'exchange.core', 'active', 'migration', 'smoke'
    )
  `);
  const accountId = "66666666-6666-4666-8666-666666666666";
  const permissionId = "77777777-7777-4777-8777-777777777777";
  await db.exec(`
    INSERT INTO mesh.network_account (id, status)
    VALUES ('${accountId}', 'active');
    INSERT INTO mesh_control.auth_permission (
      id, product_code, capability_code, status, effective_from
    ) VALUES (
      '${permissionId}', 'exchange.core', 'order.submit', 'published',
      now() - interval '1 day'
    );
    INSERT INTO mesh_control.auth_permission_plane (
      permission_id, plane_code, status, effective_from
    ) VALUES (
      '${permissionId}', 'mesh', 'active', now() - interval '1 day'
    );
    INSERT INTO mesh.account_entitlement (
      account_id, product_code, capability_code, status,
      source_type, source_ref, effective_from
    ) VALUES (
      '${accountId}', 'exchange.core', 'order.submit', 'active',
      'contract', 'smoke', now() - interval '1 day'
    );
  `);
  const meshResult = await db.query(`
    SELECT available
    FROM mesh.resolve_account_permission_entitlement(
      '${accountId}', '${permissionId}'
    )
  `);
  if (meshResult.rows[0]?.available !== true) {
    throw new Error("Mesh account entitlement resolver did not allow");
  }
  await db.exec(`
    INSERT INTO mesh.account_entitlement_override (
      account_id, plane_code, product_code, capability_code,
      decision, status, effective_from
    ) VALUES (
      '${accountId}', 'mesh', 'exchange.core', 'order.submit',
      'deny', 'active', now() - interval '1 minute'
    )
  `);
  const meshDenied = await db.query(`
    SELECT available, reason_code
    FROM mesh.resolve_account_permission_entitlement(
      '${accountId}', '${permissionId}'
    )
  `);
  if (
    meshDenied.rows[0]?.available !== false
    || meshDenied.rows[0]?.reason_code !== "entitlement_deny_override"
  ) {
    throw new Error("Mesh entitlement deny override did not win");
  }
  await db.close();
}

await smokeNeon();
await smokeMesh();
console.log(JSON.stringify({
  postgres: "17 (PGlite 0.4.1)",
  ddlFiles: 7,
  adminPlatformManagedPolicy: true,
  neonPlanModuleGate: true,
  neonDenyOverrideWins: true,
  reviewedDiffMustBeZero: true,
  meshAccountEntitlementLocal: true,
  meshDenyOverrideWins: true,
  result: "pass",
}));
