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
 * The entity-runtime resolves [id] against the entity's configured key field
 * (vendor_code, invoice_number, journal_number, etc.).
 *
 * Sub-routes available for document entities:
 *   /app/[entity]/[id]/attachments → file attachments
 *   /app/[entity]/[id]/flow        → approval workflow state
 *   /app/[entity]/[id]/edit        → edit form
 *
 * Examples:
 *   /app/vendor/VND-001               → Vendor detail
 *   /app/purchase-invoice/INV-10045   → Invoice detail with DocumentShell
 *   /app/journal-entry/JE-10045       → Journal entry (standalone form view)
 *
 * Decision rule:
 *   /app/journal-entry/JE-10045 is the record form (runtime).
 *   /finance/gl?entry=JE-10045 is the workbench focus (workbench panel).
 *   Both coexist — different purposes, different contexts.
 */
export default async function AppEntityDetailRoute({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  return <EntityDetailPage entityCode={entity} recordId={id} />;
}
