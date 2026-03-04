// framework/runtime/src/services/business/engines/federation-engine/persistence/legal-entity-repo.ts

import type { LegalEntity, CreateLegalEntityInput, EntityType } from "../domain/types.js";

export interface LegalEntityRepo {
    create(input: CreateLegalEntityInput): Promise<LegalEntity>;
    getById(tenantId: string, id: string): Promise<LegalEntity | null>;
    getByCode(tenantId: string, code: string): Promise<LegalEntity | null>;
    list(tenantId: string, filters?: { entityType?: EntityType; isActive?: boolean }): Promise<LegalEntity[]>;
    getChildren(tenantId: string, parentEntityId: string): Promise<LegalEntity[]>;
    update(tenantId: string, id: string, input: Partial<CreateLegalEntityInput>): Promise<LegalEntity>;
}
