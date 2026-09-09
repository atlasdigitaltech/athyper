/** Global published reference data. No tenant or account values belong in this contract. */
export type BankIdentifierScheme = "bic" | "national_bank_code" | "national_branch_code" | "clearing_member_id";
export interface BankDirectoryEffectiveRange {
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}
export interface BankDirectoryInstitution extends BankDirectoryEffectiveRange {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly institutionType: "bank" | "credit_union" | "payment_institution" | "other";
  readonly status: "active" | "retired";
}
export interface BankDirectoryBranch extends BankDirectoryEffectiveRange {
  readonly id: string;
  readonly institutionId: string;
  readonly name: string;
  readonly countryCode: string;
  readonly location: Readonly<Record<string, string>>;
  readonly status: "active" | "retired";
}
export interface BankDirectoryIdentifier extends BankDirectoryEffectiveRange {
  readonly id: string;
  readonly institutionId: string;
  readonly branchId?: string;
  readonly scheme: BankIdentifierScheme;
  readonly schemeNamespace: string;
  readonly jurisdiction: string;
  readonly value: string;
}
export interface BankDirectorySourceRecord {
  readonly source: string;
  readonly sourceRecordId: string;
  readonly institutionId: string;
  readonly branchId?: string;
}
export interface BankDirectoryPayload {
  readonly institutions: readonly BankDirectoryInstitution[];
  readonly branches: readonly BankDirectoryBranch[];
  readonly identifiers: readonly BankDirectoryIdentifier[];
  readonly sourceRecords: readonly BankDirectorySourceRecord[];
}
export interface BankDirectoryRelease {
  readonly id: string;
  readonly version: number;
  readonly publishedAt: string;
  readonly sources: readonly Readonly<{ source: string; version: string; retrievedAt: string }>[];
  /** SHA-256 of PostgreSQL jsonb::text UTF-8 payload; identical on each consuming plane. */
  readonly contentHash: string;
  readonly payload: BankDirectoryPayload;
}
export const BANKING_AUTHORITY = Object.freeze({
  institutionBranchRouting: "shared_directory",
  meshAccountFacts: "mesh_account_owner",
  localAccountFacts: "neon_tenant",
  disclosureLifecycle: "mesh",
  receivingVerificationAcceptance: "neon_tenant",
  companyUsagePreferredAccount: "neon_company",
  houseBankConfiguration: "neon_company",
} as const);
