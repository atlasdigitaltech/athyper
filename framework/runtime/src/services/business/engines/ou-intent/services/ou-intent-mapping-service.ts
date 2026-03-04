// framework/runtime/src/services/business/engines/ou-intent/services/ou-intent-mapping-service.ts

import { ok, fail } from "../../shared/engine-base.js";

import type { ServiceResult, OperationContext } from "../../shared/engine-base.js";
import type { OUIntentMapping, CreateOUIntentMappingInput } from "../domain/types.js";
import type { BusinessIntentRepo } from "../persistence/business-intent-repo.js";
import type { OperatingUnitRepo } from "../persistence/operating-unit-repo.js";
import type { OUIntentMappingRepo } from "../persistence/ou-intent-mapping-repo.js";

/**
 * OU-Intent Mapping Service — manages which intents are available per OU.
 */
export interface OUIntentMappingService {
    assign(ctx: OperationContext, input: CreateOUIntentMappingInput): Promise<ServiceResult<OUIntentMapping>>;
    unassign(ctx: OperationContext, ouId: string, intentId: string): Promise<ServiceResult<void>>;
    listForOU(tenantId: string, ouId: string): Promise<OUIntentMapping[]>;
    setDefault(ctx: OperationContext, ouId: string, intentId: string): Promise<ServiceResult<void>>;
    getDefault(tenantId: string, ouId: string): Promise<OUIntentMapping | null>;
    setOverrideFp(ctx: OperationContext, ouId: string, intentId: string, fpId: string | null): Promise<ServiceResult<void>>;
}

export class DefaultOUIntentMappingService implements OUIntentMappingService {
    constructor(
        private readonly mappingRepo: OUIntentMappingRepo,
        private readonly ouRepo: OperatingUnitRepo,
        private readonly intentRepo: BusinessIntentRepo,
    ) {}

    async assign(ctx: OperationContext, input: CreateOUIntentMappingInput): Promise<ServiceResult<OUIntentMapping>> {
        // Validate OU exists and is active
        const ou = await this.ouRepo.getById(ctx.tenantId, input.ouId);
        if (!ou) {
            return fail("OU_NOT_FOUND", `Operating unit ${input.ouId} not found`);
        }
        if (ou.status !== "ACTIVE" && ou.status !== "DRAFT") {
            return fail("OU_NOT_ASSIGNABLE", `OU is ${ou.status}, must be DRAFT or ACTIVE`);
        }

        // Validate intent exists and is active
        const intent = await this.intentRepo.getById(ctx.tenantId, input.intentId);
        if (!intent) {
            return fail("INTENT_NOT_FOUND", `Intent ${input.intentId} not found`);
        }
        if (!intent.isActive) {
            return fail("INTENT_INACTIVE", "Cannot assign an inactive intent");
        }

        const mapping = await this.mappingRepo.create(input);
        return ok(mapping);
    }

    async unassign(ctx: OperationContext, ouId: string, intentId: string): Promise<ServiceResult<void>> {
        await this.mappingRepo.remove(ctx.tenantId, ouId, intentId);
        return ok(undefined);
    }

    async listForOU(tenantId: string, ouId: string): Promise<OUIntentMapping[]> {
        return this.mappingRepo.getByOuId(tenantId, ouId);
    }

    async setDefault(ctx: OperationContext, ouId: string, intentId: string): Promise<ServiceResult<void>> {
        // Verify mapping exists
        const mappings = await this.mappingRepo.getByOuId(ctx.tenantId, ouId);
        const exists = mappings.some((m) => m.intentId === intentId);
        if (!exists) {
            return fail("MAPPING_NOT_FOUND", `Intent ${intentId} is not assigned to OU ${ouId}`);
        }

        await this.mappingRepo.setDefault(ctx.tenantId, ouId, intentId);
        return ok(undefined);
    }

    async getDefault(tenantId: string, ouId: string): Promise<OUIntentMapping | null> {
        return this.mappingRepo.getDefaultForOu(tenantId, ouId);
    }

    async setOverrideFp(ctx: OperationContext, ouId: string, intentId: string, fpId: string | null): Promise<ServiceResult<void>> {
        await this.mappingRepo.setOverrideFp(ctx.tenantId, ouId, intentId, fpId);
        return ok(undefined);
    }
}
