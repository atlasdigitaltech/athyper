import { ApWorkbenchView } from "@athyper/finance-workbench/views";
import { parseFinanceScope } from "@athyper/finance-workbench/lib/scope";

/**
 * AP/AR Workbench — /finance/ap
 *
 * Unified payables and receivables surface with 4 tabs:
 *   AP Invoices  — supplier invoices with status filter + pagination
 *   Aging        — AP aging buckets by supplier (current / 30 / 60 / 90 / 90+ days)
 *   AP Payments  — outbound payment entries
 *   AR Receipts  — inbound receipt entries
 *
 * Scope state comes from URL params (FinanceContextBar owns the selectors).
 */
export default async function ApWorkbenchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw   = await searchParams;
  const scope = parseFinanceScope(raw);

  return <ApWorkbenchView scope={scope} />;
}
