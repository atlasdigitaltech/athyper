#!/usr/bin/env tsx
import { readFile } from "node:fs/promises";

import pg from "pg";
import { z } from "zod";

const postgresUuid = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Expected PostgreSQL UUID syntax.",
);

const manifestSchema = z.object({
  tenantId: postgresUuid,
  actorPrincipalId: postgresUuid,
  assignments: z.record(z.string(), z.array(postgresUuid)),
}).strict();

interface SourceTenant {
  id: string;
  code: string;
  name: string;
  display_name: string;
  realm_key: string;
  status: string;
}

interface SourcePrincipal {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  principal_type: string;
  status: string;
  binding_id: string;
  realm_key: string;
  provider_code: string;
  subject_id: string;
  username: string | null;
  issuer: string | null;
  audience: string | null;
  service_client_id: string | null;
  synced_at: Date | string | null;
  sync_status: string;
}

function option(name: string): string | undefined {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

async function databaseName(client: pg.Client): Promise<string> {
  return (await client.query<{ name: string }>("SELECT current_database() AS name")).rows[0]!.name;
}

async function main(): Promise<void> {
  const manifestPath = option("--manifest");
  const expectedSource = option("--expected-source-database");
  const expectedTarget = option("--expected-target-database");
  const sourceUrl = process.env["META_ENTITY_IDENTITY_SOURCE_DATABASE_URL"];
  const targetUrl = process.env["META_ENTITY_AUTHORITY_DATABASE_URL"];
  if (!manifestPath || !expectedSource || !expectedTarget || !sourceUrl || !targetUrl) {
    throw new Error(
      "--manifest, --expected-source-database, --expected-target-database, "
      + "META_ENTITY_IDENTITY_SOURCE_DATABASE_URL, and META_ENTITY_AUTHORITY_DATABASE_URL are required.",
    );
  }
  const manifest = manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
  const principalIds = [...new Set(Object.values(manifest.assignments).flat())].sort();
  if (principalIds.length < 3) throw new Error("At least three real Admin principals are required.");

  const source = new pg.Client({ connectionString: sourceUrl, application_name: "meta-entity-identity-source" });
  const target = new pg.Client({ connectionString: targetUrl, application_name: "meta-entity-identity-projection" });
  await source.connect();
  await target.connect();
  try {
    if (await databaseName(source) !== expectedSource || await databaseName(target) !== expectedTarget) {
      throw new Error("Meta Entity identity projection database guard rejected the configured source or target.");
    }
    const tenant = (await source.query<SourceTenant>(`
      SELECT id,code,name,display_name,realm_key,status
        FROM master.tenant WHERE id=$1::uuid AND status='active'
    `, [manifest.tenantId])).rows[0];
    if (!tenant) throw new Error("The selected source tenant is not active.");

    const principals = (await source.query<SourcePrincipal>(`
      SELECT p.id,p.tenant_id,p.code,p.name,p.principal_type,p.status,
             b.id AS binding_id,b.realm_key,b.provider_code,b.subject_id,
             b.username,b.issuer,b.audience,b.service_client_id,b.synced_at,b.sync_status
        FROM master.principal p
        JOIN master.principal_identity_binding b
          ON b.tenant_id=p.tenant_id AND b.principal_id=p.id
       WHERE p.tenant_id=$1::uuid AND p.id=ANY($2::uuid[])
         AND p.status='active' AND b.idp_enabled AND b.sync_status='synced'
       ORDER BY p.id
    `, [manifest.tenantId, principalIds])).rows;
    if (principals.length !== principalIds.length) {
      throw new Error("Every selected Admin principal must have one active synced Keycloak binding.");
    }
    if (new Set(principals.map((row) => row.id)).size !== principals.length) {
      throw new Error("A selected Admin principal resolves to multiple active bindings.");
    }

    if (process.argv.includes("--dry-run")) {
      process.stdout.write(JSON.stringify({
        sourceDatabase: expectedSource,
        targetDatabase: expectedTarget,
        tenantId: tenant.id,
        principals: principals.map((row) => ({ id: row.id, code: row.code, provider: row.provider_code })),
        credentialsCopied: false,
      }, null, 2) + "\n");
      return;
    }

    await target.query("BEGIN");
    await target.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", ["athyper:meta-entity:admin-identity-projection"]);
    await target.query("SELECT set_config('app.database_plane','athyper',true)");
    await target.query("SELECT set_config('app.current_principal_id',$1,true)", ["00000000-0000-0000-0000-000000000000"]);
    await target.query("SET LOCAL session_replication_role=replica");
    await target.query(`
      INSERT INTO master.tenant (id,code,name,display_name,realm_key,status,created_by)
      VALUES ('00000000-0000-0000-0000-000000000000','system','System Tenant','System','athyper','active',
              '00000000-0000-0000-0000-000000000000')
      ON CONFLICT (id) DO NOTHING
    `);
    await target.query(`
      INSERT INTO master.principal (
        id,tenant_id,code,name,principal_type,provisioning_source,status,created_by
      ) VALUES (
        '00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000',
        'system.actor','System Actor','service_account','internal','active',
        '00000000-0000-0000-0000-000000000000'
      ) ON CONFLICT (id) DO NOTHING
    `);
    await target.query("SET LOCAL session_replication_role=origin");

    await target.query(`
      INSERT INTO master.tenant (id,code,name,display_name,realm_key,metadata,status,created_by)
      VALUES ($1::uuid,$2,$3,$4,$5,'{"projection_source":"athyper_neon"}'::jsonb,$6,
              '00000000-0000-0000-0000-000000000000')
      ON CONFLICT (id) DO NOTHING
    `, [tenant.id, tenant.code, tenant.name, tenant.display_name, tenant.realm_key, tenant.status]);

    for (const row of principals) {
      await target.query(`
        INSERT INTO master.principal (
          id,tenant_id,code,name,principal_type,provisioning_source,metadata,status,created_by
        ) VALUES ($1::uuid,$2::uuid,$3,$4,$5::master.principal_type_d,'sync',
                  '{"projection_source":"athyper_neon"}'::jsonb,$6::master.principal_status_d,
                  '00000000-0000-0000-0000-000000000000')
        ON CONFLICT (id) DO NOTHING
      `, [row.id, row.tenant_id, row.code, row.name, row.principal_type, row.status]);
      await target.query(`
        INSERT INTO master.principal_identity_binding (
          id,tenant_id,principal_id,provider_code,realm_key,subject_id,issuer,audience,
          username,service_client_id,is_primary,status,last_verified_at,synced_at,sync_status,
          metadata,created_by
        ) VALUES (
          $1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,true,'active',coalesce($11,now()),
          coalesce($11,now()),'synced','{"projection_source":"athyper_neon","credentials_copied":false}'::jsonb,
          '00000000-0000-0000-0000-000000000000'
        ) ON CONFLICT (id) DO NOTHING
      `, [row.binding_id, row.tenant_id, row.id, row.provider_code, row.realm_key, row.subject_id,
        row.issuer, row.audience, row.username, row.service_client_id, row.synced_at]);

      const projected = (await target.query<{
        code: string; name: string; principal_type: string; status: string;
        binding_id: string; provider_code: string; realm_key: string; subject_id: string;
        username: string | null; issuer: string | null; audience: string | null;
        service_client_id: string | null; binding_status: string;
      }>(`
        SELECT p.code,p.name,p.principal_type,p.status,b.id AS binding_id,
               b.provider_code,b.realm_key,b.subject_id,b.username,b.issuer,b.audience,
               b.service_client_id,b.status AS binding_status
          FROM master.principal p
          JOIN master.principal_identity_binding b
            ON b.tenant_id=p.tenant_id AND b.principal_id=p.id
         WHERE p.tenant_id=$1::uuid AND p.id=$2::uuid
      `, [row.tenant_id, row.id])).rows[0];
      if (!projected
          || projected.code !== row.code
          || projected.name !== row.name
          || projected.principal_type !== row.principal_type
          || projected.status !== row.status
          || projected.binding_id !== row.binding_id
          || projected.provider_code !== row.provider_code
          || projected.realm_key !== row.realm_key
          || projected.subject_id !== row.subject_id
          || projected.username !== row.username
          || projected.issuer !== row.issuer
          || projected.audience !== row.audience
          || projected.service_client_id !== row.service_client_id
          || projected.binding_status !== "active") {
        throw new Error(`Identity projection conflict for ${row.id}.`);
      }
    }

    const catalog = await target.query<{ id: string }>(`
      SELECT id FROM control.module WHERE code='meta' AND status='active'
    `);
    if (catalog.rowCount !== 1) {
      throw new Error("Active control.module META is required before identity projection.");
    }

    const verified = await target.query<{ principal_count: number; binding_count: number }>(`
      SELECT
        (SELECT count(*)::int FROM master.principal WHERE tenant_id=$1::uuid AND id=ANY($2::uuid[])) AS principal_count,
        (SELECT count(*)::int FROM master.principal_identity_binding WHERE tenant_id=$1::uuid AND principal_id=ANY($2::uuid[]) AND status='active') AS binding_count
    `, [tenant.id, principalIds]);
    if (Number(verified.rows[0]?.principal_count) !== principalIds.length
        || Number(verified.rows[0]?.binding_count) !== principalIds.length) {
      throw new Error("Post-projection identity verification failed.");
    }
    await target.query("COMMIT");
    process.stdout.write(`META_ENTITY_ADMIN_IDENTITIES_OK tenant=${tenant.id} principals=${principalIds.length} credentials=0\n`);
  } catch (error) {
    await target.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

await main();
