#!/usr/bin/env tsx
/**
 * Post-backfill Wave 3 database gate.
 *
 * This is intentionally separate from CI: both plane-local database URLs are
 * mandatory, and every result must be zero before authority publication.
 */

import postgres from "postgres";

const neonUrl = process.env["AUTHORIZATION_V2_NEON_DATABASE_URL"];
const meshUrl = process.env["AUTHORIZATION_V2_MESH_DATABASE_URL"];
if (!neonUrl || !meshUrl) {
  throw new Error(
    "AUTHORIZATION_V2_NEON_DATABASE_URL and "
      + "AUTHORIZATION_V2_MESH_DATABASE_URL are required",
  );
}

interface Check {
  name: string;
  count: number;
}

async function scalar(
  sql: ReturnType<typeof postgres>,
  statement: string,
): Promise<number> {
  const rows = await sql.unsafe<{ count: number }[]>(statement);
  return Number(rows[0]?.count ?? 0);
}

async function checks(
  sql: ReturnType<typeof postgres>,
  definitions: Array<[string, string]>,
): Promise<Check[]> {
  const results: Check[] = [];
  for (const [name, statement] of definitions) {
    results.push({ name, count: await scalar(sql, statement) });
  }
  return results;
}

async function verifyNeon(
  sql: ReturnType<typeof postgres>,
): Promise<Check[]> {
  return checks(sql, [
    ["neon_active_human_without_deliberate_mapping", `
      SELECT count(*)::int
      FROM master.principal p
      WHERE p.status = 'active'
        AND NOT p.is_service_account
        AND NOT EXISTS (
          SELECT 1
          FROM control.authorization_v3_subject_mapping m
          WHERE m.tenant_id = p.tenant_id
            AND m.principal_id = p.id
            AND m.plane_code = 'neon'
            AND m.status IN ('validated', 'applied')
            AND m.disposition IN ('mapped', 'quarantined_zero_grant')
        )
    `],
    ["neon_active_admin_membership_without_mapping", `
      SELECT count(*)::int
      FROM master.auth_plane_membership membership
      WHERE membership.plane_code = 'admin'
        AND membership.status = 'active'
        AND membership.effective_from <= now()
        AND (
          membership.effective_until IS NULL
          OR membership.effective_until > now()
        )
        AND NOT EXISTS (
          SELECT 1
          FROM control.authorization_v3_subject_mapping mapping
          WHERE mapping.tenant_id = membership.tenant_id
            AND mapping.plane_code = membership.plane_code
            AND mapping.principal_id = membership.principal_id
            AND mapping.target_membership_id = membership.id
            AND mapping.status IN ('validated', 'applied')
        )
    `],
    ["neon_subject_mapping_anomaly", `
      SELECT count(*)::int
      FROM control.authorization_v3_subject_mapping
      WHERE status = 'anomaly'
         OR anomaly_code IS NOT NULL
    `],
    ["neon_subject_mapping_target_mismatch", `
      SELECT count(*)::int
      FROM control.authorization_v3_subject_mapping mapping
      WHERE mapping.status IN ('validated', 'applied')
        AND mapping.disposition IN ('mapped', 'quarantined_zero_grant')
        AND (
          NOT EXISTS (
            SELECT 1
            FROM master.auth_plane_membership membership
            WHERE membership.tenant_id = mapping.tenant_id
              AND membership.plane_code = mapping.plane_code
              AND membership.principal_id = mapping.principal_id
              AND membership.id = mapping.target_membership_id
          )
          OR EXISTS (
            SELECT 1
            FROM unnest(mapping.target_group_ids) group_id
            LEFT JOIN master.auth_group_v2 auth_group
              ON auth_group.tenant_id = mapping.tenant_id
             AND auth_group.plane_code = mapping.plane_code
             AND auth_group.id = group_id
            WHERE auth_group.id IS NULL
          )
        )
    `],
    ["neon_quarantine_group_has_grant", `
      SELECT count(*)::int
      FROM control.authorization_v3_subject_mapping mapping
      CROSS JOIN LATERAL unnest(mapping.target_group_ids) group_id
      JOIN master.auth_current_group_role_v role_grant
        ON role_grant.tenant_id = mapping.tenant_id
       AND role_grant.plane_code = mapping.plane_code
       AND role_grant.group_id = group_id
      WHERE mapping.disposition = 'quarantined_zero_grant'
        AND mapping.status IN ('validated', 'applied')
    `],
    ["neon_current_group_member_inconsistent", `
      SELECT count(*)::int
      FROM master.auth_current_group_member_v current_member
      LEFT JOIN master.auth_group_member_v2 member
        ON member.id = current_member.id
       AND member.tenant_id = current_member.tenant_id
       AND member.plane_code = current_member.plane_code
      LEFT JOIN master.auth_group_v2 auth_group
        ON auth_group.id = current_member.group_id
       AND auth_group.tenant_id = current_member.tenant_id
       AND auth_group.plane_code = current_member.plane_code
      LEFT JOIN master.auth_current_plane_membership_v membership
        ON membership.tenant_id = current_member.tenant_id
       AND membership.plane_code = current_member.plane_code
       AND membership.principal_id = current_member.principal_id
      WHERE member.id IS NULL
         OR member.status <> 'active'
         OR member.effective_from > now()
         OR member.effective_until <= now()
         OR auth_group.status <> 'active'
         OR membership.id IS NULL
    `],
    ["neon_current_group_role_inconsistent_or_empty_scope", `
      SELECT count(*)::int
      FROM master.auth_current_group_role_v current_role
      LEFT JOIN master.auth_group_role_v2 assignment
        ON assignment.id = current_role.id
       AND assignment.tenant_id = current_role.tenant_id
       AND assignment.plane_code = current_role.plane_code
      LEFT JOIN master.auth_scope_target scope_target
        ON scope_target.id = current_role.scope_target_id
       AND scope_target.tenant_id = current_role.tenant_id
       AND scope_target.plane_code = current_role.plane_code
      WHERE assignment.id IS NULL
         OR assignment.status <> 'active'
         OR assignment.effective_from > now()
         OR assignment.effective_until <= now()
         OR current_role.scope_target_id IS NULL
         OR scope_target.status <> 'active'
    `],
    ["neon_scope_mapping_anomaly_or_empty_scope", `
      SELECT count(*)::int
      FROM control.authorization_v3_scope_mapping
      WHERE status = 'anomaly'
         OR disposition = 'anomaly'
         OR anomaly_code IS NOT NULL
         OR (
           disposition IN ('scoped_group_role', 'explicit_override')
           AND target_scope_id IS NULL
         )
    `],
    ["neon_unvalidated_registered_constraint", `
      SELECT count(*)::int
      FROM control.authorization_v2_deferred_constraint_registry
      WHERE validation_status <> 'validated'
    `],
    ["neon_unexpected_unvalidated_target_constraint", `
      SELECT count(*)::int
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE NOT constraint_row.convalidated
        AND namespace.nspname IN ('control', 'master')
        AND (
          relation.relname LIKE 'auth\\_%' ESCAPE '\\'
          OR relation.relname LIKE 'authorization\\_v3\\_%' ESCAPE '\\'
          OR relation.relname = 'entity_operation'
        )
    `],
    ["neon_required_final_authority_column_nullable_or_missing", `
      WITH required(table_schema, table_name, column_name) AS (
        VALUES
          ('control', 'entity_operation', 'operation_code_v2'),
          ('control', 'entity_operation', 'permission_id_v2'),
          ('master', 'auth_plane_membership', 'tenant_id'),
          ('master', 'auth_plane_membership', 'plane_code'),
          ('master', 'auth_plane_membership', 'principal_id'),
          ('master', 'auth_group_member_v2', 'group_id'),
          ('master', 'auth_group_member_v2', 'principal_id'),
          ('master', 'auth_group_role_v2', 'group_id'),
          ('master', 'auth_group_role_v2', 'role_id'),
          ('master', 'auth_group_role_v2', 'scope_target_id'),
          ('master', 'auth_role_permission', 'permission_id')
      )
      SELECT count(*)::int
      FROM required
      LEFT JOIN information_schema.columns column_row
        USING (table_schema, table_name, column_name)
      WHERE column_row.column_name IS NULL
         OR column_row.is_nullable <> 'NO'
    `],
  ]);
}

async function verifyMesh(
  sql: ReturnType<typeof postgres>,
): Promise<Check[]> {
  return checks(sql, [
    ["mesh_active_principal_without_deliberate_mapping", `
      SELECT count(*)::int
      FROM mesh.principal principal
      WHERE principal.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM mesh_control.authorization_v3_subject_mapping mapping
          WHERE mapping.principal_id = principal.id
            AND mapping.plane_code = 'mesh'
            AND mapping.status IN ('validated', 'applied')
            AND mapping.disposition IN (
              'mapped', 'quarantined_zero_grant', 'excluded_non_human'
            )
        )
    `],
    ["mesh_active_account_grant_without_mapping", `
      SELECT count(*)::int
      FROM mesh.account_grant legacy_grant
      WHERE legacy_grant.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM mesh_control.authorization_v3_subject_mapping mapping
          WHERE mapping.account_id = legacy_grant.account_id
            AND mapping.principal_id = legacy_grant.principal_id
            AND mapping.plane_code = 'mesh'
            AND mapping.status IN ('validated', 'applied')
            AND mapping.disposition = 'mapped'
        )
    `],
    ["mesh_subject_mapping_anomaly", `
      SELECT count(*)::int
      FROM mesh_control.authorization_v3_subject_mapping
      WHERE status = 'anomaly'
         OR anomaly_code IS NOT NULL
    `],
    ["mesh_subject_mapping_target_mismatch", `
      SELECT count(*)::int
      FROM mesh_control.authorization_v3_subject_mapping mapping
      WHERE mapping.status IN ('validated', 'applied')
        AND mapping.disposition IN ('mapped', 'quarantined_zero_grant')
        AND (
          NOT EXISTS (
            SELECT 1
            FROM mesh.auth_plane_membership membership
            WHERE membership.account_id = mapping.account_id
              AND membership.plane_code = mapping.plane_code
              AND membership.principal_id = mapping.principal_id
              AND membership.id = mapping.target_membership_id
          )
          OR EXISTS (
            SELECT 1
            FROM unnest(mapping.target_group_ids) group_id
            LEFT JOIN mesh.auth_group_v2 auth_group
              ON auth_group.account_id = mapping.account_id
             AND auth_group.plane_code = mapping.plane_code
             AND auth_group.id = group_id
            WHERE auth_group.id IS NULL
          )
        )
    `],
    ["mesh_quarantine_group_has_grant", `
      SELECT count(*)::int
      FROM mesh_control.authorization_v3_subject_mapping mapping
      CROSS JOIN LATERAL unnest(mapping.target_group_ids) group_id
      JOIN mesh.auth_current_group_role_v role_grant
        ON role_grant.account_id = mapping.account_id
       AND role_grant.plane_code = mapping.plane_code
       AND role_grant.group_id = group_id
      WHERE mapping.disposition = 'quarantined_zero_grant'
        AND mapping.status IN ('validated', 'applied')
    `],
    ["mesh_current_group_member_inconsistent", `
      SELECT count(*)::int
      FROM mesh.auth_current_group_member_v current_member
      LEFT JOIN mesh.auth_group_member_v2 member
        ON member.id = current_member.id
       AND member.account_id = current_member.account_id
       AND member.plane_code = current_member.plane_code
      LEFT JOIN mesh.auth_group_v2 auth_group
        ON auth_group.id = current_member.group_id
       AND auth_group.account_id = current_member.account_id
       AND auth_group.plane_code = current_member.plane_code
      LEFT JOIN mesh.auth_current_plane_membership_v membership
        ON membership.account_id = current_member.account_id
       AND membership.plane_code = current_member.plane_code
       AND membership.principal_id = current_member.principal_id
      WHERE member.id IS NULL
         OR member.status <> 'active'
         OR member.effective_from > now()
         OR member.effective_until <= now()
         OR auth_group.status <> 'active'
         OR membership.id IS NULL
    `],
    ["mesh_current_group_role_inconsistent_or_empty_scope", `
      SELECT count(*)::int
      FROM mesh.auth_current_group_role_v current_role
      LEFT JOIN mesh.auth_group_role_v2 assignment
        ON assignment.id = current_role.id
       AND assignment.account_id = current_role.account_id
       AND assignment.plane_code = current_role.plane_code
      LEFT JOIN mesh.auth_scope_target scope_target
        ON scope_target.id = current_role.scope_target_id
       AND scope_target.account_id = current_role.account_id
       AND scope_target.plane_code = current_role.plane_code
      WHERE assignment.id IS NULL
         OR assignment.status <> 'active'
         OR assignment.effective_from > now()
         OR assignment.effective_until <= now()
         OR current_role.scope_target_id IS NULL
         OR scope_target.status <> 'active'
    `],
    ["mesh_scope_mapping_anomaly_or_empty_scope", `
      SELECT count(*)::int
      FROM mesh_control.authorization_v3_scope_mapping
      WHERE status = 'anomaly'
         OR disposition = 'anomaly'
         OR anomaly_code IS NOT NULL
         OR legacy_scope_kind IS NULL
         OR legacy_scope_ref_id IS NULL
         OR (
           disposition IN ('scoped_group_role', 'explicit_override')
           AND target_scope_id IS NULL
         )
    `],
    ["mesh_permission_without_local_account_proof_graph", `
      SELECT count(*)::int
      FROM mesh_control.auth_permission permission
      WHERE permission.status = 'published'
        AND NOT EXISTS (
          SELECT 1
          FROM mesh.auth_published_role_permission_v role_permission
          JOIN mesh.auth_current_group_role_v group_role
            ON group_role.account_id = role_permission.account_id
           AND group_role.plane_code = role_permission.plane_code
           AND group_role.role_id = role_permission.role_id
          JOIN mesh.auth_current_group_member_v group_member
            ON group_member.account_id = group_role.account_id
           AND group_member.plane_code = group_role.plane_code
           AND group_member.group_id = group_role.group_id
          JOIN mesh.auth_current_plane_membership_v membership
            ON membership.account_id = group_member.account_id
           AND membership.plane_code = group_member.plane_code
           AND membership.principal_id = group_member.principal_id
          WHERE role_permission.permission_id = permission.id
            AND (
              permission.account_id IS NULL
              OR permission.account_id = role_permission.account_id
            )
        )
    `],
    ["mesh_unvalidated_registered_constraint", `
      SELECT count(*)::int
      FROM mesh_control.authorization_v2_deferred_constraint_registry
      WHERE validation_status <> 'validated'
    `],
    ["mesh_unexpected_unvalidated_target_constraint", `
      SELECT count(*)::int
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE NOT constraint_row.convalidated
        AND namespace.nspname IN ('mesh_control', 'mesh')
        AND (
          relation.relname LIKE 'auth\\_%' ESCAPE '\\'
          OR relation.relname LIKE 'authorization\\_v3\\_%' ESCAPE '\\'
          OR relation.relname = 'entity_operation'
        )
    `],
    ["mesh_required_final_authority_column_nullable_or_missing", `
      WITH required(table_schema, table_name, column_name) AS (
        VALUES
          ('mesh_control', 'entity_operation', 'operation_code'),
          ('mesh_control', 'entity_operation', 'permission_id'),
          ('mesh', 'auth_plane_membership', 'account_id'),
          ('mesh', 'auth_plane_membership', 'plane_code'),
          ('mesh', 'auth_plane_membership', 'principal_id'),
          ('mesh', 'auth_group_member_v2', 'group_id'),
          ('mesh', 'auth_group_member_v2', 'principal_id'),
          ('mesh', 'auth_group_role_v2', 'group_id'),
          ('mesh', 'auth_group_role_v2', 'role_id'),
          ('mesh', 'auth_group_role_v2', 'scope_target_id'),
          ('mesh', 'auth_role_permission', 'permission_id')
      )
      SELECT count(*)::int
      FROM required
      LEFT JOIN information_schema.columns column_row
        USING (table_schema, table_name, column_name)
      WHERE column_row.column_name IS NULL
         OR column_row.is_nullable <> 'NO'
    `],
  ]);
}

const neon = postgres(neonUrl, { onnotice: () => undefined });
const mesh = postgres(meshUrl, { onnotice: () => undefined });
try {
  const results = [
    ...await verifyNeon(neon),
    ...await verifyMesh(mesh),
  ];
  for (const result of results) {
    process.stdout.write(
      `${result.count === 0 ? "PASS" : "FAIL"} `
        + `${result.name}=${result.count}\n`,
    );
  }
  if (results.some((result) => result.count !== 0)) process.exitCode = 1;
} finally {
  await Promise.all([neon.end(), mesh.end()]);
}
