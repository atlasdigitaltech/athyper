// framework/runtime/src/services/business/engines/posting-engine/persistence/fiscal-period-repo.ts

import type { FiscalPeriod, PeriodStatus } from "../domain/types.js";

export interface FiscalPeriodRepo {
  create(
    input: Omit<
      FiscalPeriod,
      | "id"
      | "createdAt"
      | "openedAt"
      | "softClosedAt"
      | "hardClosedAt"
      | "closedBy"
    >,
  ): Promise<FiscalPeriod>;
  getById(tenantId: string, id: string): Promise<FiscalPeriod | null>;
  getByYearPeriod(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
    periodNumber: number,
  ): Promise<FiscalPeriod | null>;
  updateStatus(
    tenantId: string,
    id: string,
    status: PeriodStatus,
    timestamps: Record<string, Date | null>,
    closedBy?: string,
  ): Promise<FiscalPeriod>;
  listByYear(
    tenantId: string,
    entityCode: string,
    fiscalYear: number,
  ): Promise<FiscalPeriod[]>;
  getByDateRange(
    tenantId: string,
    entityCode: string,
    startDate: Date,
    endDate: Date,
  ): Promise<FiscalPeriod[]>;
  /** Get period containing a specific date */
  getForDate(
    tenantId: string,
    entityCode: string,
    date: Date,
  ): Promise<FiscalPeriod | null>;
}
