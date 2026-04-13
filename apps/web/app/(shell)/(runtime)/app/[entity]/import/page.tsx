import { EntityImportPage } from "@athyper/entity-runtime/import";

/**
 * Runtime entity import — /app/[entity]/import
 *
 * CSV / Excel bulk import for any entity type.
 * Driven by entity metadata: field mapping, required columns, validation rules.
 * Wizard: upload → map → preview → dry-run → importing → result
 *
 * [entity] = canonical entity code (e.g. "vendor", "item")
 */
export default async function AppEntityImportRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
  return <EntityImportPage entityCode={entity} />;
}
