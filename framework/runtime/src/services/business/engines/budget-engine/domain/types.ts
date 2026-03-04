// framework/runtime/src/services/business/engines/budget-engine/domain/types.ts

// --- Funding Profile ---

export type FPLevel = 1 | 2 | 3 | 4; // Enterprise | Division | OU | Intent
export type FPStatus = "DRAFT" | "ACTIVE" | "FROZEN" | "CLOSED";
export type HealthStatus = "GREEN" | "YELLOW" | "RED" | "BLACK";
export type Trend = "IMPROVING" | "STABLE" | "DETERIORATING";
export type FundAction = "RESERVE" | "COMMIT" | "CONSUME" | "RELEASE";
export type CarryForwardRule = "NONE" | "PARTIAL" | "FULL";
export type TransferStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";

export interface FundingProfile {
  id: string;
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  description: string | null;
  level: FPLevel;
  parentId: string | null;
  ouId: string | null;
  intentId: string | null;
  totalLimit: string;
  currencyCode: string;
  reservedAmount: string;
  committedAmount: string;
  consumedAmount: string;
  releasedAmount: string;
  healthStatus: HealthStatus;
  utilizationPct: string;
  trend: Trend;
  predictedExhaustionDate: Date | null;
  lastReforecastAt: Date | null;
  fiscalYear: number;
  isMultiYear: boolean;
  carryForwardRule: CarryForwardRule;
  carryForwardCap: string | null;
  status: FPStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFundingProfileInput {
  tenantId: string;
  entityCode: string;
  code: string;
  name: string;
  description?: string;
  level: FPLevel;
  parentId?: string;
  ouId?: string;
  intentId?: string;
  totalLimit: string;
  currencyCode: string;
  fiscalYear: number;
  isMultiYear?: boolean;
  carryForwardRule?: CarryForwardRule;
  carryForwardCap?: string;
}

// --- Funding Transaction ---

export interface FundingTransaction {
  id: string;
  tenantId: string;
  fpId: string;
  txnId: string;
  action: FundAction;
  amount: string;
  currencyCode: string;
  previousState: FPStateSnapshot;
  resultingState: FPStateSnapshot;
  reason: string | null;
  performedBy: string;
  performedAt: Date;
  expiresAt: Date | null;
  idempotencyKey: string | null;
}

export interface FPStateSnapshot {
  reservedAmount: string;
  committedAmount: string;
  consumedAmount: string;
  releasedAmount: string;
  healthStatus: HealthStatus;
  utilizationPct: string;
}

export interface FundActionInput {
  fpId: string;
  txnId: string;
  action: FundAction;
  amount: string;
  currencyCode: string;
  reason?: string;
  performedBy: string;
  idempotencyKey?: string;
  expiresAt?: Date;
}

// --- Funding Transfer ---

export interface FundingTransfer {
  id: string;
  tenantId: string;
  fromFpId: string;
  toFpId: string;
  amount: string;
  currencyCode: string;
  reason: string;
  status: TransferStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
}

export interface CreateTransferInput {
  tenantId: string;
  fromFpId: string;
  toFpId: string;
  amount: string;
  currencyCode: string;
  reason: string;
}

// --- Health Thresholds ---

export interface HealthThresholds {
  yellowAt: number; // utilization % to go YELLOW (default 75)
  redAt: number; // utilization % to go RED (default 90)
  blackAt: number; // utilization % to go BLACK (default 100)
}

export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  yellowAt: 75,
  redAt: 90,
  blackAt: 100,
};

// --- Available Balance ---

export interface AvailableBalance {
  totalLimit: string;
  reservedAmount: string;
  committedAmount: string;
  consumedAmount: string;
  releasedAmount: string;
  /** totalLimit - reservedAmount - committedAmount - consumedAmount + releasedAmount */
  available: string;
  utilizationPct: string;
  healthStatus: HealthStatus;
}
