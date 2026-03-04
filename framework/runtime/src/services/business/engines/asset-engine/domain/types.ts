// ============================================================
// Asset Engine — Domain Types
// Athyper v2.1 Business Operating Platform — Phase 2
// ============================================================

// ── Enums ────────────────────────────────────────────────────

export const AssetClass = {
  LAND: "LAND",
  BUILDING: "BUILDING",
  MACHINERY: "MACHINERY",
  VEHICLE: "VEHICLE",
  FURNITURE: "FURNITURE",
  IT_EQUIPMENT: "IT_EQUIPMENT",
  INTANGIBLE: "INTANGIBLE",
  LEASED: "LEASED",
} as const;
export type AssetClass = (typeof AssetClass)[keyof typeof AssetClass];

export const AssetStatus = {
  WIP: "WIP",
  CAPITALIZED: "CAPITALIZED",
  ACTIVE: "ACTIVE",
  IMPAIRED: "IMPAIRED",
  RETIRED: "RETIRED",
  DISPOSED: "DISPOSED",
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const BookType = {
  STATUTORY: "STATUTORY",
  TAX: "TAX",
  MANAGEMENT: "MANAGEMENT",
  INSURANCE: "INSURANCE",
} as const;
export type BookType = (typeof BookType)[keyof typeof BookType];

export const DepreciationMethod = {
  STRAIGHT_LINE: "STRAIGHT_LINE",
  REDUCING_BALANCE: "REDUCING_BALANCE",
  UNITS_OF_PRODUCTION: "UNITS_OF_PRODUCTION",
  ACCELERATED: "ACCELERATED",
  MACRS: "MACRS",
} as const;
export type DepreciationMethod =
  (typeof DepreciationMethod)[keyof typeof DepreciationMethod];

export const AssetTxnType = {
  CAPITALIZE: "CAPITALIZE",
  DEPRECIATE: "DEPRECIATE",
  REVALUE_UP: "REVALUE_UP",
  REVALUE_DOWN: "REVALUE_DOWN",
  IMPAIR: "IMPAIR",
  TRANSFER: "TRANSFER",
  RETIRE: "RETIRE",
  DISPOSE: "DISPOSE",
} as const;
export type AssetTxnType = (typeof AssetTxnType)[keyof typeof AssetTxnType];

export const DepreciationRunStatus = {
  PLANNED: "PLANNED",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
export type DepreciationRunStatus =
  (typeof DepreciationRunStatus)[keyof typeof DepreciationRunStatus];

// ── Entity Interfaces ────────────────────────────────────────

export interface Asset {
  id: string;
  tenantId: string;
  entityCode: string;
  assetNumber: string;
  name: string;
  description: string | null;
  assetClass: AssetClass;
  status: AssetStatus;
  acquisitionDate: string; // ISO date
  acquisitionCost: string; // decimal as string for precision
  currencyCode: string;
  residualValue: string;
  usefulLifeMonths: number;
  ouId: string | null;
  costCenterId: string | null;
  location: string | null;
  vendorId: string | null;
  commitmentId: string | null;
  capitalizedFromWip: boolean;
  parentAssetId: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface AssetBook {
  id: string;
  tenantId: string;
  assetId: string;
  bookType: BookType;
  depreciationMethod: DepreciationMethod;
  usefulLifeMonths: number;
  residualValue: string;
  costBasis: string;
  accumulatedDepreciation: string;
  netBookValue: string; // generated column
  lastDepreciationDate: string | null;
  nextDepreciationDate: string | null;
  currencyCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetTransaction {
  id: string;
  tenantId: string;
  assetId: string;
  bookType: BookType;
  txnType: AssetTxnType;
  amount: string;
  currencyCode: string;
  fromValues: Record<string, unknown> | null;
  toValues: Record<string, unknown> | null;
  referenceJeId: string | null;
  performedBy: string;
  performedAt: string;
  notes: string | null;
}

export interface DepreciationRun {
  id: string;
  tenantId: string;
  entityCode: string;
  bookType: BookType;
  fiscalYear: number;
  periodNumber: number;
  status: DepreciationRunStatus;
  assetCount: number;
  totalAmount: string;
  startedAt: string | null;
  completedAt: string | null;
  runBy: string;
  createdAt: string;
  updatedAt: string;
}

// ── Create / Update Inputs ───────────────────────────────────

export interface CreateAssetInput {
  tenantId: string;
  entityCode: string;
  assetNumber: string;
  name: string;
  description?: string | null;
  assetClass: AssetClass;
  acquisitionDate: string;
  acquisitionCost: string;
  currencyCode?: string;
  residualValue?: string;
  usefulLifeMonths: number;
  ouId?: string | null;
  costCenterId?: string | null;
  location?: string | null;
  vendorId?: string | null;
  commitmentId?: string | null;
  parentAssetId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateAssetInput {
  name?: string;
  description?: string | null;
  location?: string | null;
  ouId?: string | null;
  costCenterId?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CreateAssetBookInput {
  tenantId: string;
  assetId: string;
  bookType: BookType;
  depreciationMethod: DepreciationMethod;
  usefulLifeMonths: number;
  residualValue?: string;
  costBasis: string;
  currencyCode?: string;
  nextDepreciationDate?: string | null;
}

export interface UpdateAssetBookInput {
  depreciationMethod?: DepreciationMethod;
  usefulLifeMonths?: number;
  residualValue?: string;
  nextDepreciationDate?: string | null;
}

export interface RecordAssetTransactionInput {
  tenantId: string;
  assetId: string;
  bookType: BookType;
  txnType: AssetTxnType;
  amount: string;
  currencyCode?: string;
  fromValues?: Record<string, unknown> | null;
  toValues?: Record<string, unknown> | null;
  referenceJeId?: string | null;
  performedBy: string;
  notes?: string | null;
}

export interface CreateDepreciationRunInput {
  tenantId: string;
  entityCode: string;
  bookType: BookType;
  fiscalYear: number;
  periodNumber: number;
  runBy: string;
}

// ── Query Filters ────────────────────────────────────────────

export interface AssetFilter {
  tenantId: string;
  entityCode?: string;
  status?: AssetStatus | AssetStatus[];
  assetClass?: AssetClass | AssetClass[];
  ouId?: string;
  costCenterId?: string;
  parentAssetId?: string | null;
}

export interface AssetBookFilter {
  tenantId: string;
  assetId?: string;
  bookType?: BookType;
}

export interface AssetTransactionFilter {
  tenantId: string;
  assetId?: string;
  bookType?: BookType;
  txnType?: AssetTxnType;
}

export interface DepreciationRunFilter {
  tenantId: string;
  entityCode?: string;
  bookType?: BookType;
  fiscalYear?: number;
  status?: DepreciationRunStatus;
}
