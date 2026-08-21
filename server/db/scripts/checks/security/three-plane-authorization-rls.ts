#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { Client } from "pg";

import { loadProvisionInputs, planeOrder, THREE_PLANE_MANIFEST } from "../../provisioning/three-plane-model.js";

const relations = [
  "authz.role",
  "authz.principal_group",
  "authz.plane_membership",
  "authz.scope_target",
  "authz.group_member",
  "authz.group_role",
] as const;

const runtimeEnvironment = {
  studio: "ATHYPER_PLATFORM_DATABASE_URL",
  neon: "ATHYPER_NEON_DATABASE_URL",
  mesh: "ATHYPER_MESH_DATABASE_URL",
} as const;

export async function verifyThreePlaneAuthorizationRls(manifestPath = THREE_PLANE_MANIFEST): Promise<unknown> {
  const inputs = await loadProvisionInputs(manifestPath);
  const results = [];
  for (const plane of planeOrder()) {
    const environmentName = runtimeEnvironment[plane];
    const databaseUrl = process.env[environmentName]?.trim();
    if (!databaseUrl) throw new Error(`${plane} authorization RLS verification requires ${environmentName}`);
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const identity = (await client.query<{ database: string; user: string; superuser: boolean; bypassRls: boolean }>(`
        SELECT current_database() AS database,current_user AS "user",role.rolsuper AS superuser,
               role.rolbypassrls AS "bypassRls"
        FROM pg_roles role WHERE role.rolname=current_user
      `)).rows[0];
      if (!identity || identity.database !== inputs.manifest.planes[plane].databaseName) {
        throw new Error(`${plane} RLS target database mismatch`);
      }
      if (identity.superuser || identity.bypassRls || identity.user === "athyperadmin") {
        throw new Error(`${plane} RLS verification requires a non-admin NOBYPASSRLS login`);
      }

      await client.query("SELECT set_config('app.current_tenant_id','',false)");
      for (const relation of relations) {
        const withoutContext = await count(client, relation);
        if (withoutContext.visible !== 0) throw new Error(`${plane}/${relation} exposes ${withoutContext.visible} row(s) without tenant context`);
      }

      const tenantResults = [];
      for (const tenant of inputs.manifest.tenants) {
        await client.query("SELECT set_config('app.current_tenant_id',$1,false)", [tenant.id]);
        const relationResults = [];
        for (const relation of relations) {
          const result = await count(client, relation, tenant.id);
          if (result.visible === 0) throw new Error(`${plane}/${relation} exposes no seeded row for ${tenant.code}`);
          if (result.crossTenant !== 0) throw new Error(`${plane}/${relation} leaked ${result.crossTenant} cross-tenant row(s) for ${tenant.code}`);
          relationResults.push({ relation, visible: result.visible, crossTenant: result.crossTenant });
        }
        tenantResults.push({ tenant: tenant.code, relations: relationResults });
      }
      results.push({ plane, runtimeUser: identity.user, tenantResults });
    } finally {
      await client.end();
    }
  }
  return { contractVersion: "athyper.authorization.three-plane-rls-verification.v1", results };
}

async function count(client: Client, relation: string, tenantId?: string): Promise<{ visible: number; crossTenant: number }> {
  const result = await client.query<{ visible: string; crossTenant: string }>(`
    SELECT count(*)::text AS visible,
           count(*) FILTER (WHERE tenant_id IS DISTINCT FROM $1::uuid)::text AS "crossTenant"
    FROM ${relation}
  `, [tenantId ?? null]);
  return { visible: Number(result.rows[0]?.visible ?? 0), crossTenant: Number(result.rows[0]?.crossTenant ?? 0) };
}

async function main(): Promise<void> {
  process.stdout.write(`${JSON.stringify(await verifyThreePlaneAuthorizationRls(), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
