import { notFound } from "next/navigation";
import { EntityImportPage } from "@athyper/entity-runtime/import";
import { getCompiledEntity } from "@/lib/entity-meta";
import { resolveCapabilities } from "@/lib/entity-capabilities";

/**
 * Runtime entity import — /app/[entity]/import
 *
 * CSV / Excel bulk import for any entity type.
 * Driven by entity metadata: field mapping, required columns, validation rules.
 * Wizard: upload → map → preview → dry-run → importing → result
 *
 * Gated by feature_flags.is_importable — notFound() when disabled.
 *
 * [entity] = canonical entity code (e.g. "supplier", "item")
 */
export default async function AppEntityImportRoute({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
  const meta = await getCompiledEntity(entity);
  if (!meta || !resolveCapabilities(meta).hasImport) notFound();
  return <EntityImportPage entityCode={entity} />;
}
