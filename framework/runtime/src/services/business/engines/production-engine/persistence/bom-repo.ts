// framework/runtime/src/services/business/engines/production-engine/persistence/bom-repo.ts

import type { BillOfMaterials, BomLine, CreateBomInput, BomStatus } from "../domain/types.js";

export interface BomRepo {
    create(input: CreateBomInput): Promise<BillOfMaterials>;
    getById(tenantId: string, id: string): Promise<BillOfMaterials | null>;
    getActiveForProduct(tenantId: string, entityCode: string, productId: string): Promise<BillOfMaterials | null>;
    updateStatus(tenantId: string, id: string, status: BomStatus): Promise<BillOfMaterials>;
    getLines(tenantId: string, bomId: string): Promise<BomLine[]>;
    getLinesByProductId(tenantId: string, productId: string): Promise<BomLine[]>;
}
