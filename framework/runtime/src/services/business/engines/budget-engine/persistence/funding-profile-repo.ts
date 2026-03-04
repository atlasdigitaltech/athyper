// framework/runtime/src/services/business/engines/budget-engine/persistence/funding-profile-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  FundingProfile,
  CreateFundingProfileInput,
  FPStatus,
  HealthStatus,
  FPStateSnapshot,
} from "../domain/types.js";

/**
 * Funding Profile Repository.
 */
export interface FundingProfileRepo {
  create(input: CreateFundingProfileInput): Promise<FundingProfile>;
  getById(tenantId: string, id: string): Promise<FundingProfile | null>;
  getByCode(
    tenantId: string,
    entityCode: string,
    code: string,
    fiscalYear: number,
  ): Promise<FundingProfile | null>;

  /** Update amounts and health after a fund action */
  updateState(
    tenantId: string,
    id: string,
    state: FPStateSnapshot,
  ): Promise<FundingProfile>;

  /** Update status */
  updateStatus(
    tenantId: string,
    id: string,
    status: FPStatus,
  ): Promise<FundingProfile>;

  /** Update health and trend */
  updateHealth(
    tenantId: string,
    id: string,
    health: {
      healthStatus: HealthStatus;
      utilizationPct: string;
      trend: string;
      predictedExhaustionDate?: Date | null;
      lastReforecastAt?: Date;
    },
  ): Promise<FundingProfile>;

  /** List with filters */
  list(
    tenantId: string,
    filters: {
      entityCode?: string;
      fiscalYear?: number;
      level?: number;
      status?: FPStatus;
      healthStatus?: HealthStatus;
      parentId?: string | null;
      ouId?: string;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<FundingProfile>>;

  /** Get all children of a FP */
  getChildren(tenantId: string, parentId: string): Promise<FundingProfile[]>;

  /** Get all ancestors */
  getAncestors(tenantId: string, id: string): Promise<FundingProfile[]>;

  /** Lock a FP for update (SELECT FOR UPDATE) */
  lockForUpdate(tenantId: string, id: string): Promise<FundingProfile | null>;
}
