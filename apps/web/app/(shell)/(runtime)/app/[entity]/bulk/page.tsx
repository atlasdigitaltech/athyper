import { EntityBulkPage } from "@athyper/entity-runtime/bulk";

/**
 * Runtime entity bulk operations — /app/[entity]/bulk
 *
 * Bulk select, export, update, and delete for any entity type.
 * Selection state and operations are driven by EntityBulkPage.
 *
 * [entity] = canonical entity code (e.g. "vendor", "purchase-invoice")
 */
export default async function AppEntityBulkRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
  return <EntityBulkPage entityCode={entity} />;
}
