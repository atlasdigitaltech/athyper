import { BankReconciliationView } from "@athyper/finance-workbench/views";
import { parseFinanceScope } from "@athyper/finance-workbench/lib/scope";

/**
 * Bank Reconciliation Workbench — /finance/bank-recon
 *
 * Standalone bank reconciliation surface:
 *   House bank account selector (auto-selects primary account)
 *   Statement tab  — full payment_entry ledger for the selected account + period
 *   Unreconciled   — posted-but-uncleared items; row checkboxes + "Mark Cleared" action
 *
 * Scope state comes from URL params (FinanceContextBar owns the selectors).
 */
export default async function BankReconPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw   = await searchParams;
  const scope = parseFinanceScope(raw);

  return <BankReconciliationView scope={scope} />;
}
