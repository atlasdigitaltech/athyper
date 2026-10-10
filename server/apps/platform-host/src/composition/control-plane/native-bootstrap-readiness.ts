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
    "entity_command_private.native_product_target_visible(uuid,uuid)",
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
  const initializer = await sql<{ allowed: boolean }>`SELECT
    to_regclass('entity_command_private.declared_operation_initialization') IS NOT NULL AS allowed`.execute(
    database,
  );
  if (initializer.rows[0]?.allowed !== true)
    throw Error("NATIVE_BOOTSTRAP_DECLARED_INITIALIZER_INSTALLATION_REQUIRED");
  const identity = await sql<{ allowed: boolean }>`SELECT bool_and(
    has_column_privilege(current_user,'metadata.entity_field_identity',column_name,'INSERT')
  ) AS allowed FROM unnest(ARRAY['id','entity_id','tenant_id','field_key','parent_identity_id',
    'identity_status','introduced_change_set_id','created_at','created_by']) AS required(column_name)`.execute(
    database,
  );
  if (identity.rows[0]?.allowed !== true)
    throw Error("NATIVE_BOOTSTRAP_IDENTITY_INSERT_PRIVILEGES_REQUIRED");
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
