export type NumberingPlane = "neon" | "mesh";

export type NumberingScopeKind =
  | "tenant"
  | "entity"
  | "legal_entity"
  | "company_code"
  | "site"
  | "operating_organization"
  /** @deprecated use company_code */
  | "resource_company"
  | "ledger"
  | "network_account";

export type NumberingResetKind =
  | "never"
  | "calendar_year"
  | "calendar_month"
  | "calendar_day"
  | "fiscal_year";

export type NumberingPolicyStatus = "draft" | "active" | "retired";

export const NEON_SCOPE_KINDS = [
  "tenant",
  "entity",
  "legal_entity",
  "company_code",
  "site",
  "operating_organization",
  "resource_company",
  "ledger",
] as const satisfies readonly NumberingScopeKind[];

export const MESH_SCOPE_KINDS = [
  "tenant",
  "entity",
  "network_account",
] as const satisfies readonly NumberingScopeKind[];

export const NUMBERING_SCOPE_KINDS = [
  "tenant",
  "entity",
  "legal_entity",
  "company_code",
  "site",
  "operating_organization",
  "resource_company",
  "ledger",
  "network_account",
] as const satisfies readonly NumberingScopeKind[];

export const NUMBERING_RESET_KINDS = [
  "never",
  "calendar_year",
  "calendar_month",
  "calendar_day",
  "fiscal_year",
] as const satisfies readonly NumberingResetKind[];

export const NUMBERING_STATUS_VALUES = [
  "draft",
  "active",
  "retired",
] as const satisfies readonly NumberingPolicyStatus[];
