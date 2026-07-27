import type {
  ConflictSeverity,
  FinanceSetupConflict,
  JourneyStep,
  JourneyStepKey,
} from "./finance-setup.types";
import type {
  CertificationDomainKey,
  CertificationDomainReadiness,
} from "../hooks/useCertificationReadiness";
import type {
  PostingRoleCoverageCell,
  PostingRoleCoverageRow,
} from "../hooks/usePostingRoleCoverage";

export type ReviewFindingSource = "journey" | "conflict" | "certification" | "posting";
export type ReviewFindingSeverity = "blocker" | "warning" | "info";

export interface ReviewFinding {
  id: string;
  source: ReviewFindingSource;
  severity: ReviewFindingSeverity;
  title: string;
  message: string;
  reasonCode: string;
  actionLabel: string;
  actionHref: string;
}

const encode = encodeURIComponent;

function companySettingsRoot(companyCode: string): string {
  return `/finance/setup/company/${encode(companyCode)}`;
}

export function journeySettingsHref(companyCode: string, key: JourneyStepKey): string {
  const root = companySettingsRoot(companyCode);
  const target: Record<JourneyStepKey, string> = {
    foundation: `${root}/foundation/organization`,
    chart: `${root}/foundation/accounts#chart-assignments`,
    books: `${root}/foundation/books#book-assignments`,
    gl_controls: `${root}/foundation/accounts#gl-controls`,
    house_banks: `${root}/banking#house-banks`,
    fiscal_period: `${root}/foundation/calendar#calendar-assignment`,
  };
  return target[key];
}

export function journeyFinding(companyCode: string, step: JourneyStep): ReviewFinding | null {
  if (step.state === "complete") return null;
  const coverage = step.coveragePct == null ? "" : ` Current coverage is ${step.coveragePct}%.`;
  return {
    id: `journey:${step.key}`,
    source: "journey",
    severity: step.state === "blocked" ? "blocker" : "warning",
    title: `${step.label} requires review`,
    message: `${step.label} is ${step.state.replaceAll("_", " ")}.${coverage}`,
    reasonCode: `JOURNEY_${step.key.toUpperCase()}_${step.state.toUpperCase()}`,
    actionLabel: `Open ${step.label} settings`,
    actionHref: journeySettingsHref(companyCode, step.key),
  };
}

function conflictFallbackHref(companyCode: string, category: FinanceSetupConflict["category"]): string {
  const root = companySettingsRoot(companyCode);
  const target: Record<FinanceSetupConflict["category"], string> = {
    foundation: `${root}/foundation/organization`,
    chart: `${root}/foundation/accounts#chart-assignments`,
    book: `${root}/foundation/books#book-assignments`,
    gl_control: `${root}/foundation/accounts#gl-controls`,
    posting_role: `/workbench/finance/posting-role-coverage?scopeId=${encode(companyCode)}`,
    house_bank: `${root}/banking#house-banks`,
    period: `${root}/foundation/calendar#calendar-assignment`,
    assignment: `${root}/foundation/accounts#chart-assignments`,
  };
  return target[category];
}

function reviewSeverity(severity: ConflictSeverity): ReviewFindingSeverity {
  return severity === "blocker" || severity === "error"
    ? "blocker"
    : severity === "warning"
      ? "warning"
      : "info";
}

export function conflictFinding(companyCode: string, conflict: FinanceSetupConflict): ReviewFinding {
  return {
    id: `conflict:${conflict.id}`,
    source: "conflict",
    severity: reviewSeverity(conflict.severity),
    title: conflict.title,
    message: conflict.message,
    reasonCode: conflict.reasonCode,
    actionLabel: conflict.actionLabel ?? "Open relevant settings",
    actionHref: conflict.actionHref || conflictFallbackHref(companyCode, conflict.category),
  };
}

function certificationCheckHref(companyCode: string, domain: CertificationDomainKey, code: string): string {
  const root = companySettingsRoot(companyCode);
  const byCode: Record<string, string> = {
    fx_policy_effective: `${root}/currency-fx#fx-policy`,
    fx_setup_complete: `${root}/currency-fx#fx-policy`,
    fx_posting_accounts: `${root}/currency-fx#fx-posting-accounts`,
    tax_registration: `${root}/tax#tax-registrations`,
    tax_groups: `${root}/tax#tax-groups`,
    tax_resolution: `${root}/tax#tax-resolution`,
    tax_posting_roles: `/workbench/finance/posting-role-coverage?scopeId=${encode(companyCode)}`,
    payment_methods: `${root}/payments#payment-policies`,
    payment_house_banks: `${root}/banking#house-banks`,
    payment_interfaces: `${root}/payments#payment-routing`,
    settlement_rules: `${root}/payments#settlement-accounting`,
    payment_posting_roles: `/workbench/finance/posting-role-coverage?scopeId=${encode(companyCode)}`,
    house_bank_configured: `${root}/banking#house-banks`,
    house_bank_ready: `${root}/banking#house-banks`,
    bank_reconciliation: `/finance/bank-recon?company=${encode(companyCode)}`,
  };
  if (byCode[code]) return byCode[code];
  const byDomain: Record<CertificationDomainKey, string> = {
    currency_fx: `${root}/currency-fx`,
    tax: `${root}/tax`,
    payments_settlement: `${root}/payments`,
    banking_treasury: `${root}/banking`,
  };
  return byDomain[domain];
}

export function certificationFindings(
  companyCode: string,
  domain: CertificationDomainReadiness,
): ReviewFinding[] {
  return domain.checks.filter((check) => !check.passed).map((check) => ({
    id: `certification:${domain.domain}:${check.code}`,
    source: "certification",
    severity: "blocker",
    title: check.label,
    message: `${domain.label} cannot pass certification until this backend check succeeds.`,
    reasonCode: check.code,
    actionLabel: `Open ${domain.label} settings`,
    actionHref: certificationCheckHref(companyCode, domain.domain, check.code),
  }));
}

export function postingRoleFinding(
  companyCode: string,
  row: PostingRoleCoverageRow,
  cell: PostingRoleCoverageCell,
): ReviewFinding | null {
  if (!cell.required || (cell.status !== "missing" && cell.status !== "invalid")) return null;
  const fragment = encode(`posting-role-${row.roleCode}-${cell.bookCode}`);
  return {
    id: `posting:${row.roleCode}:${cell.bookId}`,
    source: "posting",
    severity: "blocker",
    title: `${row.roleName} is ${cell.status} for ${cell.bookCode}`,
    message: cell.status === "missing"
      ? `Assign a postable GL account for ${row.roleCode} in ledger book ${cell.bookCode}.`
      : `Replace the invalid ${row.roleCode} account mapping in ledger book ${cell.bookCode}.`,
    reasonCode: cell.reasonCode,
    actionLabel: "Open posting-role assignment",
    actionHref: `/workbench/finance/posting-role-coverage?scopeId=${encode(companyCode)}#${fragment}`,
  };
}
