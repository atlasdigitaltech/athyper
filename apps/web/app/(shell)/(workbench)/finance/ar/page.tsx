import { ArWorkbenchView } from "@athyper/finance-workbench/views";
import { parseFinanceScope } from "@athyper/finance-workbench/lib/scope";

/**
 * AR Workbench — /finance/ar
 *
 * Receivables surface with 2 tabs:
 *   AR Aging  — per-customer aging buckets (current / 30 / 60 / 90 / 90+) with summary cards
 *   Receipts  — inbound payment entries with pagination
 *
 * Scope state comes from URL params (FinanceContextBar owns the selectors).
 */
export default async function ArWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw   = await searchParams;
  const scope = parseFinanceScope(raw);

  return <ArWorkbenchView scope={scope} />;
}
