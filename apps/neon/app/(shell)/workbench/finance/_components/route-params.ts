import type { FinanceScope } from "@athyper/finance-workbench";

export type WorkbenchSearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function governanceRouteProps(raw: WorkbenchSearchParams, forcedPeriod?: number | null) {
  const currentYear = new Date().getUTCFullYear();
  const periodRaw = first(raw["period"]);
  const scope: FinanceScope = {
    scopeType: "company",
    scopeId: first(raw["scopeId"]) ?? "",
    fiscalYear: Number(first(raw["fiscalYear"]) ?? currentYear),
    period: forcedPeriod !== undefined ? forcedPeriod : periodRaw == null ? 1 : Number(periodRaw),
    bookId: first(raw["bookId"]),
  };
  return { scope, runId: first(raw["runId"]), phaseCode: first(raw["phaseCode"]) };
}
