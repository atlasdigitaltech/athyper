import { sql, type Kysely } from "kysely";
import type { InstalledReferenceResourcePin } from "@athyper/server-plane-studio-meta-entity-authoring";

/** Availability check before serving bootstrap. Actual requests still perform
 * signature, admission, current-reviewer and full resource qualification. */
export async function requireNativeBootstrapDependencies(
  database: Kysely<Record<string, never>>,
  tenantId: string,
  pin: InstalledReferenceResourcePin,
): Promise<void> {
  const signatures = [
    "entity_command_private.enter_root_registration(text,text)",
    "entity_command_private.native_reference_target_exists(uuid,uuid,text)",
    "entity_command_private.native_descriptor_ready(uuid,uuid,text,text,text)",
  ];
  for (const signature of signatures) {
    const result = await sql<{ allowed: boolean }>`SELECT CASE
      WHEN to_regprocedure(${signature}) IS NULL THEN false
      ELSE has_function_privilege(current_user,to_regprocedure(${signature}),'EXECUTE')
      END AS allowed`.execute(database);
    if (result.rows[0]?.allowed !== true)
      throw Error(`NATIVE_BOOTSTRAP_DATABASE_DEPENDENCY_REQUIRED:${signature}`);
  }
  const resource = await sql<{
    ready: boolean;
  }>`SELECT entity_command_private.native_descriptor_ready(
    ${tenantId}::uuid,${pin.releaseId}::uuid,${pin.publicationKey},${pin.unsignedHash},${pin.artifactHash}) AS ready`.execute(
    database,
  );
  if (resource.rows[0]?.ready !== true)
    throw Error(
      `NATIVE_BOOTSTRAP_DESCRIPTOR_INSTALLATION_REQUIRED:${pin.releaseId}`,
    );
}
