import { EntityDetailPage } from "@athyper/entity-runtime/detail";

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
 *                 For approvable documents, edit is handled by workflow actions
 *                 inside ApprovableDocumentShell; the mode flag is ignored there.
 *
 * Sub-routes still available:
 *   /app/[entity]/[id]/attachments → file attachments
 *   /app/[entity]/[id]/flow        → approval workflow state
 *
 * Examples:
 *   /app/vendor/VND-001               → Vendor detail (read)
 *   /app/vendor/VND-001?mode=edit     → Vendor detail (edit mode, same shell)
 *   /app/purchase_invoice/INV-10045   → Invoice detail with DocumentShell
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
    />
  );
}
