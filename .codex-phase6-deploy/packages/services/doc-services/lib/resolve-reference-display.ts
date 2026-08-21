import type { Kysely } from "kysely";
import type { ResolvedPrintSection } from "@athyper/entity-print/core";

/**
 * For every reference field in the resolved sections, fetches a human-readable
 * display value from the referenced table and writes it into `data` as
 * `${fieldName}__display`. Failures are silently swallowed — the PDF will
 * show the raw value (UUID) if resolution fails.
 */
export async function resolveReferenceDisplayValues(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>,
  sections: ResolvedPrintSection[],
  data: Record<string, unknown>,
  tenantId: string,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  for (const section of sections) {
    for (const field of section.fields) {
      if (!field.reference_config) continue;
      const rawValue = data[field.name];
      if (!rawValue) continue;

      const displayKey = `${field.name}__display`;
      if (data[displayKey] != null) continue; // already resolved

      const ref = field.reference_config as Record<string, unknown>;
      const targetSchema = (ref["target_schema"] as string | undefined) ?? "master";
      const targetTable  = ref["target_table"] as string | undefined;
      const displayField = (ref["display_field"] as string | undefined) ?? "name";

      if (!targetTable) continue;

      tasks.push(
        (async () => {
          try {
            const row = await db
              .selectFrom(`${targetSchema}.${targetTable}`)
              .select(displayField as never)
              .where("id" as never, "=" as never, rawValue as never)
              .where("tenant_id" as never, "=" as never, tenantId as never)
              .executeTakeFirst() as Record<string, unknown> | undefined;

            if (row?.[displayField] != null) {
              data[displayKey] = row[displayField];
            }
          } catch {
            // Non-fatal: PDF shows raw value
          }
        })(),
      );
    }
  }

  await Promise.all(tasks);
}
