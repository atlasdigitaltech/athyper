#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";

import pg from "pg";
import { z } from "zod";

const roleCodes = [
  "meta_entity_reader",
  "meta_entity_designer",
  "meta_entity_reviewer",
  "meta_entity_publisher",
  "meta_entity_recovery_operator",
  "meta_entity_retirement_custodian",
] as const;

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Expected PostgreSQL UUID syntax.",
);

const manifestSchema = z.object({
  tenantId: postgresUuid,
  actorPrincipalId: postgresUuid,
  assignments: z.object(Object.fromEntries(
    roleCodes.map((roleCode) => [roleCode, z.array(postgresUuid).default([])]),
  ) as Record<(typeof roleCodes)[number], z.ZodDefault<z.ZodArray<z.ZodString>>>),
}).strict();

const rolePermissions: Record<(typeof roleCodes)[number], readonly string[]> = {
  meta_entity_reader: ["metadata.entity.view"],
  meta_entity_designer: ["metadata.entity.view", "metadata.entity.author"],
  meta_entity_reviewer: ["metadata.entity.view", "metadata.entity.review"],
  meta_entity_publisher: ["metadata.entity.view", "metadata.entity.publish"],
  meta_entity_recovery_operator: ["metadata.entity.view", "metadata.entity.rollback"],
  meta_entity_retirement_custodian: ["metadata.entity.view", "metadata.entity.retire"],
};

function option(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const manifestPath = option("--manifest");
  if (!manifestPath) throw new Error("--manifest is required.");
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const assignments = roleCodes.flatMap((roleCode) =>
    manifest.assignments[roleCode].map((principalId) => ({ roleCode, principalId })));
  const designers = new Set(manifest.assignments.meta_entity_designer);
  const reviewers = new Set(manifest.assignments.meta_entity_reviewer);
  const publishers = new Set(manifest.assignments.meta_entity_publisher);
  if (designers.size === 0 || reviewers.size === 0 || publishers.size === 0) {
    throw new Error("Designer, reviewer, and publisher assignments must each name at least one principal.");
  }
  const overlaps = [
    ...[...designers].filter((id) => reviewers.has(id) || publishers.has(id)),
    ...[...reviewers].filter((id) => publishers.has(id)),
  ];
  if (overlaps.length > 0) {
    throw new Error(`Author/reviewer/publisher assignments must be disjoint: ${[...new Set(overlaps)].join(", ")}`);
  }
  if (process.argv.includes("--dry-run")) {
    process.stdout.write(JSON.stringify({
      tenantId: manifest.tenantId,
      roles: roleCodes.length,
      assignments: assignments.length,
      distinctPrincipals: new Set(assignments.map((assignment) => assignment.principalId)).size,
    }, null, 2) + "\n");
    return;
  }

  const connectionString = option("--database-url") ?? process.env["META_ENTITY_AUTHORITY_DATABASE_URL"];
  const expectedDatabase = option("--expected-database");
  if (!connectionString || !expectedDatabase) {
    throw new Error("META_ENTITY_AUTHORITY_DATABASE_URL and --expected-database are required unless --dry-run is used.");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const identity = await client.query<{ database_name: string }>(
      "SELECT current_database() AS database_name",
    );
    if (identity.rows[0]?.database_name !== expectedDatabase) {
      throw new Error(`Database guard rejected ${identity.rows[0]?.database_name ?? "unknown"}; expected ${expectedDatabase}.`);
    }

    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_tenant_id', $1, true)", [manifest.tenantId]);
    await client.query("SELECT set_config('app.current_principal_id', $1, true)", [manifest.actorPrincipalId]);
    await client.query("SELECT set_config('app.database_plane', 'athyper', true)");

    const tenant = await client.query(
      "SELECT 1 FROM master.tenant WHERE id=$1::uuid AND status='active'",
      [manifest.tenantId],
    );
    if (tenant.rowCount !== 1) throw new Error("Configured tenant is not active.");
    const principalIds = [...new Set([manifest.actorPrincipalId, ...assignments.map((item) => item.principalId)])];
    const principals = await client.query<{ id: string }>(
      "SELECT id FROM master.principal WHERE tenant_id=$1::uuid AND id=ANY($2::uuid[]) AND status='active'",
      [manifest.tenantId, principalIds],
    );
    const missing = principalIds.filter((id) => !principals.rows.some((row) => row.id === id));
    if (missing.length > 0) throw new Error(`Inactive or foreign principals: ${missing.join(", ")}`);

    const scopeId = await client.query<{ id: string }>(`
      INSERT INTO authz.scope_target (
        id, tenant_id, scope_kind, scope_key, target_id, display_name,
        status, metadata, created_by
      ) VALUES (
        md5($1::text || ':meta-entity:scope:tenant')::uuid,
        $1::uuid, 'tenant', $1::text, $1::uuid, 'Meta Entity tenant scope',
        'active', '{"seed_owner":"athyper.meta-entity-authority"}'::jsonb, $2::uuid
      )
      ON CONFLICT (tenant_id, scope_kind, scope_key) DO UPDATE
        SET display_name=EXCLUDED.display_name, status='active', updated_by=EXCLUDED.created_by
      RETURNING id
    `, [manifest.tenantId, manifest.actorPrincipalId]);
    const tenantScopeId = scopeId.rows[0]!.id;

    for (const roleCode of roleCodes) {
      const roleIdResult = await client.query<{ id: string; status: string }>(`
        INSERT INTO authz.role (
          id, tenant_id, code, name, description, role_kind, source_type,
          source_ref, metadata, status, created_by
        ) VALUES (
          md5($1::text || ':meta-entity:role:' || $2)::uuid,
          $1::uuid, $2, initcap(replace($2, '_', ' ')),
          'Canonical Meta Entity Studio role', 'system', 'seed',
          'athyper.meta-entity-authority@p2.8-v1',
          '{"seed_owner":"athyper.meta-entity-authority"}'::jsonb, 'draft', $3::uuid
        )
        ON CONFLICT (tenant_id, code) DO NOTHING
        RETURNING id, status
      `, [manifest.tenantId, roleCode, manifest.actorPrincipalId]);
      const existingRole = roleIdResult.rows[0] ?? (await client.query<{ id: string; status: string }>(
        "SELECT id,status FROM authz.role WHERE tenant_id=$1::uuid AND code=$2",
        [manifest.tenantId, roleCode],
      )).rows[0];
      if (!existingRole) throw new Error(`Role ${roleCode} could not be resolved.`);

      if (["draft", "suspended"].includes(existingRole.status)) {
        for (const permissionCode of rolePermissions[roleCode]) {
          const inserted = await client.query(`
            INSERT INTO authz.role_permission (id,tenant_id,role_id,permission_id,created_by)
            SELECT md5($2::text || ':' || permission.id::text)::uuid,
                   $1::uuid,$2::uuid,permission.id,$3::uuid
              FROM authz.permission AS permission
             WHERE permission.canonical_code=$4 AND permission.status='published'
            ON CONFLICT (tenant_id,role_id,permission_id) DO NOTHING
          `, [manifest.tenantId, existingRole.id, manifest.actorPrincipalId, permissionCode]);
          if (inserted.rowCount === 0) {
            const present = await client.query(
              `SELECT 1 FROM authz.role_permission rp JOIN authz.permission p ON p.id=rp.permission_id
                WHERE rp.tenant_id=$1::uuid AND rp.role_id=$2::uuid AND p.canonical_code=$3`,
              [manifest.tenantId, existingRole.id, permissionCode],
            );
            if (present.rowCount !== 1) throw new Error(`Published permission ${permissionCode} is missing.`);
          }
        }
        await client.query(
          "UPDATE authz.role SET status='active',status_changed_by=$3::uuid,updated_by=$3::uuid WHERE tenant_id=$1::uuid AND id=$2::uuid",
          [manifest.tenantId, existingRole.id, manifest.actorPrincipalId],
        );
      }

      const actualPermissions = await client.query<{ canonical_code: string }>(`
        SELECT p.canonical_code FROM authz.role_permission rp
        JOIN authz.permission p ON p.id=rp.permission_id
        WHERE rp.tenant_id=$1::uuid AND rp.role_id=$2::uuid ORDER BY p.canonical_code
      `, [manifest.tenantId, existingRole.id]);
      const actual = actualPermissions.rows.map((row) => row.canonical_code);
      const expected = [...rolePermissions[roleCode]].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Role ${roleCode} permission drift: ${actual.join(", ")}`);
      }

      const groupIdResult = await client.query<{ id: string }>(`
        INSERT INTO authz.principal_group (
          id,tenant_id,code,name,description,group_kind,source_type,source_ref,
          metadata,status,created_by
        ) VALUES (
          md5($1::text || ':meta-entity:group:' || $2)::uuid,$1::uuid,$2,
          initcap(replace($2, '_', ' ')),'Canonical Meta Entity Studio assignment group',
          'system','seed','athyper.meta-entity-authority@p2.8-v1',
          '{"seed_owner":"athyper.meta-entity-authority"}'::jsonb,'active',$3::uuid
        ) ON CONFLICT (tenant_id,code) DO UPDATE
          SET status='active',updated_by=EXCLUDED.created_by
        RETURNING id
      `, [manifest.tenantId, roleCode, manifest.actorPrincipalId]);
      const groupId = groupIdResult.rows[0]!.id;
      await client.query(`
        INSERT INTO authz.group_role (
          id,tenant_id,group_id,role_id,scope_target_id,source_type,source_ref,
          metadata,status,created_by
        ) VALUES (
          md5($1::text || ':' || $2::text || ':' || $3::text)::uuid,
          $1::uuid,$2::uuid,$3::uuid,$4::uuid,'seed','athyper.meta-entity-authority@p2.8-v1',
          '{"seed_owner":"athyper.meta-entity-authority"}'::jsonb,'active',$5::uuid
        ) ON CONFLICT (id) DO NOTHING
      `, [manifest.tenantId, groupId, existingRole.id, tenantScopeId, manifest.actorPrincipalId]);

      const expectedPrincipalIds = manifest.assignments[roleCode];
      await client.query(`
        UPDATE authz.group_member
           SET status='revoked', updated_by=$3::uuid
         WHERE tenant_id=$1::uuid AND group_id=$2::uuid
           AND source_ref='athyper.meta-entity-authority@p2.8-v1'
           AND NOT (principal_id=ANY($4::uuid[]))
           AND status <> 'revoked'
      `, [manifest.tenantId, groupId, manifest.actorPrincipalId, expectedPrincipalIds]);

      for (const principalId of expectedPrincipalIds) {
        await client.query(`
          INSERT INTO authz.plane_membership (
            id,tenant_id,principal_id,membership_kind,source_type,source_ref,
            metadata,status,created_by
          ) SELECT
            md5($1::text || ':meta-entity:membership:' || $2::text)::uuid,
            $1::uuid,$2::uuid,'standard','seed','athyper.meta-entity-authority@p2.8-v1',
            '{"seed_owner":"athyper.meta-entity-authority"}'::jsonb,'active',$3::uuid
          WHERE NOT EXISTS (
            SELECT 1 FROM authz.plane_membership
             WHERE tenant_id=$1::uuid AND principal_id=$2::uuid AND status <> 'revoked'
          ) ON CONFLICT (id) DO NOTHING
        `, [manifest.tenantId, principalId, manifest.actorPrincipalId]);
        await client.query(`
          INSERT INTO authz.group_member (
            id,tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by
          ) SELECT
            md5($1::text || ':' || $2::text || ':' || $3::text)::uuid,
            $1::uuid,$2::uuid,$3::uuid,'seed','athyper.meta-entity-authority@p2.8-v1',
            '{"seed_owner":"athyper.meta-entity-authority"}'::jsonb,'active',$4::uuid
          WHERE NOT EXISTS (
            SELECT 1 FROM authz.group_member
             WHERE tenant_id=$1::uuid AND group_id=$2::uuid AND principal_id=$3::uuid AND status <> 'revoked'
          ) ON CONFLICT (id) DO UPDATE
            SET status='active',updated_by=EXCLUDED.created_by
        `, [manifest.tenantId, groupId, principalId, manifest.actorPrincipalId]);
      }
    }

    await client.query("COMMIT");
    process.stdout.write(`META_ENTITY_AUTHORITY_OK tenant=${manifest.tenantId} assignments=${assignments.length}\n`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

await main();
