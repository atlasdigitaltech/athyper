/**
 * Commission Engine — Domain Types
 *
 * Enums, interfaces, and value objects for the commission domain model.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum PlanType {
  FLAT_RATE = "FLAT_RATE",
  TIERED = "TIERED",
  PERCENTAGE = "PERCENTAGE",
  FORMULA = "FORMULA",
}

export enum BaseMetric {
  REVENUE = "REVENUE",
  GROSS_MARGIN = "GROSS_MARGIN",
  NET_PROFIT = "NET_PROFIT",
  QUANTITY = "QUANTITY",
}

export enum PartnerType {
  EMPLOYEE = "EMPLOYEE",
  AGENT = "AGENT",
  RESELLER = "RESELLER",
  AFFILIATE = "AFFILIATE",
}

export enum CommissionStatus {
  CALCULATED = "CALCULATED",
  ACCRUED = "ACCRUED",
  APPROVED = "APPROVED",
  SETTLED = "SETTLED",
  CLAWED_BACK = "CLAWED_BACK",
}

export enum StatementStatus {
  DRAFT = "DRAFT",
  GENERATED = "GENERATED",
  APPROVED = "APPROVED",
  PAID = "PAID",
}

// ---------------------------------------------------------------------------
// Tier definition (used inside CommissionPlan.tiers JSONB column)
// ---------------------------------------------------------------------------

export interface CommissionTier {
  /** Lower bound of the tier (inclusive) */
  from: number;
  /** Upper bound of the tier (exclusive, undefined = unbounded) */
  to?: number;
  /** Rate or flat amount applied within this tier */
  rate: number;
  /** Whether the rate is a percentage (true) or a flat amount (false) */
  isPercentage: boolean;
}

// ---------------------------------------------------------------------------
// Domain entities
// ---------------------------------------------------------------------------

export interface CommissionPlan {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  planType: PlanType;
  baseMetric: BaseMetric;
  tiers: CommissionTier[] | null;
  formula: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  clawbackWindowDays: number;
  clawbackTriggers: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionAssignment {
  id: string;
  tenantId: string;
  entityCode: string;
  partnerId: string;
  partnerType: PartnerType;
  planId: string;
  splitPct: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionCalculation {
  id: string;
  tenantId: string;
  entityCode: string;
  partnerId: string;
  planId: string;
  txnId: string | null;
  docId: string | null;
  baseAmount: string;
  commissionRate: string;
  commissionAmount: string;
  currencyCode: string;
  splitPct: string;
  status: CommissionStatus;
  accrualJeId: string | null;
  settlementJeId: string | null;
  clawbackJeId: string | null;
  clawbackReason: string | null;
  calculatedAt: Date;
  accruedAt: Date | null;
  approvedAt: Date | null;
  settledAt: Date | null;
  clawedBackAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionStatement {
  id: string;
  tenantId: string;
  entityCode: string;
  partnerId: string;
  periodStart: Date;
  periodEnd: Date;
  totalCalculated: string;
  totalAccrued: string;
  totalSettled: string;
  totalClawedBack: string;
  netPayable: string;
  currencyCode: string;
  status: StatementStatus;
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Input / output DTOs
// ---------------------------------------------------------------------------

export interface CalculateCommissionInput {
  tenantId: string;
  entityCode: string;
  partnerId: string;
  planId: string;
  txnId?: string;
  docId?: string;
  baseAmount: number;
  currencyCode?: string;
}

export interface AccrueCommissionInput {
  calculationId: string;
  accrualJeId: string;
}

export interface SettleCommissionInput {
  calculationId: string;
  settlementJeId: string;
}

export interface ClawbackCommissionInput {
  calculationId: string;
  clawbackJeId: string;
  reason: string;
}

export interface GenerateStatementInput {
  tenantId: string;
  entityCode: string;
  partnerId: string;
  periodStart: Date;
  periodEnd: Date;
  currencyCode?: string;
}

export interface CalculationResult {
  commissionAmount: number;
  effectiveRate: number;
}

// ---------------------------------------------------------------------------
// Create / Update DTOs
// ---------------------------------------------------------------------------

export interface CreatePlanInput {
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  planType: PlanType;
  baseMetric: BaseMetric;
  tiers?: CommissionTier[];
  formula?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
  clawbackWindowDays?: number;
  clawbackTriggers?: string[];
}

export interface UpdatePlanInput {
  name?: string;
  tiers?: CommissionTier[];
  formula?: string;
  effectiveTo?: Date;
  clawbackWindowDays?: number;
  clawbackTriggers?: string[];
  isActive?: boolean;
}

export interface CreateAssignmentInput {
  tenantId: string;
  entityCode: string;
  partnerId: string;
  partnerType: PartnerType;
  planId: string;
  splitPct?: string;
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface UpdateAssignmentInput {
  splitPct?: string;
  effectiveTo?: Date;
}
