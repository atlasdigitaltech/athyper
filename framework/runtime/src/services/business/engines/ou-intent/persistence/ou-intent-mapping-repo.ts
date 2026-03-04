// framework/runtime/src/services/business/engines/ou-intent/persistence/ou-intent-mapping-repo.ts

import type { OUIntentMapping, CreateOUIntentMappingInput } from "../domain/types.js";

/**
 * OU-Intent Mapping Repository.
 */
export interface OUIntentMappingRepo {
    /** Create a new mapping */
    create(input: CreateOUIntentMappingInput): Promise<OUIntentMapping>;

    /** Get a mapping by ID */
    getById(tenantId: string, id: string): Promise<OUIntentMapping | null>;

    /** Get all mappings for an OU */
    getByOuId(tenantId: string, ouId: string): Promise<OUIntentMapping[]>;

    /** Get all mappings for an intent */
    getByIntentId(tenantId: string, intentId: string): Promise<OUIntentMapping[]>;

    /** Get default intent for an OU */
    getDefaultForOu(tenantId: string, ouId: string): Promise<OUIntentMapping | null>;

    /** Remove a mapping */
    remove(tenantId: string, ouId: string, intentId: string): Promise<void>;

    /** Update default flag (only one default per OU) */
    setDefault(tenantId: string, ouId: string, intentId: string): Promise<void>;

    /** Set override FP for a mapping */
    setOverrideFp(tenantId: string, ouId: string, intentId: string, fpId: string | null): Promise<void>;
}
