import { Suspense } from "react";
import { redirect } from "next/navigation";
import { EntityListPage } from "@athyper/entity-runtime/list";
import { Skeleton } from "@athyper/ui/primitives";
import { canonicalEntityCode, canonicalEntitySlug } from "../_lib/entity-aliases";

/**
 * Runtime entity list — /app/[entity]
 *
 * Unified list page for ALL entity types: master records and document records.
 * The entity code drives all rendering, columns, filters, and actions via metadata.
 *
 * Record family is determined by entity metadata:
 *   family: "master"   → supplier, customer, account, cost_center, employee, item, warehouse…
 *   family: "document" → purchase_invoice, purchase_order, journal_entry, payment_entry…
 *
 * The [entity] segment is the canonical entity code — the business key
 * (e.g. "supplier", "purchase_invoice") not a UUID.
 *
 * Examples:
 *   /app/supplier          → Supplier list
 *   /app/customer          → Customer list
 *   /app/purchase_invoice  → Purchase Invoice list
 *   /app/journal_entry     → Journal Entry list
 *
 * Row click navigates to /app/[entity]/[id] using the record's business key.
 *
 * Decision rule:
 *   This page IS the record list → belongs in (runtime), not (workbench).
 *   /finance/coa is the COA workbench — account hierarchy explorer.
 *   /app/account is the account master record — create, edit, attach.
 *   A workbench may open a runtime record via drawer or deep link but
 *   never duplicates its form.
 */
export default async function AppEntityListRoute({
  params,
  searchParams,
}: {
  params: Promise<{ entity: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { entity } = await params;
  const canonicalEntity = canonicalEntityCode(entity);
  const canonicalSlug = canonicalEntitySlug(entity);
  if (canonicalSlug !== entity) {
    const currentSearchParams = await searchParams;
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(currentSearchParams)) {
      if (Array.isArray(value)) {
        value.forEach((item) => query.append(key, item));
      } else if (value != null) {
        query.set(key, value);
      }
    }
    const queryText = query.toString();
    redirect(`/app/${canonicalSlug}${queryText ? `?${queryText}` : ""}`);
  }

  // Suspense boundary is required because EntityListPage uses useSearchParams()
  // (via useEntityListUrl) which opts the subtree into Suspense in Next.js App Router.
  return (
    <Suspense
      fallback={
        <div className="space-y-3 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-full" />
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      }
    >
      <EntityListPage entityCode={canonicalEntity} />
    </Suspense>
  );
}
