// framework/runtime/src/services/business/engines/ou-intent/persistence/business-intent-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  BusinessIntent,
  CreateBusinessIntentInput,
  IntentDomain,
} from "../domain/types.js";

/**
 * Business Intent Repository.
 */
export interface BusinessIntentRepo {
  /** Create a new business intent */
  create(input: CreateBusinessIntentInput): Promise<BusinessIntent>;

  /** Get an intent by ID */
  getById(tenantId: string, id: string): Promise<BusinessIntent | null>;

  /** Get an intent by code */
  getByCode(tenantId: string, code: string): Promise<BusinessIntent | null>;

  /** Update an intent */
  update(
    tenantId: string,
    id: string,
    input: Partial<CreateBusinessIntentInput>,
  ): Promise<BusinessIntent>;

  /** List intents with optional filters */
  list(
    tenantId: string,
    filters: {
      domain?: IntentDomain;
      isActive?: boolean;
      parentId?: string | null;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<BusinessIntent>>;

  /** Get all children of an intent (for hierarchy) */
  getChildren(tenantId: string, parentId: string): Promise<BusinessIntent[]>;

  /** Soft-delete (deactivate) an intent */
  deactivate(tenantId: string, id: string): Promise<void>;
}
