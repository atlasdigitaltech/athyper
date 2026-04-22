import { Suspense } from "react";
import { EntityListPage } from "@athyper/entity-runtime/list";
import { Skeleton } from "@athyper/ui/primitives";

/**
 * Runtime entity list — /app/[entity]
 *
 * Unified list page for ALL entity types: master records and document records.
 * The entity code drives all rendering, columns, filters, and actions via metadata.
 *
 * Record family is determined by entity metadata:
 *   family: "master"   → vendor, customer, account, cost_center, employee, item, warehouse…
 *   family: "document" → purchase_invoice, purchase_order, journal_entry, payment_entry…
 *
 * The [entity] segment is the canonical entity code — the business key
 * (e.g. "vendor", "purchase_invoice") not a UUID.
 *
 * Examples:
 *   /app/vendor            → Vendor list
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
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
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
      <EntityListPage entityCode={entity} />
    </Suspense>
  );
}
