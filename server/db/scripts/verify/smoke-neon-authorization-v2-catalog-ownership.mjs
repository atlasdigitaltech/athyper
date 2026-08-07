#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const pgliteRoot = join(
  repoRoot,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist",
);
const { PGlite } = await import(pathToFileURL(join(pgliteRoot, "index.js")).href);
const { pgcrypto } = await import(
  pathToFileURL(join(pgliteRoot, "contrib/pgcrypto.js")).href
);
const db = new PGlite({ extensions: { pgcrypto } });

const tenantA = "10000000-0000-4000-8000-000000000001";
const tenantB = "10000000-0000-4000-8000-000000000002";
const actor = "20000000-0000-4000-8000-000000000001";
const permissionGlobal = "30000000-0000-4000-8000-000000000001";
const permissionForeign = "30000000-0000-4000-8000-000000000002";
const entityGlobal = "40000000-0000-4000-8000-000000000001";
const entityForeign = "40000000-0000-4000-8000-000000000002";
const scope = "50000000-0000-4000-8000-000000000001";
const setId = "60000000-0000-4000-8000-000000000001";
const roleId = "70000000-0000-4000-8000-000000000001";
const compilationId = "71000000-0000-4000-8000-000000000001";
const aclId = "80000000-0000-4000-8000-000000000001";
const delegationId = "90000000-0000-4000-8000-000000000001";

async function exec(sql) {
  return db.exec(sql);
}

async function mustFail(label, sql, expected = "foreign-tenant") {
  try {
    await exec(sql);
  } catch (error) {
    const message = String(error);
    if (expected && !message.toLowerCase().includes(expected.toLowerCase())) {
      throw new Error(`${label}: unexpected error: ${message}`);
    }
    return;
  }
  throw new Error(`${label}: statement unexpectedly succeeded`);
}

await exec(`
  CREATE ROLE athyperadmin;
  CREATE EXTENSION pgcrypto;
  CREATE SCHEMA shared;
  CREATE SCHEMA control;
  CREATE SCHEMA master;

  CREATE FUNCTION shared.uuidv7()
  RETURNS uuid LANGUAGE sql VOLATILE
  AS 'SELECT gen_random_uuid()';

  CREATE TABLE master.principal (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    status text NOT NULL,
    is_locked boolean NOT NULL DEFAULT false,
    PRIMARY KEY (id)
  );
  CREATE TABLE shared.module (id uuid PRIMARY KEY, status text NOT NULL);
  CREATE TABLE shared.enterprise_feature (id uuid PRIMARY KEY, status text NOT NULL);

  CREATE TABLE control.auth_catalog_owner (
    id uuid PRIMARY KEY,
    owner_kind text NOT NULL,
    tenant_id uuid,
    status text NOT NULL
  );
  CREATE TABLE control.auth_permission (
    id uuid PRIMARY KEY,
    catalog_owner_id uuid NOT NULL,
    entity_id uuid,
    canonical_code text NOT NULL,
    is_shareable boolean NOT NULL,
    is_delegable boolean NOT NULL,
    status text NOT NULL,
    effective_from timestamptz NOT NULL,
    effective_until timestamptz,
    UNIQUE (id, is_shareable),
    UNIQUE (id, is_delegable)
  );
  CREATE TABLE control.auth_permission_plane (
    permission_id uuid NOT NULL,
    plane_code text NOT NULL,
    status text NOT NULL,
    effective_from timestamptz NOT NULL,
    effective_until timestamptz,
    PRIMARY KEY (permission_id, plane_code)
  );
  CREATE TABLE control.entity (
    id uuid PRIMARY KEY,
    tenant_id uuid
  );
`);

for (const relPath of [
  "server/db/ddl/planes/neon/authz/03_tables.sql",
  "server/db/ddl/planes/neon/authz/07_functions.sql",
  "server/db/ddl/planes/neon/authz/08_triggers.sql",
]) {
  try {
    await exec(await readFile(join(repoRoot, relPath), "utf8"));
  } catch (error) {
    throw new Error(`DDL failed at ${relPath}: ${String(error)}`);
  }
}

// The production database grants the SECURITY DEFINER owner schema visibility
// and catalog read access. The focused fixture creates its stubs as postgres, so
// reproduce those runtime grants explicitly before exercising trigger-owned
// helper calls.
await exec(`
  GRANT USAGE ON SCHEMA shared, control, master TO athyperadmin;
  GRANT SELECT ON ALL TABLES IN SCHEMA shared, control, master TO athyperadmin;
`);

await exec(`
  INSERT INTO master.principal (id, tenant_id, status)
  VALUES ('${actor}', '${tenantA}', 'active');

  INSERT INTO control.auth_catalog_owner (id, owner_kind, tenant_id, status)
  VALUES
    ('a0000000-0000-4000-8000-000000000001', 'platform', NULL, 'active'),
    ('a0000000-0000-4000-8000-000000000002', 'tenant', '${tenantB}', 'active');

  INSERT INTO control.entity (id, tenant_id)
  VALUES
    ('${entityGlobal}', NULL),
    ('${entityForeign}', '${tenantB}');

  INSERT INTO control.auth_permission
      (id, catalog_owner_id, entity_id, canonical_code, is_shareable,
       is_delegable, status, effective_from)
  VALUES
    ('${permissionGlobal}', 'a0000000-0000-4000-8000-000000000001',
     '${entityGlobal}', 'neon.test.read', true, true, 'published',
     now() - interval '1 minute'),
    ('${permissionForeign}', 'a0000000-0000-4000-8000-000000000002',
     '${entityForeign}', 'neon.foreign.read', true, true, 'published',
     now() - interval '1 minute');

  INSERT INTO control.auth_permission_plane
      (permission_id, plane_code, status, effective_from)
  VALUES
    ('${permissionGlobal}', 'neon', 'active', now() - interval '1 minute'),
    ('${permissionForeign}', 'neon', 'active', now() - interval '1 minute');

  INSERT INTO master.auth_scope_target
      (id, tenant_id, plane_code, scope_kind, scope_key, display_name,
       created_by)
  VALUES
      ('${scope}', '${tenantA}', 'neon', 'tenant', 'tenant.root',
       'Tenant root', '${actor}');

  INSERT INTO master.auth_permission_set
      (id, tenant_id, plane_code, code, name, created_by)
  VALUES
      ('${setId}', '${tenantA}', 'neon', 'test.reader', 'Reader', '${actor}');

  INSERT INTO master.auth_role
      (id, tenant_id, plane_code, code, name, business_owner_principal_id,
       created_by)
  VALUES
      ('${roleId}', '${tenantA}', 'neon', 'test.reader', 'Reader',
       '${actor}', '${actor}');
  INSERT INTO master.auth_role_compilation
      (id, tenant_id, plane_code, role_id, compilation_no, catalog_version,
       content_checksum, compiled_by)
  VALUES
      ('${compilationId}', '${tenantA}', 'neon', '${roleId}', 1, 1,
       repeat('0', 64), '${actor}');

  INSERT INTO master.auth_record_acl
      (id, tenant_id, plane_code, entity_id, record_id, subject_kind,
       principal_id, reason, granted_by, created_by)
  VALUES
      ('${aclId}', '${tenantA}', 'neon', '${entityGlobal}', gen_random_uuid(),
       'principal', '${actor}', 'test', '${actor}', '${actor}');

  INSERT INTO master.auth_delegation
      (id, tenant_id, plane_code, delegator_id, delegate_id, reason,
       effective_until, created_by)
  VALUES
      ('${delegationId}', '${tenantA}', 'neon', '${actor}',
       '20000000-0000-4000-8000-000000000002', 'test',
       now() + interval '1 hour', '${actor}');

  INSERT INTO master.auth_permission_set_rule
      (tenant_id, plane_code, permission_set_id, permission_id, created_by)
  VALUES
      ('${tenantA}', 'neon', '${setId}', '${permissionGlobal}', '${actor}');
  INSERT INTO master.auth_role_permission
      (tenant_id, plane_code, role_id, compilation_id, permission_id, created_by)
  VALUES
      ('${tenantA}', 'neon', '${roleId}', '${compilationId}',
       '${permissionGlobal}', '${actor}');
  INSERT INTO master.auth_record_acl_permission
      (tenant_id, plane_code, record_acl_id, permission_id, created_by)
  VALUES
      ('${tenantA}', 'neon', '${aclId}', '${permissionGlobal}', '${actor}');
  INSERT INTO master.auth_delegation_permission
      (tenant_id, plane_code, delegation_id, permission_id, created_by)
  VALUES
      ('${tenantA}', 'neon', '${delegationId}', '${permissionGlobal}', '${actor}');
`);

const foreignPermissionCases = [
  [
    "permission set rule",
    `INSERT INTO master.auth_permission_set_rule
       (tenant_id, plane_code, permission_set_id, permission_id, created_by)
     VALUES (
       '${tenantA}', 'neon', '${setId}', '${permissionForeign}', '${actor}'
     )`,
  ],
  [
    "compiled role permission",
    `INSERT INTO master.auth_role_permission
       (tenant_id, plane_code, role_id, compilation_id, permission_id, created_by)
     VALUES (
       '${tenantA}', 'neon', '${roleId}', '${compilationId}',
       '${permissionForeign}', '${actor}'
     )`,
  ],
  [
    "deny",
    `INSERT INTO master.auth_deny_rule
       (tenant_id, plane_code, permission_id, scope_target_id, subject_kind,
        reason, owner_principal_id, created_by)
     VALUES (
       '${tenantA}', 'neon', '${permissionForeign}', '${scope}', 'hard_policy',
       'bad', '${actor}', '${actor}'
     )`,
  ],
  [
    "override",
    `INSERT INTO master.auth_override
       (tenant_id, plane_code, principal_id, permission_id, scope_target_id,
        reason, approval_ticket, approved_by, approved_at, effective_from,
        effective_until, created_by)
     VALUES (
       '${tenantA}', 'neon', '${actor}', '${permissionForeign}', '${scope}',
       'bad', 'T-1', '${actor}', now() - interval '1 minute', now(),
       now() + interval '1 hour', '${actor}'
     )`,
  ],
  [
    "record ACL permission",
    `INSERT INTO master.auth_record_acl_permission
       (tenant_id, plane_code, record_acl_id, permission_id, created_by)
     VALUES (
       '${tenantA}', 'neon', '${aclId}', '${permissionForeign}', '${actor}'
     )`,
  ],
  [
    "delegation permission",
    `INSERT INTO master.auth_delegation_permission
       (tenant_id, plane_code, delegation_id, permission_id, created_by)
     VALUES (
       '${tenantA}', 'neon', '${delegationId}', '${permissionForeign}', '${actor}'
     )`,
  ],
];

for (const [label, sql] of foreignPermissionCases) {
  await mustFail(label, sql);
}

await mustFail(
  "record ACL entity",
  `INSERT INTO master.auth_record_acl
     (tenant_id, plane_code, entity_id, record_id, subject_kind,
      principal_id, reason, granted_by, created_by)
   VALUES (
     '${tenantA}', 'neon', '${entityForeign}', gen_random_uuid(), 'principal',
     '${actor}', 'bad', '${actor}', '${actor}'
   )`,
  "foreign-tenant entity",
);

await exec(`
  CREATE TABLE shared.subscription_plan (id uuid PRIMARY KEY);
  CREATE TABLE shared.subscription_plan_version (id uuid PRIMARY KEY);
  CREATE TABLE shared.plan_module_access (id uuid PRIMARY KEY);
  CREATE TABLE shared.plan_feature_access (id uuid PRIMARY KEY);
  CREATE TABLE shared.permission_category (id uuid PRIMARY KEY);

  CREATE TABLE control.auth_plane (id uuid PRIMARY KEY);
  CREATE TABLE control.auth_permission_scope_policy (id uuid PRIMARY KEY);
  CREATE TABLE control.entity_version (id uuid PRIMARY KEY);
  CREATE TABLE control.entity_operation (id uuid PRIMARY KEY);
  CREATE TABLE control.entity_operation_plane (id uuid PRIMARY KEY);
  CREATE TABLE control.entity_scope_binding (id uuid PRIMARY KEY);

  CREATE TABLE master.tenant (id uuid PRIMARY KEY);
  CREATE TABLE master.principal_identity_binding (id uuid PRIMARY KEY);
  CREATE TABLE master.tenant_module_subscription (id uuid PRIMARY KEY);
  CREATE TABLE master.tenant_feature_entitlement (id uuid PRIMARY KEY);

  CREATE SCHEMA event;
  CREATE TABLE event.authorization_invalidation_outbox_v2 (id uuid PRIMARY KEY);
  CREATE TABLE event.authorization_v2_replay_binding (id uuid PRIMARY KEY);
  CREATE TABLE event.authorization_v2_replay_transaction (id uuid PRIMARY KEY);
  CREATE TABLE event.authorization_v2_replay_inbox (id uuid PRIMARY KEY);
  CREATE TABLE event.authorization_v2_replay_application (id uuid PRIMARY KEY);

  CREATE FUNCTION event.trg_authorization_authority_invalidate_v2()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION event.trg_authorization_invalidation_immutable_v2()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION event.trg_authorization_v2_replay_inbox_immutable()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION event.trg_authorization_v2_replay_state_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;

  CREATE TRIGGER trg_authorization_v2_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON shared.permission_category
    FOR EACH ROW
    EXECUTE FUNCTION event.trg_authorization_authority_invalidate_v2();
`);

const invalidationDdl = await readFile(
  join(
    repoRoot,
    "server/db/ddl/common/event/08_triggers.sql",
  ),
  "utf8",
);
await mustFail(
  "unexpected v2 invalidation target",
  invalidationDdl,
  "Unexpected Neon/Admin v2 invalidation target",
);
await exec(`
  DROP TRIGGER trg_authorization_v2_invalidate
    ON shared.permission_category;
`);
await exec(invalidationDdl);

const state = await db.query(`
  SELECT
    count(*) FILTER (
      WHERE tgname IN (
        'trg_auth_permission_set_rule_guard',
        'trg_auth_role_permission_guard',
        'trg_auth_deny_rule_guard',
        'trg_auth_override_guard',
        'trg_auth_record_acl_guard',
        'trg_auth_record_acl_permission_guard',
        'trg_auth_delegation_permission_guard'
      ) AND tgenabled = 'A'
    )::int AS always_catalog_guards
  FROM pg_trigger
  WHERE NOT tgisinternal
`);

if (state.rows[0].always_catalog_guards !== 7) {
  throw new Error(
    `Expected 7 ENABLE ALWAYS catalog guards, got ${state.rows[0].always_catalog_guards}`,
  );
}

const invalidationState = await db.query(`
  SELECT
    count(*) FILTER (
      WHERE tgname = 'trg_authorization_v2_invalidate'
        AND tgenabled = 'A'
        AND tgtype = 29
    )::int AS exact_invalidation_targets
  FROM pg_trigger
  WHERE NOT tgisinternal
`);
if (invalidationState.rows[0].exact_invalidation_targets !== 47) {
  throw new Error(
    "Expected 47 exact ENABLE ALWAYS invalidation targets, got "
    + invalidationState.rows[0].exact_invalidation_targets,
  );
}

console.log(JSON.stringify({
  postgres: "17 (PGlite 0.4.1)",
  ddlFiles: 4,
  positiveCatalogWrites: 4,
  negativeForeignTenantWrites: 7,
  alwaysCatalogGuards: state.rows[0].always_catalog_guards,
  exactInvalidationTargets:
    invalidationState.rows[0].exact_invalidation_targets,
  unexpectedInvalidationTargetRejected: true,
  result: "pass",
}));

await db.close();
