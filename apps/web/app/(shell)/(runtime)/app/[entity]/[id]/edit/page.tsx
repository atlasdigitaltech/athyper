import { GenericMetaEditPage } from "@athyper/entity-runtime/edit";
import { canonicalEntityCode } from "../../../_lib/entity-aliases";

/**
 * /app/[entity]/[id]/edit — generic Tier 1 edit surface.
 *
 * Static-segment routes (e.g. purchase_invoice/[id]/edit) take Next.js priority
 * over this dynamic route, so Tier 2 adapters are unaffected.
 *
 * Tier 1 entities (supplier, company_code, cost_center, etc.) need no custom
 * route, hook, or form — the descriptor registry drives the entire edit surface.
 */
export default async function AppEntityEditPage({
  params,
}: {
  params: Promise<{ entity: string; id: string }>;
}) {
  const { entity, id } = await params;
  return <GenericMetaEditPage entityCode={canonicalEntityCode(entity)} recordId={id} />;
}
