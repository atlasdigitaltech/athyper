import { sql, type Kysely } from "kysely";

export type RuntimePlane = "studio" | "neon" | "mesh";

export interface PlaneDatabaseIdentity {
  readonly databaseName: string;
  readonly configuredPlane: string | null;
  readonly sessionUser: string;
  readonly superuser: boolean;
  readonly bypassRls: boolean;
  readonly applicationRole: boolean;
}

const EXPECTED_DATABASE: Readonly<Record<RuntimePlane, string>> = {
  studio: "athyper_studio",
  neon: "athyper_neon",
  mesh: "athyper_mesh",
};

/** Fails readiness when a runtime pool is privileged or points at the wrong physical plane. */
export async function qualifyRuntimePlaneDatabase(
  database: Kysely<unknown>,
  expectedPlane: RuntimePlane,
): Promise<PlaneDatabaseIdentity> {
  const row = (await sql<{
    databaseName: string;
    configuredPlane: string | null;
    sessionUser: string;
    superuser: boolean;
    bypassRls: boolean;
    applicationRole: boolean;
  }>`
    SELECT current_database() AS "databaseName",
           current_setting('app.database_plane', true) AS "configuredPlane",
           session_user AS "sessionUser",
           role.rolsuper AS superuser,
           role.rolbypassrls AS "bypassRls",
           pg_has_role(session_user, 'athyperapp', 'MEMBER') AS "applicationRole"
      FROM pg_roles AS role
     WHERE role.rolname = session_user
  `.execute(database)).rows[0];

  if (!row) throw new Error(`DATABASE_RUNTIME_IDENTITY_UNAVAILABLE:${expectedPlane}`);
  assertRuntimePlaneDatabaseIdentity(row, expectedPlane);
  return row;
}

export function assertRuntimePlaneDatabaseIdentity(
  identity: PlaneDatabaseIdentity,
  expectedPlane: RuntimePlane,
): void {
  const expectedDatabase = EXPECTED_DATABASE[expectedPlane];
  if (identity.databaseName !== expectedDatabase || identity.configuredPlane !== expectedPlane) {
    throw new Error(
      `DATABASE_PLANE_MISMATCH:${expectedPlane}:expected=${expectedDatabase}:actual=${identity.databaseName}:configured=${identity.configuredPlane ?? "unset"}`,
    );
  }
  if (identity.superuser || identity.bypassRls) {
    throw new Error(`DATABASE_RUNTIME_ROLE_PRIVILEGED:${expectedPlane}:${identity.sessionUser}`);
  }
  if (!identity.applicationRole) {
    throw new Error(`DATABASE_RUNTIME_ROLE_MISSING:${expectedPlane}:${identity.sessionUser}:athyperapp`);
  }
}
