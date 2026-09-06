import { sql, type Kysely } from "kysely";
import type { HealthContribution } from "@athyper/server-foundation/observability";

export const MESH_EXCHANGE_FUNCTIONS = [
  "mesh.command_request_network_relationship(uuid,uuid,uuid,uuid,text,date,date,text,text,uuid)",
  "mesh.command_issue_registration_exchange(uuid,uuid,uuid,text,text,text,integer,text,jsonb,text,timestamptz,text,text,uuid)",
] as const;
export const MESH_EXCHANGE_PERMISSIONS = [
  "mesh.business_partner_exchange.read",
  "mesh.business_partner_exchange.relationship",
  "mesh.business_partner_exchange.registration",
] as const;

export interface MeshExchangeRequirement {
  requirement: string;
  state: "ready" | "missing" | "execute_denied" | "unpublished";
}

/** Checks privileges as the connection's effective role, never as a hard-coded administrator. */
export function meshExchangeRequirementsQuery() {
  return sql<MeshExchangeRequirement>`
    WITH expected_functions(signature) AS (VALUES ${sql.join(MESH_EXCHANGE_FUNCTIONS.map(value => sql`(${sql.lit(value)})`))}),
    resolved_functions AS (SELECT signature, to_regprocedure(signature) AS oid FROM expected_functions),
    expected_permissions(code) AS (VALUES ${sql.join(MESH_EXCHANGE_PERMISSIONS.map(value => sql`(${sql.lit(value)})`))})
    SELECT signature AS requirement,
      CASE WHEN oid IS NULL THEN 'missing'
        WHEN NOT (has_schema_privilege(current_user, 'mesh', 'USAGE') AND has_function_privilege(current_user, oid, 'EXECUTE')) THEN 'execute_denied'
        ELSE 'ready' END AS state
    FROM resolved_functions
    UNION ALL
    SELECT expected.code AS requirement,
      CASE WHEN permission.id IS NULL THEN 'missing'
        WHEN permission.status <> 'published' THEN 'unpublished' ELSE 'ready' END AS state
    FROM expected_permissions expected LEFT JOIN authz.permission permission ON permission.canonical_code=expected.code
    ORDER BY requirement`;
}

export async function checkMeshExchangeReadiness(database: Kysely<Record<string, never>>): Promise<HealthContribution> {
  try {
    const { rows } = await meshExchangeRequirementsQuery().execute(database);
    const failures = [...MESH_EXCHANGE_FUNCTIONS, ...MESH_EXCHANGE_PERMISSIONS].flatMap(requirement => {
      const row = rows.find(result => result.requirement === requirement);
      return row?.state === "ready" ? [] : [`${requirement}: ${row?.state ?? "missing"}`];
    });
    return failures.length ? { status: "unhealthy", message: `MESH exchange requirements failed: ${failures.join("; ")}` } : { status: "healthy" };
  } catch {
    return { status: "unhealthy", message: "MESH exchange requirements could not be inspected" };
  }
}
