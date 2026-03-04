// framework/runtime/src/services/business/engines/tax-engine/persistence/tax-jurisdiction-repo.ts

import type { TaxJurisdiction, CreateTaxJurisdictionInput } from "../domain/types.js";

export interface TaxJurisdictionRepo {
    create(input: CreateTaxJurisdictionInput): Promise<TaxJurisdiction>;
    getById(tenantId: string, id: string): Promise<TaxJurisdiction | null>;
    getByCode(tenantId: string, code: string): Promise<TaxJurisdiction | null>;
    list(tenantId: string, filters?: { countryCode?: string; isActive?: boolean }): Promise<TaxJurisdiction[]>;
    getChildren(tenantId: string, parentId: string): Promise<TaxJurisdiction[]>;
    deactivate(tenantId: string, id: string): Promise<void>;
}
