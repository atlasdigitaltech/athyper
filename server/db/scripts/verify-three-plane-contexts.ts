#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { Client } from "pg";

import {
  loadProvisionInputs,
  planeAssignments,
  planeOrder,
  THREE_PLANE_MANIFEST,
} from "./provisioning/three-plane-model.js";

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
      const expected = new Set(assignments.map((item) => `${item.tenantCode}:${item.subject.keycloakSubject}`));
      const actual = await client.query<{ tenantCode: string; subject: string }>(`
        SELECT tenant.code AS "tenantCode",binding.subject_id AS subject
        FROM master.principal_identity_binding binding
        JOIN master.principal principal
          ON principal.tenant_id=binding.tenant_id AND principal.id=binding.principal_id AND principal.status='active'
        JOIN master.tenant tenant ON tenant.id=principal.tenant_id AND tenant.status='active'
        JOIN authz.plane_membership membership
          ON membership.tenant_id=principal.tenant_id AND membership.principal_id=principal.id
         AND membership.status='active' AND membership.effective_from<=now()
         AND (membership.effective_until IS NULL OR membership.effective_until>now())
        WHERE binding.provider_code='keycloak' AND binding.realm_key=$1 AND binding.status='active'
          AND tenant.code=ANY($2::text[])
      `, [inputs.manifest.realmKey, [...tenantCodes]]);
      const actualSet = new Set(actual.rows.map((row) => `${row.tenantCode}:${row.subject}`));
      const missing = [...expected].filter((coordinate) => !actualSet.has(coordinate));
      if (missing.length > 0) throw new Error(`${plane} missing context rows: ${missing.slice(0, 10).join(", ")}`);
      results.push({ plane, expectedContexts: expected.size, verifiedContexts: expected.size });
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
    ATHYPER_NEON_DATABASE_ADMIN_URL: ["DATABASE_ADMIN_URL"],
    ATHYPER_MESH_DATABASE_ADMIN_URL: ["MESH_DATABASE_ADMIN_URL"],
    ATHYPER_PLATFORM_DATABASE_ADMIN_URL: [],
  };
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
