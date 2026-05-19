import { EntityDetailPage } from "@athyper/entity-runtime/detail";
import { DocumentDetailPage } from "@athyper/document-runtime";
import { redirect } from "next/navigation";
import { canonicalEntityCode, canonicalEntitySlug } from "../../_lib/entity-aliases";

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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity, id } = await params;
  const currentSearchParams = await searchParams;
  const entityCode = canonicalEntityCode(entity);
  const entitySlug = canonicalEntitySlug(entity);
  if (entitySlug !== entity) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(currentSearchParams)) {
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
      } else if (value != null) {
        query.set(key, value);
      }
    }
    const queryText = query.toString();
    redirect(`/app/${entitySlug}/${encodeURIComponent(id)}${queryText ? `?${queryText}` : ""}`);
  }

  const mode = firstParam(currentSearchParams["mode"]);
  const returnTo = firstParam(currentSearchParams["returnTo"]);
  return (
    <EntityDetailPage
      entityCode={entityCode}
      recordId={id}
      editMode={mode === "edit"}
      returnTo={returnTo}
      documentRenderer={DocumentDetailPage}
    />
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
