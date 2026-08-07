#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const pgliteUrl = pathToFileURL(join(
  repoRoot,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/index.js",
)).href;
const pgcryptoUrl = pathToFileURL(join(
  repoRoot,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/contrib/pgcrypto.js",
)).href;
const btreeGistUrl = pathToFileURL(join(
  repoRoot,
  "node_modules/.pnpm/node_modules/@electric-sql/pglite/dist/contrib/btree_gist.js",
)).href;
const { PGlite } = await import(pgliteUrl);
const { pgcrypto } = await import(pgcryptoUrl);
const { btree_gist: btreeGist } = await import(btreeGistUrl);

const db = new PGlite({ extensions: { pgcrypto, btree_gist: btreeGist } });

const ddlFiles = [
  "server/db/ddl/planes/mesh/authz/03_tables.sql",
  "server/db/ddl/planes/mesh/authz/05_constraints.sql",
  "server/db/ddl/planes/mesh/authz/06_indexes.sql",
  "server/db/ddl/planes/mesh/authz/07_functions.sql",
  "server/db/ddl/planes/mesh/authz/08_triggers.sql",
  "server/db/ddl/planes/mesh/authz/09_views.sql",
  "server/db/ddl/planes/mesh/authz/10_rls.sql",
];

const ids = {
  accountA: "10000000-0000-4000-8000-000000000001",
  accountB: "10000000-0000-4000-8000-000000000002",
  principalActor: "20000000-0000-4000-8000-000000000001",
  principalUser: "20000000-0000-4000-8000-000000000002",
  principalDelegate: "20000000-0000-4000-8000-000000000003",
  permissionGlobal: "30000000-0000-4000-8000-000000000001",
  permissionForeign: "30000000-0000-4000-8000-000000000002",
  permissionNoShare: "30000000-0000-4000-8000-000000000003",
  permissionNoDelegate: "30000000-0000-4000-8000-000000000004",
  entityGlobal: "40000000-0000-4000-8000-000000000001",
  entityForeign: "40000000-0000-4000-8000-000000000002",
  relationship: "50000000-0000-4000-8000-000000000001",
  scope: "60000000-0000-4000-8000-000000000001",
  permissionSet: "70000000-0000-4000-8000-000000000001",
  role: "80000000-0000-4000-8000-000000000001",
  compilation: "81000000-0000-4000-8000-000000000001",
  acl: "90000000-0000-4000-8000-000000000001",
  delegation: "91000000-0000-4000-8000-000000000001",
};

async function exec(sql) {
  return db.exec(sql);
}

async function mustFail(label, sql, expected) {
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
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
  CREATE SCHEMA mesh;
  CREATE SCHEMA mesh_control;

  CREATE TABLE mesh.network_account (
    id uuid PRIMARY KEY,
    account_code text NOT NULL UNIQUE,
    status text NOT NULL
  );
  CREATE TABLE mesh.principal (
    id uuid PRIMARY KEY,
    status text NOT NULL
  );
  CREATE TABLE mesh.network_relationship (
    id uuid PRIMARY KEY,
    buyer_account_code text NOT NULL,
    supplier_account_code text NOT NULL,
    status text NOT NULL
  );
  CREATE TABLE mesh.account_grant (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL,
    principal_id uuid NOT NULL,
    role_code text NOT NULL,
    status text NOT NULL
  );

  CREATE TABLE mesh_control.auth_plane (
    plane_code text PRIMARY KEY
  );
  CREATE TABLE mesh_control.entity (
    id uuid PRIMARY KEY,
    account_id uuid,
    status text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz
  );
  CREATE TABLE mesh_control.auth_permission (
    id uuid PRIMARY KEY,
    account_id uuid,
    canonical_code text NOT NULL,
    entity_id uuid,
    operation_code text,
    product_code text,
    capability_code text,
    is_shareable boolean NOT NULL,
    is_delegable boolean NOT NULL,
    status text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    UNIQUE (id, is_shareable),
    UNIQUE (id, is_delegable)
  );
  CREATE TABLE mesh_control.auth_permission_plane (
    permission_id uuid NOT NULL,
    plane_code text NOT NULL,
    status text NOT NULL,
    effective_from timestamptz NOT NULL DEFAULT now(),
    effective_until timestamptz,
    PRIMARY KEY (permission_id, plane_code)
  );
  INSERT INTO mesh_control.auth_plane VALUES ('mesh');
`);

for (const relPath of ddlFiles) {
  try {
    await exec(await readFile(join(repoRoot, relPath), "utf8"));
  } catch (error) {
    throw new Error(`DDL failed at ${relPath}: ${String(error)}`);
  }
}

await exec(`
  INSERT INTO mesh.network_account (id, account_code, status) VALUES
    ('${ids.accountA}', 'BNA-0000000001', 'active'),
    ('${ids.accountB}', 'BNA-0000000002', 'active');
  INSERT INTO mesh.principal (id, status) VALUES
    ('${ids.principalActor}', 'active'),
    ('${ids.principalUser}', 'active'),
    ('${ids.principalDelegate}', 'active');
  INSERT INTO mesh.network_relationship
      (id, buyer_account_code, supplier_account_code, status)
    VALUES ('${ids.relationship}', 'BNA-0000000002', 'BNA-0000000002', 'active');

  INSERT INTO mesh_control.entity
      (id, account_id, status, effective_from)
    VALUES
      ('${ids.entityGlobal}', NULL, 'published', now() - interval '1 minute'),
      ('${ids.entityForeign}', '${ids.accountB}', 'published', now() - interval '1 minute');

  INSERT INTO mesh_control.auth_permission
      (id, account_id, canonical_code, entity_id, operation_code,
       is_shareable, is_delegable, status, effective_from)
    VALUES
      ('${ids.permissionGlobal}', NULL, 'mesh.test.read',
       '${ids.entityGlobal}', 'read', true, true, 'published', now() - interval '1 minute'),
      ('${ids.permissionForeign}', '${ids.accountB}', 'mesh.foreign.read',
       '${ids.entityForeign}', 'read', true, true, 'published', now() - interval '1 minute'),
      ('${ids.permissionNoShare}', NULL, 'mesh.test.private',
       '${ids.entityGlobal}', 'private', false, true, 'published', now() - interval '1 minute'),
      ('${ids.permissionNoDelegate}', NULL, 'mesh.test.nodelegate',
       '${ids.entityGlobal}', 'nodelegate', true, false, 'published', now() - interval '1 minute');
  INSERT INTO mesh_control.auth_permission_plane
      (permission_id, plane_code, status, effective_from)
    SELECT id, 'mesh', 'active', now() - interval '1 minute'
    FROM mesh_control.auth_permission;

  INSERT INTO mesh.auth_plane_membership
      (account_id, plane_code, principal_id, status, source_type)
    VALUES
      ('${ids.accountA}', 'mesh', '${ids.principalActor}', 'active', 'seed'),
      ('${ids.accountA}', 'mesh', '${ids.principalUser}', 'active', 'seed'),
      ('${ids.accountA}', 'mesh', '${ids.principalDelegate}', 'active', 'seed');

  INSERT INTO mesh.auth_scope_target
      (id, account_id, plane_code, scope_kind, scope_key, display_name)
    VALUES
      ('${ids.scope}', '${ids.accountA}', 'mesh', 'account', 'account.root', 'Account root');
  INSERT INTO mesh.auth_scope_account
      (scope_target_id, account_id, plane_code, scope_account_id)
    VALUES ('${ids.scope}', '${ids.accountA}', 'mesh', '${ids.accountA}');
  UPDATE mesh.auth_scope_target SET status = 'active' WHERE id = '${ids.scope}';

  INSERT INTO mesh.auth_permission_set
      (id, account_id, plane_code, code, name)
    VALUES ('${ids.permissionSet}', '${ids.accountA}', 'mesh', 'test.reader', 'Reader');
  INSERT INTO mesh.auth_permission_set_rule
      (account_id, plane_code, permission_set_id, permission_id)
    VALUES ('${ids.accountA}', 'mesh', '${ids.permissionSet}', '${ids.permissionGlobal}');
  SELECT mesh.publish_auth_permission_set(
      '${ids.permissionSet}', '${ids.principalActor}', 1
  );

  INSERT INTO mesh.auth_role
      (id, account_id, plane_code, code, name, business_owner_principal_id)
    VALUES (
      '${ids.role}', '${ids.accountA}', 'mesh', 'test.reader', 'Reader',
      '${ids.principalActor}'
    );
  INSERT INTO mesh.auth_role_compilation
      (id, account_id, plane_code, role_id, compilation_no, catalog_version,
       content_checksum, compiled_by)
    VALUES (
      '${ids.compilation}', '${ids.accountA}', 'mesh', '${ids.role}', 1, 1,
      encode(digest('${ids.permissionGlobal}:1', 'sha256'), 'hex'),
      '${ids.principalActor}'
    );
  INSERT INTO mesh.auth_role_permission
      (account_id, plane_code, role_id, compilation_id, permission_id)
    VALUES (
      '${ids.accountA}', 'mesh', '${ids.role}', '${ids.compilation}',
      '${ids.permissionGlobal}'
    );
  SELECT mesh.publish_auth_role_compilation(
      '${ids.role}', '${ids.compilation}', '${ids.principalActor}', 1
  );

  INSERT INTO mesh.auth_record_acl
      (id, account_id, plane_code, entity_id, record_id, subject_kind,
       principal_id, reason, granted_by)
    VALUES (
      '${ids.acl}', '${ids.accountA}', 'mesh', '${ids.entityGlobal}',
      gen_random_uuid(), 'principal', '${ids.principalUser}', 'test',
      '${ids.principalActor}'
    );

  INSERT INTO mesh.auth_delegation
      (id, account_id, plane_code, delegator_id, delegate_id, reason,
       effective_until)
    VALUES (
      '${ids.delegation}', '${ids.accountA}', 'mesh', '${ids.principalUser}',
      '${ids.principalDelegate}', 'test', now() + interval '1 hour'
    );
`);

await mustFail(
  "sealed plane",
  `INSERT INTO mesh.auth_scope_target
     (account_id, plane_code, scope_kind, scope_key, display_name)
   VALUES ('${ids.accountA}', 'neon', 'account', 'bad.plane', 'bad')`,
  "plane",
);

await mustFail(
  "typed scope activation",
  `INSERT INTO mesh.auth_scope_target
     (account_id, plane_code, scope_kind, scope_key, display_name, status)
   VALUES ('${ids.accountA}', 'mesh', 'resource', 'missing.child', 'bad', 'active')`,
  "exactly one typed child",
);

await mustFail(
  "foreign relationship account",
  `WITH s AS (
     INSERT INTO mesh.auth_scope_target
       (account_id, plane_code, scope_kind, scope_key, display_name)
     VALUES (
       '${ids.accountA}', 'mesh', 'network_relationship',
       'foreign.relationship', 'bad'
     )
     RETURNING id
   )
   INSERT INTO mesh.auth_scope_network_relationship
     (scope_target_id, account_id, plane_code, network_relationship_id)
   SELECT id, '${ids.accountA}', 'mesh', '${ids.relationship}' FROM s`,
  "belong",
);

await mustFail(
  "foreign resource entity",
  `WITH s AS (
     INSERT INTO mesh.auth_scope_target
       (account_id, plane_code, scope_kind, scope_key, display_name)
     VALUES ('${ids.accountA}', 'mesh', 'resource', 'foreign.entity', 'bad')
     RETURNING id
   )
   INSERT INTO mesh.auth_scope_resource
     (scope_target_id, account_id, plane_code, entity_id, resource_id)
   SELECT id, '${ids.accountA}', 'mesh', '${ids.entityForeign}', gen_random_uuid()
   FROM s`,
  "another Mesh account",
);

const foreignPermissionCases = [
  [
    "permission-set rule",
    `WITH s AS (
       INSERT INTO mesh.auth_permission_set
         (account_id, plane_code, code, name)
       VALUES ('${ids.accountA}', 'mesh', 'foreign.set', 'bad')
       RETURNING id
     )
     INSERT INTO mesh.auth_permission_set_rule
       (account_id, plane_code, permission_set_id, permission_id)
     SELECT '${ids.accountA}', 'mesh', id, '${ids.permissionForeign}' FROM s`,
  ],
  [
    "compiled role permission",
    `WITH r AS (
       INSERT INTO mesh.auth_role
         (account_id, plane_code, code, name, business_owner_principal_id)
       VALUES (
         '${ids.accountA}', 'mesh', 'foreign.role', 'bad', '${ids.principalActor}'
       ) RETURNING id
     ), c AS (
       INSERT INTO mesh.auth_role_compilation
         (account_id, plane_code, role_id, compilation_no, catalog_version,
          content_checksum, compiled_by)
       SELECT '${ids.accountA}', 'mesh', id, 1, 1,
              repeat('0', 64), '${ids.principalActor}' FROM r
       RETURNING role_id, id
     )
     INSERT INTO mesh.auth_role_permission
       (account_id, plane_code, role_id, compilation_id, permission_id)
     SELECT '${ids.accountA}', 'mesh', role_id, id, '${ids.permissionForeign}'
     FROM c`,
  ],
  [
    "deny rule",
    `INSERT INTO mesh.auth_deny_rule
       (account_id, plane_code, permission_id, scope_target_id, subject_kind,
        reason, owner_principal_id)
     VALUES (
       '${ids.accountA}', 'mesh', '${ids.permissionForeign}', '${ids.scope}',
       'hard_policy', 'bad', '${ids.principalActor}'
     )`,
  ],
  [
    "override",
    `INSERT INTO mesh.auth_override
       (account_id, plane_code, principal_id, permission_id, scope_target_id,
        reason, approval_ticket, approved_by, approved_at, effective_from,
        effective_until)
     VALUES (
       '${ids.accountA}', 'mesh', '${ids.principalUser}',
       '${ids.permissionForeign}', '${ids.scope}', 'bad', 'T-1',
       '${ids.principalActor}', now() - interval '1 minute', now(),
       now() + interval '1 hour'
     )`,
  ],
  [
    "record ACL permission",
    `INSERT INTO mesh.auth_record_acl_permission
       (account_id, plane_code, record_acl_id, permission_id)
     VALUES (
       '${ids.accountA}', 'mesh', '${ids.acl}', '${ids.permissionForeign}'
     )`,
  ],
  [
    "delegation permission",
    `INSERT INTO mesh.auth_delegation_permission
       (account_id, plane_code, delegation_id, permission_id)
     VALUES (
       '${ids.accountA}', 'mesh', '${ids.delegation}', '${ids.permissionForeign}'
     )`,
  ],
];

for (const [label, sql] of foreignPermissionCases) {
  await mustFail(`foreign catalog ${label}`, sql);
}

await mustFail(
  "foreign record ACL entity",
  `INSERT INTO mesh.auth_record_acl
     (account_id, plane_code, entity_id, record_id, subject_kind,
      principal_id, reason, granted_by)
   VALUES (
     '${ids.accountA}', 'mesh', '${ids.entityForeign}', gen_random_uuid(),
     'principal', '${ids.principalUser}', 'bad', '${ids.principalActor}'
   )`,
  "another Mesh account",
);

await mustFail(
  "non-shareable ACL permission",
  `INSERT INTO mesh.auth_record_acl_permission
     (account_id, plane_code, record_acl_id, permission_id)
   VALUES (
     '${ids.accountA}', 'mesh', '${ids.acl}', '${ids.permissionNoShare}'
   )`,
  "foreign key",
);

await mustFail(
  "non-delegable delegation permission",
  `INSERT INTO mesh.auth_delegation_permission
     (account_id, plane_code, delegation_id, permission_id)
   VALUES (
     '${ids.accountA}', 'mesh', '${ids.delegation}', '${ids.permissionNoDelegate}'
   )`,
  "foreign key",
);

await mustFail(
  "empty role publication",
  `WITH r AS (
     INSERT INTO mesh.auth_role
       (account_id, plane_code, code, name, business_owner_principal_id)
     VALUES (
       '${ids.accountA}', 'mesh', 'empty.role', 'bad', '${ids.principalActor}'
     ) RETURNING id
   ), c AS (
     INSERT INTO mesh.auth_role_compilation
       (account_id, plane_code, role_id, compilation_no, catalog_version,
        content_checksum, compiled_by)
     SELECT '${ids.accountA}', 'mesh', id, 1, 1,
            encode(digest('', 'sha256'), 'hex'), '${ids.principalActor}' FROM r
     RETURNING role_id, id
   )
   SELECT mesh.publish_auth_role_compilation(
     role_id, id, '${ids.principalActor}', 1
   ) FROM c`,
  "without exact permissions",
);

await mustFail(
  "published compilation immutability",
  `UPDATE mesh.auth_role_compilation
   SET source_snapshot = '{"tampered":true}'::jsonb
   WHERE id = '${ids.compilation}'`,
  "immutable",
);

await mustFail(
  "hard delete retention",
  `DELETE FROM mesh.auth_plane_membership
   WHERE account_id = '${ids.accountA}'
     AND principal_id = '${ids.principalUser}'`,
  "Hard delete blocked",
);

await exec(`
  CREATE TABLE mesh.principal_identity_binding (id uuid PRIMARY KEY);

  CREATE TABLE mesh_control.auth_catalog_owner (id uuid PRIMARY KEY);
  CREATE TABLE mesh_control.entity_version (id uuid PRIMARY KEY);
  CREATE TABLE mesh_control.auth_permission_scope_policy (id uuid PRIMARY KEY);
  CREATE TABLE mesh_control.entity_operation (id uuid PRIMARY KEY);
  CREATE TABLE mesh_control.entity_operation_plane (id uuid PRIMARY KEY);
  CREATE TABLE mesh_control.entity_scope_binding (id uuid PRIMARY KEY);

  CREATE SCHEMA mesh_log;
  CREATE TABLE mesh_log.authorization_invalidation_outbox_v2
    (id uuid PRIMARY KEY);
  CREATE TABLE mesh_log.authorization_v2_replay_binding
    (id uuid PRIMARY KEY);
  CREATE TABLE mesh_log.authorization_v2_replay_transaction
    (id uuid PRIMARY KEY);
  CREATE TABLE mesh_log.authorization_v2_replay_inbox
    (id uuid PRIMARY KEY);
  CREATE TABLE mesh_log.authorization_v2_replay_application
    (id uuid PRIMARY KEY);
  CREATE TABLE mesh_log.auth_decision_evidence_v2
    (id uuid PRIMARY KEY);
  CREATE TABLE mesh_log.auth_decision_evidence_v2_default
    (id uuid PRIMARY KEY);

  CREATE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION mesh_log.trg_authorization_invalidation_immutable_v2()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION mesh_log.trg_authorization_v2_replay_inbox_immutable()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION mesh_log.trg_authorization_v2_replay_state_guard()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;
  CREATE FUNCTION mesh_log.trg_auth_decision_evidence_v2_prepare()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN NEW;
  END
  $$;
  CREATE FUNCTION mesh_log.trg_auth_decision_evidence_v2_immutable()
  RETURNS trigger LANGUAGE plpgsql AS $$
  BEGIN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END
  $$;

  CREATE TRIGGER trg_authorization_v2_invalidate
    AFTER INSERT OR UPDATE OR DELETE ON mesh.account_grant
    FOR EACH ROW
    EXECUTE FUNCTION mesh_log.trg_authorization_authority_invalidate_v2();
`);

const invalidationDdl = await readFile(
  join(
    repoRoot,
    "server/db/ddl/common/event/08_triggers.sql",
  ),
  "utf8",
);
await mustFail(
  "unexpected Mesh v2 invalidation target",
  invalidationDdl,
  "Unexpected Mesh v2 invalidation target",
);
await exec(`
  DROP TRIGGER trg_authorization_v2_invalidate ON mesh.account_grant;
`);
await exec(invalidationDdl);

const counts = await db.query(`
  SELECT
    (SELECT count(*)::int FROM information_schema.tables
     WHERE table_schema = 'mesh'
       AND table_name IN (${ddlFiles.length ? `
         'auth_plane_membership','auth_scope_target','auth_scope_account',
         'auth_scope_network_relationship','auth_scope_resource',
         'auth_permission_set','auth_permission_set_rule','auth_role',
         'auth_role_compilation','auth_role_permission_set',
         'auth_role_permission','auth_group_v2','auth_group_member_v2',
         'auth_group_role_v2','auth_deny_rule','auth_deny_rule_principal',
         'auth_deny_rule_group','auth_deny_rule_hard_policy','auth_override',
         'auth_record_acl','auth_record_acl_permission','auth_delegation',
         'auth_delegation_permission','auth_delegation_permission_scope',
         'account_entitlement_override'` : "NULL"})
      ) AS authority_tables,
    (SELECT count(*)::int FROM pg_trigger
     WHERE tgname = 'mesh_auth_v2_00_retention_guard'
       AND NOT tgisinternal) AS retention_triggers,
    (SELECT count(*)::int FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'mesh' AND c.relrowsecurity
       AND c.relname LIKE 'auth_%'
        OR n.nspname = 'mesh' AND c.relrowsecurity
       AND c.relname = 'account_entitlement_override') AS rls_tables,
    (SELECT count(*)::int FROM pg_trigger
     WHERE tgname = 'trg_authorization_v2_invalidate'
       AND tgenabled = 'A'
       AND tgtype = 29
       AND NOT tgisinternal) AS exact_invalidation_targets
`);

const summary = counts.rows[0];
if (summary.authority_tables !== 25) {
  throw new Error(`Expected 25 authority tables, got ${summary.authority_tables}`);
}
if (summary.retention_triggers !== 25) {
  throw new Error(`Expected 25 retention triggers, got ${summary.retention_triggers}`);
}
if (summary.rls_tables !== 25) {
  throw new Error(`Expected 25 RLS tables, got ${summary.rls_tables}`);
}
if (summary.exact_invalidation_targets !== 40) {
  throw new Error(
    `Expected 40 invalidation targets, got ${summary.exact_invalidation_targets}`,
  );
}

console.log(JSON.stringify({
  postgres: "17 (PGlite 0.4.1)",
  ddlFiles: ddlFiles.length + 1,
  authorityTables: summary.authority_tables,
  retentionTriggers: summary.retention_triggers,
  forceRlsTables: summary.rls_tables,
  exactInvalidationTargets: summary.exact_invalidation_targets,
  unexpectedInvalidationTargetRejected: true,
  negativeCases: 17,
  result: "pass",
}));

await db.close();
