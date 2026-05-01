import { EntityDetailPage } from "@athyper/entity-runtime/detail";
import { DocumentDetailPage } from "@athyper/document-runtime";

/**
 * Runtime entity detail — /app/[entity]/[id]
 *
 * Unified detail page for master and document entities.
 * EntityDetailPage reads entity metadata to render the correct shell,
 * tabs, and actions based on the entity's family and configuration.
 *
 * [id] = canonical business key (document number, entity code).
 *        NOT a UUID. NOT a slug.
 *        e.g. VND-001, INV-10045, JE-10045, PO-2045
 *
 * Mode flag:
 *   ?mode=edit  — renders fields as inputs in the same shell (master records).
 *
 * Sub-routes still available:
 *   /app/[entity]/[id]/attachments → file attachments
 *   /app/[entity]/[id]/flow        → approval workflow state
 *
 * Examples:
 *   /app/supplier/SUP-00001            → Supplier detail (read)
 *   /app/supplier/SUP-00001?mode=edit → Supplier detail (edit mode, same shell)
 *   /app/purchase_invoice/INV-10045   → Invoice detail with DocumentDetailPage
 */
export default async function AppEntityDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string; id: string }>;
  searchParams: Promise<{ mode?: string }>;
}) {
  const { entity, id } = await params;
  const { mode } = await searchParams;
  return (
    <EntityDetailPage
      entityCode={entity}
      recordId={id}
      editMode={mode === "edit"}
      documentRenderer={DocumentDetailPage}
    />
  );
}
