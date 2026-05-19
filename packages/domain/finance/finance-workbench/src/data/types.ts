/* ----------------------------------------------------------------------------
   Finance workbench domain types
   ---------------------------------------------------------------------------- */

export type AccountClass =
  | "asset"
  | "contra_asset"
  | "liability"
  | "contra_liability"
  | "equity"
  | "contra_equity"
  | "income"
  | "expense";

export type NodeType = "header" | "posting";
export type NormalBalance = "debit" | "credit";
export type ChartTier = "group" | "operating" | "local";
export type ConsolidationMethod = "full" | "proportional" | "equity";
export type OwnerType = "customer" | "supplier" | "employee" | "internal";
export type ReconciliationType = "auto" | "manual" | "none";

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  framework: string;
  tier: ChartTier;
  country: string | null;
  accountCount: number;
  version: number;
  isLocked: boolean;
}

export interface GlAccountNode {
  id: string;
  code: string;
  name: string;
  accountClass: AccountClass;
  nodeType: NodeType;
  normalBalance: NormalBalance;
  level: number;
  subledgerType: string | null;
  closingDebit: number;
  closingCredit: number;
  children: GlAccountNode[] | null;
}

export interface LegalEntity {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  entityType: "holding" | "operating";
  consolidationMethod: ConsolidationMethod | null;
  ownershipPct: number | null;
  country: string;
  countryCode?: string | null;
  countryName?: string | null;
  functionalCurrency: string;
  reportingCurrency: string;
  companyCodes: string[];
  status: "active" | "dormant";
}

export interface CompanyCode {
  code: string;
  name: string;
  currency: string;
  operatingChart: string;
  groupChart: string;
  localChart: string | null;
  region: string;
}

export interface PostingControl {
  companyCode: string;
  accountCode: string;
  accountName: string;
  accountClass: AccountClass;
  ownerType: OwnerType;
  subledgerType: string | null;
  postingAllowed: boolean;
  blockedForManual: boolean;
  blockedForAuto: boolean;
  requiresCostCenter: boolean;
  requiresProfitCenter: boolean;
  requiresProject: boolean;
  defaultCostCenter: string | null;
  defaultProfitCenter: string | null;
  defaultSite: string | null;
  reconciliation: ReconciliationType;
  taxTreatment: string | null;
  openItemManaged: boolean;
  lineItemDisplay: boolean;
}

export interface CoaMapping {
  id: number;
  sourceChart: string;
  sourceAccount: string;
  sourceName: string;
  targetChart: string;
  targetAccount: string;
  targetName: string;
  mappingType: "direct" | "merge" | "split";
  allocationPct: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  version: number;
  status: "active" | "expired" | "draft";
  reason: string;
}
