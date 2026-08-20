#!/usr/bin/env tsx

import { pathToFileURL } from "node:url";
import { Client } from "pg";

type Plane = "studio" | "neon" | "mesh";

const DATABASES: Record<Plane, { name: string; environment: string; fallbacks: readonly string[] }> = {
  studio: { name: "athyper_studio", environment: "ATHYPER_PLATFORM_DATABASE_ADMIN_URL", fallbacks: [] },
  neon: { name: "athyper_neon", environment: "ATHYPER_NEON_DATABASE_ADMIN_URL", fallbacks: ["DATABASE_ADMIN_URL"] },
  mesh: { name: "athyper_mesh", environment: "ATHYPER_MESH_DATABASE_ADMIN_URL", fallbacks: ["MESH_DATABASE_ADMIN_URL"] },
};

export async function repairProjectionOwnerReadGrants(plane: Plane): Promise<unknown> {
  const target = DATABASES[plane];
  const databaseUrl = [target.environment, ...target.fallbacks]
    .map((name) => process.env[name]?.trim())
    .find(Boolean);
  if (!databaseUrl) throw new Error(`${target.environment} is required`);
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    const identity = await client.query<{ database: string; plane: string | null }>(
      "SELECT current_database() AS database,current_setting('app.database_plane',true) AS plane",
    );
    if (identity.rows[0]?.database !== target.name || identity.rows[0]?.plane !== plane) {
      throw new Error(`refusing projection ACL repair outside ${target.name}/${plane}`);
    }
    const role = await client.query<{ exists: boolean }>(
      "SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyper_projection_owner') AS exists",
    );
    if (role.rows[0]?.exists !== true) throw new Error("athyper_projection_owner is missing");
    await client.query("GRANT USAGE ON SCHEMA master TO athyper_projection_owner");
    await client.query("GRANT SELECT ON master.tenant,authz.scope_target TO athyper_projection_owner");
    await client.query("GRANT USAGE ON SCHEMA shared TO athyper_projection_owner");
    await client.query("GRANT EXECUTE ON FUNCTION shared.current_tenant_id_soft() TO athyper_projection_owner");
    const verified = await client.query<{ tenant: boolean; scope: boolean }>(`
      SELECT
        has_table_privilege('athyper_projection_owner','master.tenant','SELECT') AS tenant,
        has_table_privilege('athyper_projection_owner','authz.scope_target','SELECT') AS scope
    `);
    if (verified.rows[0]?.tenant !== true || verified.rows[0]?.scope !== true) {
      throw new Error("projection owner read grants did not verify");
    }
    await client.query("COMMIT");
    return { plane, database: target.name, status: "repaired", grants: ["master.tenant:SELECT", "authz.scope_target:SELECT", "shared.current_tenant_id_soft:EXECUTE"] };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

function parsePlane(value: string | undefined): Plane {
  if (value === "studio" || value === "neon" || value === "mesh") return value;
  throw new Error("--plane must be studio, neon, or mesh");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const argument = process.argv.slice(2).find((value) => value.startsWith("--plane="));
  const result = await repairProjectionOwnerReadGrants(parsePlane(argument?.slice("--plane=".length)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
