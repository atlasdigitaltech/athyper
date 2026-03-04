// framework/runtime/src/services/business/engines/ou-intent/services/operating-unit-service.ts

import { ok, fail } from "../../shared/engine-base.js";
import { resolveDefaults } from "../domain/inheritance-resolver.js";
import {
  isValidOUTransition,
  getTimestampsForTransition,
} from "../domain/ou-lifecycle.js";

import type {
  ServiceResult,
  PaginationParams,
  PaginatedResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  OperatingUnit,
  CreateOperatingUnitInput,
  UpdateOperatingUnitInput,
  OUStatus,
  ResolvedOUDefaults,
} from "../domain/types.js";
import type { OperatingUnitRepo } from "../persistence/operating-unit-repo.js";

/**
 * Operating Unit Service — manages OU lifecycle and hierarchy.
 */
export interface OperatingUnitService {
  create(
    ctx: OperationContext,
    input: CreateOperatingUnitInput,
  ): Promise<ServiceResult<OperatingUnit>>;
  getById(tenantId: string, id: string): Promise<OperatingUnit | null>;
  getByCode(
    tenantId: string,
    entityCode: string,
    code: string,
  ): Promise<OperatingUnit | null>;
  update(
    ctx: OperationContext,
    id: string,
    input: UpdateOperatingUnitInput,
  ): Promise<ServiceResult<OperatingUnit>>;
  transition(
    ctx: OperationContext,
    id: string,
    targetStatus: OUStatus,
  ): Promise<ServiceResult<OperatingUnit>>;
  list(
    tenantId: string,
    filters: {
      entityCode?: string;
      status?: OUStatus;
      parentId?: string | null;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<OperatingUnit>>;
  resolveDefaults(
    tenantId: string,
    ouId: string,
  ): Promise<ServiceResult<ResolvedOUDefaults>>;
  getHierarchy(tenantId: string, rootId: string): Promise<OperatingUnit[]>;
}

export class DefaultOperatingUnitService implements OperatingUnitService {
  constructor(private readonly repo: OperatingUnitRepo) {}

  async create(
    ctx: OperationContext,
    input: CreateOperatingUnitInput,
  ): Promise<ServiceResult<OperatingUnit>> {
    // Validate parent exists if specified
    if (input.parentId) {
      const parent = await this.repo.getById(ctx.tenantId, input.parentId);
      if (!parent) {
        return fail(
          "OU_PARENT_NOT_FOUND",
          `Parent OU ${input.parentId} not found`,
        );
      }
      if (parent.status !== "ACTIVE") {
        return fail(
          "OU_PARENT_INACTIVE",
          `Parent OU must be ACTIVE, currently ${parent.status}`,
        );
      }
      // Check max depth (3 levels)
      const level = input.level ?? parent.level + 1;
      if (level > 3) {
        return fail("OU_MAX_DEPTH", "Operating units are limited to 3 levels");
      }
    }

    // Check code uniqueness
    const existing = await this.repo.getByCode(
      ctx.tenantId,
      input.entityCode,
      input.code,
    );
    if (existing) {
      return fail(
        "OU_CODE_EXISTS",
        `OU code "${input.code}" already exists for entity ${input.entityCode}`,
      );
    }

    const ou = await this.repo.create(input);
    return ok(ou);
  }

  async getById(tenantId: string, id: string): Promise<OperatingUnit | null> {
    return this.repo.getById(tenantId, id);
  }

  async getByCode(
    tenantId: string,
    entityCode: string,
    code: string,
  ): Promise<OperatingUnit | null> {
    return this.repo.getByCode(tenantId, entityCode, code);
  }

  async update(
    ctx: OperationContext,
    id: string,
    input: UpdateOperatingUnitInput,
  ): Promise<ServiceResult<OperatingUnit>> {
    const ou = await this.repo.getById(ctx.tenantId, id);
    if (!ou) {
      return fail("OU_NOT_FOUND", `Operating unit ${id} not found`);
    }
    if (ou.status === "ARCHIVED") {
      return fail("OU_ARCHIVED", "Cannot update an archived operating unit");
    }

    const updated = await this.repo.update(ctx.tenantId, id, input);
    return ok(updated);
  }

  async transition(
    ctx: OperationContext,
    id: string,
    targetStatus: OUStatus,
  ): Promise<ServiceResult<OperatingUnit>> {
    const ou = await this.repo.getById(ctx.tenantId, id);
    if (!ou) {
      return fail("OU_NOT_FOUND", `Operating unit ${id} not found`);
    }

    if (!isValidOUTransition(ou.status, targetStatus)) {
      return fail(
        "OU_INVALID_TRANSITION",
        `Cannot transition from ${ou.status} to ${targetStatus}`,
      );
    }

    // If sunsetting, check no active children
    if (targetStatus === "SUNSET") {
      const children = await this.repo.getChildren(ctx.tenantId, id);
      const activeChildren = children.filter((c) => c.status === "ACTIVE");
      if (activeChildren.length > 0) {
        return fail(
          "OU_HAS_ACTIVE_CHILDREN",
          `Cannot sunset OU with ${activeChildren.length} active children`,
        );
      }
    }

    const timestamps = getTimestampsForTransition(targetStatus);
    const updated = await this.repo.updateStatus(
      ctx.tenantId,
      id,
      targetStatus,
      timestamps,
    );
    return ok(updated);
  }

  async list(
    tenantId: string,
    filters: {
      entityCode?: string;
      status?: OUStatus;
      parentId?: string | null;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<OperatingUnit>> {
    return this.repo.list(tenantId, filters, pagination);
  }

  async resolveDefaults(
    tenantId: string,
    ouId: string,
  ): Promise<ServiceResult<ResolvedOUDefaults>> {
    const ou = await this.repo.getById(tenantId, ouId);
    if (!ou) {
      return fail("OU_NOT_FOUND", `Operating unit ${ouId} not found`);
    }

    const ancestors = await this.repo.getAncestors(tenantId, ouId);
    const defaults = resolveDefaults(ou, ancestors);
    return ok(defaults);
  }

  async getHierarchy(
    tenantId: string,
    rootId: string,
  ): Promise<OperatingUnit[]> {
    return this.repo.getSubtree(tenantId, rootId);
  }
}
