// framework/runtime/src/services/business/engines/ou-intent/domain/types.ts

/**
 * Operating Unit + Business Intent domain types.
 */

// --- Operating Unit ---

export type OUStatus =
  | "DRAFT"
  | "ACTIVE"
  | "UNDER_REVIEW"
  | "SUNSET"
  | "ARCHIVED";

export interface OperatingUnit {
  id: string;
  tenantId: string;
  orgUnitId: string;
  entityCode: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  level: number;
  status: OUStatus;
  activatedAt: Date | null;
  sunsetAt: Date | null;
  archivedAt: Date | null;
  defaultFpId: string | null;
  defaultCostCenterId: string | null;
  defaultProfitCenterId: string | null;
  defaultCurrencyCode: string | null;
  inheritFromParent: boolean;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOperatingUnitInput {
  tenantId: string;
  orgUnitId: string;
  entityCode: string;
  code: string;
  name: string;
  description?: string;
  parentId?: string;
  level?: number;
  defaultCurrencyCode?: string;
  inheritFromParent?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateOperatingUnitInput {
  name?: string;
  description?: string;
  defaultFpId?: string | null;
  defaultCostCenterId?: string | null;
  defaultProfitCenterId?: string | null;
  defaultCurrencyCode?: string | null;
  inheritFromParent?: boolean;
  metadata?: Record<string, unknown>;
}

// --- Business Intent ---

export type IntentDomain =
  | "OPEX"
  | "CAPEX"
  | "REVENUE"
  | "TRANSFER"
  | "REGULATORY"
  | "ADMIN";
export type IntentVisibility = "STANDARD" | "RESTRICTED" | "CONFIDENTIAL";

export interface BusinessIntent {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  domain: IntentDomain;
  subtype: string | null;
  parentId: string | null;
  requiresApproval: boolean;
  maxAutoApproveAmount: string | null;
  maxAutoApproveCurrency: string | null;
  visibility: IntentVisibility;
  defaultGlAccount: string | null;
  defaultTaxCode: string | null;
  defaultAssetProfileCode: string | null;
  defaultAccountingProfileCode: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBusinessIntentInput {
  tenantId: string;
  code: string;
  name: string;
  description?: string;
  domain: IntentDomain;
  subtype?: string;
  parentId?: string;
  requiresApproval?: boolean;
  maxAutoApproveAmount?: string;
  maxAutoApproveCurrency?: string;
  visibility?: IntentVisibility;
  defaultGlAccount?: string;
  defaultTaxCode?: string;
  defaultAssetProfileCode?: string;
  defaultAccountingProfileCode?: string;
}

// --- OU-Intent Mapping ---

export interface OUIntentMapping {
  id: string;
  tenantId: string;
  ouId: string;
  intentId: string;
  isDefault: boolean;
  overrideFpId: string | null;
  createdAt: Date;
}

export interface CreateOUIntentMappingInput {
  tenantId: string;
  ouId: string;
  intentId: string;
  isDefault?: boolean;
  overrideFpId?: string;
}

// --- OU Lifecycle Transitions ---

export const OU_TRANSITIONS: Record<OUStatus, OUStatus[]> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["UNDER_REVIEW", "SUNSET"],
  UNDER_REVIEW: ["ACTIVE", "SUNSET"],
  SUNSET: ["ARCHIVED", "ACTIVE"],
  ARCHIVED: [],
};

// --- Resolved Defaults (after inheritance) ---

export interface ResolvedOUDefaults {
  fpId: string | null;
  costCenterId: string | null;
  profitCenterId: string | null;
  currencyCode: string | null;
}
