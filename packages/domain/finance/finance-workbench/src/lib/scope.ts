/* ---------------------------------------------------------------------------
   FinanceScope — canonical scope contract for all finance read models.

   Every hook, API route, and server action accepts FinanceScope as its
   first parameter. The SQL resolver fn_resolve_scope_companies() handles
   the database-side multi-company expansion.
   --------------------------------------------------------------------------- */

export type ScopeType = "company" | "legal_entity" | "group";

export interface FinanceScope {
  /** Granularity of the scope resolution. */
  scopeType: ScopeType;

  /**
   * Identity value whose meaning depends on scopeType:
   *   company       -> master.company_code.code  (e.g. "AUKA")
   *   legal_entity  -> master.legal_entity.id    (UUID)
   *   group         -> "GROUP" (or the root legal_entity.id)
   */
  scopeId: string;

  /** Fiscal year number (e.g. 2026). */
  fiscalYear: number;

  /**
   * Period number (0-16). Null means all periods (full-year view).
   *   0     = opening balances
   *   1-12  = standard months
   *   13-16 = adjustment periods
   */
  period: number | null;

  /**
   * Ledger book ID (master.ledger_book.id).
   * When absent the API falls back to the company's primary Ledger Book.
   */
  bookId?: string;

  /**
   * Display / reporting currency code (e.g. "USD").
   * When absent defaults to the company's functional_currency.
   */
  currency?: string;

  /**
   * Transaction currency code on source journals/subledger documents.
   * Balance-based reports may ignore this until currency conversion is wired.
   */
  transactionCurrency?: string;

  /** When true the API also returns the prior-year column for comparison. */
  comparative?: boolean;
}

/**
 * Parse a FinanceScope from raw URL search params.
 * Accepts both server (Next.js searchParams object) and client (URLSearchParams entries) shapes.
 * Array values are normalised to their first scalar.
 */
export function parseFinanceScope(
  raw: Record<string, string | string[] | undefined>,
  defaults: Partial<FinanceScope> = {},
): FinanceScope {
  const scalar = (k: string): string | undefined => {
    const v = raw[k];
    return Array.isArray(v) ? v[0] : v;
  };

  return {
    scopeType:   (scalar("scopeType") as FinanceScope["scopeType"]) ?? defaults.scopeType   ?? "company",
    scopeId:      scalar("scopeId")                                  ?? defaults.scopeId     ?? "",
    fiscalYear:   Number(scalar("fiscalYear")                        ?? defaults.fiscalYear  ?? new Date().getFullYear()),
    period:       scalar("period") != null
                    ? Number(scalar("period"))
                    : (defaults.period ?? null),
    bookId:       scalar("bookId")              ?? defaults.bookId,
    currency:     scalar("currency")            ?? defaults.currency,
    transactionCurrency:
                  scalar("transactionCurrency") ?? scalar("txnCurrency") ?? defaults.transactionCurrency,
    comparative:  scalar("comparative") === "true" || defaults.comparative,
  };
}

/** Build the URL search-param string for a FinanceScope. */
export function scopeToParams(scope: FinanceScope): URLSearchParams {
  const p = new URLSearchParams({
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    fiscalYear: String(scope.fiscalYear),
  });
  if (scope.period !== null && scope.period !== undefined) {
    p.set("period", String(scope.period));
  }
  if (scope.bookId) p.set("bookId", scope.bookId);
  if (scope.currency) p.set("currency", scope.currency);
  if (scope.transactionCurrency) p.set("transactionCurrency", scope.transactionCurrency);
  if (scope.comparative) p.set("comparative", "true");
  return p;
}

/** Stable cache key for TanStack Query. */
export function scopeCacheKey(scope: FinanceScope): readonly unknown[] {
  return [
    scope.scopeType,
    scope.scopeId,
    scope.fiscalYear,
    scope.period ?? "all",
    scope.bookId ?? null,
    scope.currency ?? null,
    scope.transactionCurrency ?? null,
    scope.comparative ?? false,
  ] as const;
}
