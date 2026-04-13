import { GlWorkbench } from "@athyper/finance-workbench";

/**
 * GL Workbench — /finance/gl
 *
 * Bespoke workbench surface. No [id] child routes.
 * Full-bleed workbench — no PageFrame wrapper.
 *
 * Accepts query params to preserve workbench context:
 *   /finance/gl?tab=trial-balance      (default)
 *   /finance/gl?tab=balance-sheet
 *   /finance/gl?tab=profit-loss
 *   /finance/gl?tab=gl-detail
 *   /finance/gl?tab=ap-ar
 *   /finance/gl?tab=bank-recon
 *   /finance/gl?tab=period-close
 *   /finance/gl?entry=JE-10045         → focus journal entry in panel
 *   /finance/gl?period=2026-03&status=draft
 *   /finance/gl?source=purchase_invoice
 */

const VALID_TABS = [
  "trial-balance", "balance-sheet", "profit-loss", "gl-detail",
  "ap-ar", "bank-recon", "period-close",
] as const;

type WorkbenchTab = typeof VALID_TABS[number];

function isValidTab(t: unknown): t is WorkbenchTab {
  return VALID_TABS.includes(t as WorkbenchTab);
}

export default async function GlWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params["tab"]) ? params["tab"][0] : params["tab"];
  const defaultTab: WorkbenchTab = isValidTab(raw) ? raw : "trial-balance";

  return <GlWorkbench defaultTab={defaultTab} />;
}
