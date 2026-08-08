#!/usr/bin/env tsx
/**
 * Post-backfill Wave 4 live reconciliation gate.
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
async function run(
  sql: ReturnType<typeof postgres>,
  definitions: Array<[string, string]>,
): Promise<Check[]> {
  const output: Check[] = [];
  for (const [name, statement] of definitions) {
    output.push({ name, count: await scalar(sql, statement) });
  }
  return output;
}

async function neonChecks(sql: ReturnType<typeof postgres>): Promise<Check[]> {
  return run(sql, [
    ["neon_unclassified_access_grant", `
      SELECT count(*)::int
      FROM master.access_grant source
      WHERE NOT EXISTS (
        SELECT 1
        FROM control.authorization_v4_access_grant_disposition disposition
        WHERE disposition.tenant_id = source.tenant_id
          AND disposition.source_access_grant_id = source.id
          AND disposition.status IN ('reviewed', 'applied')
      )
    `],
    ["neon_access_grant_diff_or_anomaly", `
      SELECT count(*)::int
      FROM control.authorization_v4_access_grant_disposition
      WHERE status = 'anomaly'
         OR anomaly_code IS NOT NULL
         OR (
           status IN ('reviewed', 'applied')
           AND affected_user_diff_count <> 0
         )
    `],
    ["neon_role_deny_without_reviewed_disposition", `
      SELECT count(*)::int
      FROM master.access_grant source
      WHERE source.effect = 'deny'
        AND source.role_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM control.authorization_v4_role_deny_disposition disposition
          WHERE disposition.tenant_id = source.tenant_id
            AND disposition.source_access_grant_id = source.id
            AND disposition.status = 'reviewed'
            AND disposition.affected_user_diff_count = 0
        )
    `],
    ["neon_unclassified_direct_feature_grant", `
      SELECT (
        (SELECT count(*) FROM master.group_feature_grant source
         WHERE NOT EXISTS (
           SELECT 1
           FROM control.authorization_v4_feature_grant_disposition disposition
           WHERE disposition.tenant_id = source.tenant_id
             AND disposition.source_kind = 'group_feature_grant'
             AND disposition.source_row_id = source.id
             AND disposition.status = 'reviewed'
         ))
        +
        (SELECT count(*) FROM master.principal_feature_grant source
         WHERE NOT EXISTS (
           SELECT 1
           FROM control.authorization_v4_feature_grant_disposition disposition
           WHERE disposition.tenant_id = source.tenant_id
             AND disposition.source_kind = 'principal_feature_grant'
             AND disposition.source_row_id = source.id
             AND disposition.status = 'reviewed'
         ))
      )::int AS count
    `],
    ["neon_direct_feature_grant_diff_or_anomaly", `
      SELECT count(*)::int
      FROM control.authorization_v4_feature_grant_disposition
      WHERE status = 'anomaly'
         OR (
           status = 'reviewed'
           AND affected_user_diff_count <> 0
         )
    `],
    ["neon_active_deny_without_exact_subject_binding", `
      SELECT count(*)::int
      FROM master.auth_deny_rule deny
      WHERE deny.status = 'active'
        AND (
          (deny.subject_kind = 'principal')::int
            * (SELECT count(*) FROM master.auth_deny_rule_principal child
               WHERE child.tenant_id = deny.tenant_id
                 AND child.plane_code = deny.plane_code
                 AND child.deny_rule_id = deny.id)
          +
          (deny.subject_kind = 'group')::int
            * (SELECT count(*) FROM master.auth_deny_rule_group child
               WHERE child.tenant_id = deny.tenant_id
                 AND child.plane_code = deny.plane_code
                 AND child.deny_rule_id = deny.id)
          +
          (deny.subject_kind = 'hard_policy')::int
            * (SELECT count(*) FROM master.auth_deny_rule_hard_policy child
               WHERE child.tenant_id = deny.tenant_id
                 AND child.plane_code = deny.plane_code
                 AND child.deny_rule_id = deny.id)
        ) <> 1
    `],
    ["neon_missing_active_admin_platform_policy", `
      SELECT CASE WHEN EXISTS (
        SELECT 1
        FROM control.auth_admin_entitlement_policy
        WHERE plane_code = 'admin'
          AND policy_code = 'platform_managed'
          AND contract_version = 'wave4.canonical-evaluator.v1'
          AND status = 'active'
          AND effective_from <= now()
          AND (effective_until IS NULL OR effective_until > now())
      ) THEN 0 ELSE 1 END::int AS count
    `],
    ["neon_unexpected_unvalidated_wave4_constraint", `
      SELECT count(*)::int
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE NOT constraint_row.convalidated
        AND namespace.nspname IN ('control', 'master')
        AND (
          relation.relname LIKE 'authorization_v4_%'
          OR relation.relname LIKE 'auth_%entitlement%'
        )
    `],
  ]);
}

async function meshChecks(sql: ReturnType<typeof postgres>): Promise<Check[]> {
  return run(sql, [
    ["mesh_legacy_exception_without_reviewed_disposition", `
      SELECT (
        (
          SELECT count(*)
          FROM mesh.account_grant source
          WHERE NOT EXISTS (
            SELECT 1
            FROM mesh_control.authorization_v4_legacy_exception_disposition
              disposition
            WHERE disposition.account_id = source.account_id
              AND disposition.source_relation = 'mesh.account_grant'
              AND disposition.source_row_id = source.id
              AND disposition.status IN ('reviewed', 'applied')
          )
        )
        +
        (
          SELECT count(*)
          FROM mesh.attachment_acl source
          JOIN mesh.network_account account
            ON account.account_code = source.account_code
          WHERE NOT EXISTS (
            SELECT 1
            FROM mesh_control.authorization_v4_legacy_exception_disposition
              disposition
            WHERE disposition.account_id = account.id
              AND disposition.source_relation = 'mesh.attachment_acl'
              AND disposition.source_row_id = source.id
              AND disposition.status IN ('reviewed', 'applied')
          )
        )
        +
        (
          SELECT count(*)
          FROM mesh.content_item_access_grant source
          JOIN mesh.network_account account
            ON account.account_code = source.account_code
          WHERE NOT EXISTS (
            SELECT 1
            FROM mesh_control.authorization_v4_legacy_exception_disposition
              disposition
            WHERE disposition.account_id = account.id
              AND disposition.source_relation =
                'mesh.content_item_access_grant'
              AND disposition.source_row_id = source.id
              AND disposition.status IN ('reviewed', 'applied')
          )
        )
        +
        (
          SELECT count(*)
          FROM mesh.conversation_participant source
          JOIN mesh.network_account account
            ON account.account_code = source.participant_account_code
          WHERE NOT EXISTS (
            SELECT 1
            FROM mesh_control.authorization_v4_legacy_exception_disposition
              disposition
            WHERE disposition.account_id = account.id
              AND disposition.source_relation =
                'mesh.conversation_participant'
              AND disposition.source_row_id = source.id
              AND disposition.status IN ('reviewed', 'applied')
          )
        )
      )::int AS count
    `],
    ["mesh_exception_diff_or_anomaly", `
      SELECT count(*)::int
      FROM mesh_control.authorization_v4_legacy_exception_disposition
      WHERE status = 'anomaly'
         OR anomaly_code IS NOT NULL
         OR (
           status IN ('reviewed', 'applied')
           AND affected_user_diff_count <> 0
         )
    `],
    ["mesh_published_permission_without_product_binding", `
      SELECT count(*)::int
      FROM mesh_control.auth_permission permission
      WHERE permission.status = 'published'
        AND permission.product_code IS NULL
    `],
    ["mesh_active_account_without_any_entitlement", `
      SELECT count(*)::int
      FROM mesh.network_account account
      WHERE account.status = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM mesh.account_entitlement entitlement
          WHERE entitlement.account_id = account.id
            AND entitlement.status = 'active'
            AND entitlement.effective_from <= now()
            AND (
              entitlement.effective_until IS NULL
              OR entitlement.effective_until > now()
            )
        )
    `],
    ["mesh_active_deny_without_exact_subject_binding", `
      SELECT count(*)::int
      FROM mesh.auth_deny_rule deny
      WHERE deny.status = 'active'
        AND (
          (deny.subject_kind = 'principal')::int
            * (SELECT count(*) FROM mesh.auth_deny_rule_principal child
               WHERE child.account_id = deny.account_id
                 AND child.plane_code = deny.plane_code
                 AND child.deny_rule_id = deny.id)
          +
          (deny.subject_kind = 'group')::int
            * (SELECT count(*) FROM mesh.auth_deny_rule_group child
               WHERE child.account_id = deny.account_id
                 AND child.plane_code = deny.plane_code
                 AND child.deny_rule_id = deny.id)
          +
          (deny.subject_kind = 'hard_policy')::int
            * (SELECT count(*) FROM mesh.auth_deny_rule_hard_policy child
               WHERE child.account_id = deny.account_id
                 AND child.plane_code = deny.plane_code
                 AND child.deny_rule_id = deny.id)
        ) <> 1
    `],
    ["mesh_unexpected_unvalidated_wave4_constraint", `
      SELECT count(*)::int
      FROM pg_constraint constraint_row
      JOIN pg_class relation ON relation.oid = constraint_row.conrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE NOT constraint_row.convalidated
        AND namespace.nspname IN ('mesh_control', 'mesh')
        AND (
          relation.relname LIKE 'authorization_v4_%'
          OR relation.relname LIKE '%entitlement%'
        )
    `],
  ]);
}

const neon = postgres(neonUrl, { onnotice: () => undefined });
const mesh = postgres(meshUrl, { onnotice: () => undefined });
try {
  const results = [
    ...await neonChecks(neon),
    ...await meshChecks(mesh),
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
