#!/usr/bin/env tsx
/**
 * Post-backfill Wave 2 live database gate.
 *
 * This script is intentionally not part of the static CI gate: it requires the
 * two explicitly named database URLs and is run after the generated catalog
 * migration has populated exact references.
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

async function verifyNeon(
  sql: ReturnType<typeof postgres>,
): Promise<Check[]> {
  return [
    {
      name: "neon_operation_without_exact_permission",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_operation eo
        WHERE eo.v2_publication_status IN ('draft', 'published')
          AND (
            eo.entity_id_v2 IS NULL
            OR eo.operation_code_v2 IS NULL
            OR eo.permission_id_v2 IS NULL
          )
      `),
    },
    {
      name: "neon_operation_permission_mismatch",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_operation eo
        LEFT JOIN control.auth_permission p
          ON p.id = eo.permission_id_v2
         AND p.catalog_owner_id = eo.catalog_owner_id_v2
         AND p.entity_id = eo.entity_id_v2
         AND p.operation_code = eo.operation_code_v2
        WHERE eo.v2_publication_status IN ('draft', 'published')
          AND p.id IS NULL
      `),
    },
    {
      name: "neon_ambiguous_contextual_alias",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM (
          SELECT catalog_owner_id, tenant_id, plane_code, entity_id,
                 operation_code, legacy_code
          FROM control.auth_permission_alias_v2
          WHERE status = 'active'
          GROUP BY catalog_owner_id, tenant_id, plane_code, entity_id,
                   operation_code, legacy_code
          HAVING count(DISTINCT canonical_permission_id) <> 1
        ) anomaly
      `),
    },
    {
      name: "neon_unmapped_operation_reference",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_operation eo
        WHERE eo.v2_publication_status IN ('draft', 'published')
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'entity_operation'
              AND r.source_relation = 'control.entity_operation'
              AND r.source_key ->> 'id' = eo.id::text
              AND r.entity_operation_id = eo.id
              AND r.permission_id = eo.permission_id_v2
          )
      `),
    },
    {
      name: "neon_unmapped_surface_permission",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_surface s
        CROSS JOIN LATERAL unnest(s.required_permissions) permission_code
        WHERE s.is_enabled
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'surface'
              AND r.source_relation = 'control.entity_surface'
              AND r.source_key ->> 'id' = s.id::text
              AND r.metadata ->> 'legacy_permission_code' = permission_code
          )
      `),
    },
    {
      name: "neon_unmapped_action_permission",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_action_rule a
        WHERE a.capability = 'requires_permission'
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'action'
              AND r.source_relation = 'control.entity_action_rule'
              AND r.source_key ->> 'entity_code' = a.entity_code
              AND r.source_key ->> 'status' = a.status
              AND r.source_key ->> 'action_code' = a.action_code
          )
      `),
    },
    {
      name: "neon_unmapped_transition_permission",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.lifecycle_transition t
        WHERE t.is_active
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'transition'
              AND r.source_relation = 'control.lifecycle_transition'
              AND r.source_key ->> 'id' = t.id::text
          )
      `),
    },
    {
      name: "neon_unmapped_flow_field_override",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_flow_field f
        WHERE f.override_permission IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'flow_field'
              AND r.source_relation = 'control.entity_flow_field'
              AND r.source_key ->> 'id' = f.id::text
          )
      `),
    },
    {
      name: "neon_unmapped_active_flow",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_flow f
        WHERE f.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'flow'
              AND r.source_relation = 'control.entity_flow'
              AND r.source_key ->> 'id' = f.id::text
          )
      `),
    },
    {
      name: "neon_unmapped_flow_step",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_flow_step step
        JOIN control.entity_flow f ON f.id = step.flow_id
        WHERE f.status = 'active'
          AND NOT EXISTS (
            SELECT 1
            FROM control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'flow_step'
              AND r.source_relation = 'control.entity_flow_step'
              AND r.source_key ->> 'id' = step.id::text
          )
      `),
    },
    {
      name: "neon_unmapped_field_security_policy",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.field_security_policy policy
        WHERE NOT EXISTS (
          SELECT 1
          FROM control.auth_catalog_reference_v2 r
          WHERE r.source_kind = 'field_security'
            AND r.source_relation = 'control.field_security_policy'
            AND r.source_key ->> 'id' = policy.id::text
        )
      `),
    },
    {
      name: "neon_unmapped_relation_mutation_permission",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM control.entity_relation relation
        CROSS JOIN LATERAL unnest(relation.mutation_permissions) permission_code
        WHERE NOT EXISTS (
          SELECT 1
          FROM control.auth_catalog_reference_v2 r
          WHERE r.source_kind = 'relation'
            AND r.source_relation = 'control.entity_relation'
            AND r.source_key ->> 'id' = relation.id::text
            AND r.metadata ->> 'legacy_permission_code' = permission_code
        )
      `),
    },
  ];
}

async function verifyMesh(
  sql: ReturnType<typeof postgres>,
): Promise<Check[]> {
  return [
    {
      name: "mesh_operation_permission_mismatch",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM mesh_control.entity_operation eo
        LEFT JOIN mesh_control.auth_permission p
          ON p.id = eo.permission_id
         AND p.catalog_owner_id = eo.catalog_owner_id
         AND p.entity_id = eo.entity_id
         AND p.operation_code = eo.operation_code
        WHERE eo.status IN ('draft', 'published')
          AND p.id IS NULL
      `),
    },
    {
      name: "mesh_unmapped_operation_reference",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM mesh_control.entity_operation eo
        WHERE eo.status IN ('draft', 'published')
          AND NOT EXISTS (
            SELECT 1
            FROM mesh_control.auth_catalog_reference_v2 r
            WHERE r.source_kind = 'entity_operation'
              AND r.source_relation = 'mesh_control.entity_operation'
              AND r.source_key ->> 'id' = eo.id::text
              AND r.entity_operation_id = eo.id
              AND r.permission_id = eo.permission_id
          )
      `),
    },
    {
      name: "mesh_ambiguous_contextual_alias",
      count: await scalar(sql, `
        SELECT count(*)::int
        FROM (
          SELECT catalog_owner_id, account_id, plane_code, entity_id,
                 operation_code, legacy_code
          FROM mesh_control.auth_permission_alias_v2
          WHERE status = 'active'
          GROUP BY catalog_owner_id, account_id, plane_code, entity_id,
                   operation_code, legacy_code
          HAVING count(DISTINCT canonical_permission_id) <> 1
        ) anomaly
      `),
    },
  ];
}

const neon = postgres(neonUrl, { onnotice: () => undefined });
const mesh = postgres(meshUrl, { onnotice: () => undefined });
try {
  const checks = [
    ...await verifyNeon(neon),
    ...await verifyMesh(mesh),
  ];
  for (const check of checks) {
    process.stdout.write(
      `${check.count === 0 ? "PASS" : "FAIL"} ${check.name}=${check.count}\n`,
    );
  }
  if (checks.some((check) => check.count !== 0)) process.exitCode = 1;
} finally {
  await Promise.all([neon.end(), mesh.end()]);
}
