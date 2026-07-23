export type CompanyEntryMode =
  | { kind: "empty" }
  | { kind: "redirect"; companyCode: string }
  | { kind: "select"; initialCompanyCode: string };

export function resolveCompanyEntryMode(
  companies: ReadonlyArray<{ code: string }>,
  defaultCompanyCode?: string | null,
): CompanyEntryMode {
  if (companies.length === 0) return { kind: "empty" };
  if (companies.length === 1) return { kind: "redirect", companyCode: companies[0]!.code };
  const requestedDefault = defaultCompanyCode?.toLowerCase();
  const initial = companies.find((company) => company.code.toLowerCase() === requestedDefault) ?? companies[0]!;
  return { kind: "select", initialCompanyCode: initial.code };
}

/**
 * Resolves a route company against the companies available in the active
 * session scope. Returning the canonical code prevents case-only route drift;
 * returning null prevents cross-tenant or cross-legal-entity fallback.
 */
export function resolveAccessibleCompany<T extends { code: string }>(
  companies: readonly T[],
  requestedCompanyCode: string,
): T | null {
  const normalized = requestedCompanyCode.trim().toLowerCase();
  if (!normalized) return null;
  return companies.find((company) => company.code.toLowerCase() === normalized) ?? null;
}
