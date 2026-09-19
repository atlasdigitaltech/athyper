#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  loadProvisionInputs,
  planeAssignments,
  planeOrder,
  THREE_PLANE_MANIFEST,
} from "./three-plane-model.js";

export async function verifyThreePlaneContexts(manifestPath = THREE_PLANE_MANIFEST): Promise<unknown> {
  const inputs = await loadProvisionInputs(manifestPath);
  const tenantCodes = new Set(inputs.manifest.tenants.map((tenant) => tenant.code));
  const results = [];
  for (const plane of planeOrder()) {
    const url = databaseUrl(inputs.manifest.planes[plane].databaseUrlEnvironment);
    const client = new Client({ connectionString: url });
    await client.connect();
    try {
      const identity = await client.query<{ database: string; plane: string }>(`
        SELECT current_database() AS database,current_setting('app.database_plane',true) AS plane
      `);
      if (
        identity.rows[0]?.database !== inputs.manifest.planes[plane].databaseName
        || identity.rows[0]?.plane !== plane
      ) throw new Error(`${plane} context verification target mismatch`);
      const assignments = planeAssignments(inputs.authorizationPacks[plane], plane, tenantCodes);
      const activeProjections = await client.query<{ tenantId: string; organizationId: string }>(`
        SELECT tenant_id::text AS "tenantId",external_organization_id AS "organizationId"
          FROM authz.fn_resolve_active_application_projections($1,$2::text[],'keycloak')
         ORDER BY tenant_id
      `, [inputs.manifest.realmKey, inputs.manifest.tenants.map((tenant) => tenant.keycloakOrganizationAlias)]);
      const expectedProjections = new Set(inputs.manifest.tenants.map((tenant) =>
        `${tenant.id}:${tenant.keycloakOrganizationAlias}`));
      const actualProjections = new Set(activeProjections.rows.map((row) =>
        `${row.tenantId}:${row.organizationId}`));
      const missingProjections = [...expectedProjections].filter((coordinate) => !actualProjections.has(coordinate));
      const unexpectedProjections = [...actualProjections].filter((coordinate) => !expectedProjections.has(coordinate));
      if (missingProjections.length > 0 || unexpectedProjections.length > 0) {
        throw new Error(`${plane} application projection mismatch: missing=${missingProjections.join(",")}; unexpected=${unexpectedProjections.join(",")}`);
      }
      const expected = new Set(assignments.map((item) => `${item.tenantCode}:${item.subject.username.toLowerCase()}`));
      const actualSet = new Set<string>();
      for (const assignment of assignments) {
        const tenant = inputs.manifest.tenants.find((item) => item.code === assignment.tenantCode)!;
        await client.query("SELECT set_config('app.current_tenant_id',$1,false)", [tenant.id]);
        const actual = await client.query<{ tenantCode: string; username: string }>(`
          SELECT $1::text AS "tenantCode",lower(binding.username) AS username
          FROM master.principal_identity_binding binding
          JOIN authz.plane_membership membership
            ON membership.tenant_id=binding.tenant_id AND membership.principal_id=binding.principal_id
           AND membership.status='active' AND membership.effective_from<=now()
           AND (membership.effective_until IS NULL OR membership.effective_until>now())
          WHERE binding.tenant_id=$2::uuid AND binding.provider_code='keycloak'
            AND binding.realm_key=$3 AND binding.status='active'
            AND lower(binding.username)=lower($4)
          LIMIT 1
        `, [assignment.tenantCode, tenant.id, inputs.manifest.realmKey, assignment.subject.username]);
        if (actual.rows[0]) actualSet.add(`${actual.rows[0].tenantCode}:${actual.rows[0].username}`);
      }
      const missing = [...expected].filter((coordinate) => !actualSet.has(coordinate));
      if (missing.length > 0) throw new Error(`${plane} missing context rows: ${missing.slice(0, 10).join(", ")}`);
      results.push({
        plane,
        expectedContexts: expected.size,
        verifiedContexts: expected.size,
        verifiedApplicationProjections: actualProjections.size,
      });
    } finally {
      await client.end();
    }
  }
  return {
    contractVersion: "athyper.three-plane-context-verification.v1",
    manifestSha256: inputs.manifestSha256,
    results,
  };
}

function databaseUrl(primary: string): string {
  const fallbacks: Readonly<Record<string, readonly string[]>> = {
    ATHYPER_NEON_DATABASE_ADMIN_URL: ["ATHYPER_NEON_DATABASE_URL", "DATABASE_URL", "DATABASE_ADMIN_URL"],
    ATHYPER_MESH_DATABASE_ADMIN_URL: ["ATHYPER_MESH_DATABASE_URL", "MESH_DATABASE_URL", "MESH_DATABASE_ADMIN_URL"],
    ATHYPER_PLATFORM_DATABASE_ADMIN_URL: ["ATHYPER_PLATFORM_DATABASE_URL"],
  };
  // Context inventory is an administrative completeness check and must not
  // weaken principal self-read RLS merely so a runtime session can enumerate
  // every identity. Runtime tenant isolation is proved independently by the
  // three-plane authorization RLS verifier.
  for (const name of [primary, ...(fallbacks[primary] ?? [])]) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`context verification requires ${primary}`);
}

function option(args: readonly string[], name: string): string | undefined {
  return args.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

async function main(): Promise<void> {
  const result = await verifyThreePlaneContexts(option(process.argv.slice(2), "--manifest"));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
