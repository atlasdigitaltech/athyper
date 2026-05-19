import { notFound } from "next/navigation";
import { EntityBulkPage } from "@athyper/entity-runtime/bulk";
import { getCompiledEntity } from "@/lib/entity-meta";
import { resolveCapabilities } from "@/lib/entity-capabilities";
import { canonicalEntityCode } from "../../_lib/entity-aliases";

/**
 * Runtime entity bulk operations — /app/[entity]/bulk
 *
 * Bulk select, export, update, and delete for any entity type.
 * Selection state and operations are driven by EntityBulkPage.
 *
 * Gated by feature_flags.is_bulk_editable / is_exportable — notFound() when disabled.
 *
 * [entity] = canonical entity code (e.g. "supplier", "purchase-invoice")
 */
export default async function AppEntityBulkRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
  const entityCode = canonicalEntityCode(entity);
  const meta = await getCompiledEntity(entityCode);
  if (!meta || !resolveCapabilities(meta).hasBulk) notFound();
  return <EntityBulkPage entityCode={entityCode} />;
}
