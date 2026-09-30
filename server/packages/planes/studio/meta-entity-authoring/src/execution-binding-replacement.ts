import { sql, type Kysely } from "kysely";

/** Called after the draft revision lock is held. Empty configuration drafts do
 * not require writes to separately governed execution tables. Existing bindings
 * are deleted normally: a denied write still aborts the entire save. */
export async function clearExecutionBindings(
  db: Kysely<Record<string, never>>,
  changeSetId: string,
) {
  const mappings = await sql<{ present: boolean }>`SELECT EXISTS (
    SELECT 1 FROM metadata.entity_materialization_field_mapping m
    JOIN metadata.entity_materialization_binding b ON m.entity_materialization_binding_id=b.id
      AND m.tenant_id IS NOT DISTINCT FROM b.tenant_id
    WHERE b.change_set_id=${changeSetId}::uuid) AS present`.execute(db);
  if (mappings.rows[0]?.present)
    await sql`DELETE FROM metadata.entity_materialization_field_mapping m
    USING metadata.entity_materialization_binding b
    WHERE m.entity_materialization_binding_id=b.id
      AND m.tenant_id IS NOT DISTINCT FROM b.tenant_id
      AND b.change_set_id=${changeSetId}::uuid`.execute(db);
  for (const table of [
    "entity_change_case_binding",
    "entity_operation_context_requirement",
    "entity_field_reference_binding",
    "entity_materialization_binding",
  ]) {
    const existing = await sql<{
      present: boolean;
    }>`SELECT EXISTS (SELECT 1 FROM ${sql.table(`metadata.${table}`)} WHERE change_set_id=${changeSetId}::uuid) AS present`.execute(
      db,
    );
    if (existing.rows[0]?.present)
      await sql`DELETE FROM ${sql.table(`metadata.${table}`)} WHERE change_set_id=${changeSetId}::uuid`.execute(
        db,
      );
  }
}
