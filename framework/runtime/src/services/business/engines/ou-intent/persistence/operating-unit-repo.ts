// framework/runtime/src/services/business/engines/ou-intent/persistence/operating-unit-repo.ts

import type { PaginationParams, PaginatedResult } from "../../shared/engine-base.js";
import type { OperatingUnit, CreateOperatingUnitInput, UpdateOperatingUnitInput, OUStatus } from "../domain/types.js";

/**
 * Operating Unit Repository.
 */
export interface OperatingUnitRepo {
    /** Create a new operating unit */
    create(input: CreateOperatingUnitInput): Promise<OperatingUnit>;

    /** Get an OU by ID */
    getById(tenantId: string, id: string): Promise<OperatingUnit | null>;

    /** Get an OU by code */
    getByCode(tenantId: string, entityCode: string, code: string): Promise<OperatingUnit | null>;

    /** Update an OU */
    update(tenantId: string, id: string, input: UpdateOperatingUnitInput): Promise<OperatingUnit>;

    /** Update OU status with timestamps */
    updateStatus(tenantId: string, id: string, status: OUStatus, timestamps: Record<string, Date | null>): Promise<OperatingUnit>;

    /** List OUs for a tenant with optional filters */
    list(tenantId: string, filters: {
        entityCode?: string;
        status?: OUStatus;
        parentId?: string | null;
    }, pagination: PaginationParams): Promise<PaginatedResult<OperatingUnit>>;

    /** Get all ancestors of an OU (for inheritance resolution) */
    getAncestors(tenantId: string, id: string): Promise<OperatingUnit[]>;

    /** Get all children of an OU */
    getChildren(tenantId: string, parentId: string): Promise<OperatingUnit[]>;

    /** Get the full hierarchy tree rooted at an OU */
    getSubtree(tenantId: string, rootId: string): Promise<OperatingUnit[]>;
}
