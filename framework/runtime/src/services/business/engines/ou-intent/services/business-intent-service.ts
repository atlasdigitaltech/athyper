// framework/runtime/src/services/business/engines/ou-intent/services/business-intent-service.ts

import { ok, fail } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  PaginationParams,
  PaginatedResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  BusinessIntent,
  CreateBusinessIntentInput,
  IntentDomain,
} from "../domain/types.js";
import type { BusinessIntentRepo } from "../persistence/business-intent-repo.js";

/**
 * Business Intent Service — manages the intent ontology.
 */
export interface BusinessIntentService {
  create(
    ctx: OperationContext,
    input: CreateBusinessIntentInput,
  ): Promise<ServiceResult<BusinessIntent>>;
  getById(tenantId: string, id: string): Promise<BusinessIntent | null>;
  getByCode(tenantId: string, code: string): Promise<BusinessIntent | null>;
  update(
    ctx: OperationContext,
    id: string,
    input: Partial<CreateBusinessIntentInput>,
  ): Promise<ServiceResult<BusinessIntent>>;
  list(
    tenantId: string,
    filters: { domain?: IntentDomain; isActive?: boolean },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<BusinessIntent>>;
  deactivate(ctx: OperationContext, id: string): Promise<ServiceResult<void>>;
}

export class DefaultBusinessIntentService implements BusinessIntentService {
  constructor(private readonly repo: BusinessIntentRepo) {}

  async create(
    ctx: OperationContext,
    input: CreateBusinessIntentInput,
  ): Promise<ServiceResult<BusinessIntent>> {
    // Check code uniqueness
    const existing = await this.repo.getByCode(ctx.tenantId, input.code);
    if (existing) {
      return fail(
        "INTENT_CODE_EXISTS",
        `Intent code "${input.code}" already exists`,
      );
    }

    // Validate parent exists if specified
    if (input.parentId) {
      const parent = await this.repo.getById(ctx.tenantId, input.parentId);
      if (!parent) {
        return fail(
          "INTENT_PARENT_NOT_FOUND",
          `Parent intent ${input.parentId} not found`,
        );
      }
    }

    const intent = await this.repo.create(input);
    return ok(intent);
  }

  async getById(tenantId: string, id: string): Promise<BusinessIntent | null> {
    return this.repo.getById(tenantId, id);
  }

  async getByCode(
    tenantId: string,
    code: string,
  ): Promise<BusinessIntent | null> {
    return this.repo.getByCode(tenantId, code);
  }

  async update(
    ctx: OperationContext,
    id: string,
    input: Partial<CreateBusinessIntentInput>,
  ): Promise<ServiceResult<BusinessIntent>> {
    const existing = await this.repo.getById(ctx.tenantId, id);
    if (!existing) {
      return fail("INTENT_NOT_FOUND", `Intent ${id} not found`);
    }
    if (!existing.isActive) {
      return fail("INTENT_INACTIVE", "Cannot update a deactivated intent");
    }

    const updated = await this.repo.update(ctx.tenantId, id, input);
    return ok(updated);
  }

  async list(
    tenantId: string,
    filters: { domain?: IntentDomain; isActive?: boolean },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<BusinessIntent>> {
    return this.repo.list(tenantId, filters, pagination);
  }

  async deactivate(
    ctx: OperationContext,
    id: string,
  ): Promise<ServiceResult<void>> {
    const existing = await this.repo.getById(ctx.tenantId, id);
    if (!existing) {
      return fail("INTENT_NOT_FOUND", `Intent ${id} not found`);
    }

    // Check no child intents are active
    const children = await this.repo.getChildren(ctx.tenantId, id);
    const activeChildren = children.filter((c) => c.isActive);
    if (activeChildren.length > 0) {
      return fail(
        "INTENT_HAS_ACTIVE_CHILDREN",
        `Cannot deactivate intent with ${activeChildren.length} active children`,
      );
    }

    await this.repo.deactivate(ctx.tenantId, id);
    return ok(undefined);
  }
}
