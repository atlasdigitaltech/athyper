// framework/runtime/src/services/business/engines/posting-engine/persistence/chart-of-accounts-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base";
import type {
  ChartOfAccounts,
  CreateAccountInput,
  AccountType,
} from "../domain/types";

export interface ChartOfAccountsRepo {
  create(input: CreateAccountInput): Promise<ChartOfAccounts>;
  getById(tenantId: string, id: string): Promise<ChartOfAccounts | null>;
  getByCode(
    tenantId: string,
    entityCode: string,
    accountCode: string,
  ): Promise<ChartOfAccounts | null>;
  update(
    tenantId: string,
    id: string,
    input: Partial<CreateAccountInput>,
  ): Promise<ChartOfAccounts>;
  list(
    tenantId: string,
    filters: {
      entityCode?: string;
      accountType?: AccountType;
      isActive?: boolean;
      isGroup?: boolean;
      subledgerType?: string;
      parentId?: string | null;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<ChartOfAccounts>>;
  getChildren(tenantId: string, parentId: string): Promise<ChartOfAccounts[]>;
}
