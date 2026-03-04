// framework/runtime/src/services/business/engines/production-engine/domain/types.ts

// --- BOM ---

export type BomStatus = "DRAFT" | "ACTIVE" | "SUPERSEDED";
export type WorkOrderStatus = "PLANNED" | "RELEASED" | "IN_PROGRESS" | "COMPLETED" | "CLOSED";
export type CostType = "MATERIAL" | "LABOR" | "OVERHEAD";
export type VarianceType = "PRICE" | "USAGE" | "RATE" | "EFFICIENCY" | "VOLUME";

export interface BillOfMaterials {
    id: string;
    tenantId: string;
    entityCode: string;
    productId: string;
    version: number;
    status: BomStatus;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
}

export interface BomLine {
    id: string;
    tenantId: string;
    bomId: string;
    lineNo: number;
    componentProductId: string;
    quantityPer: string;
    uomCode: string | null;
    scrapPct: string;
    isPhantom: boolean;
}

export interface CreateBomInput {
    tenantId: string;
    entityCode: string;
    productId: string;
    version?: number;
    effectiveFrom?: Date;
    effectiveTo?: Date;
    lines: CreateBomLineInput[];
}

export interface CreateBomLineInput {
    componentProductId: string;
    quantityPer: string;
    uomCode?: string;
    scrapPct?: string;
    isPhantom?: boolean;
}

// --- Routing ---

export interface Routing {
    id: string;
    tenantId: string;
    entityCode: string;
    productId: string;
    operationSeq: number;
    operationName: string;
    workCenter: string | null;
    setupTimeHours: string | null;
    runTimeHours: string | null;
    laborRate: string | null;
    overheadRate: string | null;
    currencyCode: string | null;
}

// --- Work Order ---

export interface WorkOrder {
    id: string;
    tenantId: string;
    entityCode: string;
    woNumber: string;
    productId: string;
    bomId: string | null;
    plannedQty: string;
    completedQty: string;
    uomCode: string | null;
    status: WorkOrderStatus;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    actualStart: Date | null;
    actualEnd: Date | null;
    ouId: string | null;
    costCenterId: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateWorkOrderInput {
    tenantId: string;
    entityCode: string;
    productId: string;
    bomId?: string;
    plannedQty: string;
    uomCode?: string;
    plannedStart?: Date;
    plannedEnd?: Date;
    ouId?: string;
    costCenterId?: string;
}

// --- WO Cost ---

export interface WorkOrderCost {
    id: string;
    tenantId: string;
    workOrderId: string;
    costType: CostType;
    plannedAmount: string;
    actualAmount: string;
    variance: string;
    currencyCode: string;
    referenceJeId: string | null;
}

// --- Material Issue ---

export interface WorkOrderMaterialIssue {
    id: string;
    tenantId: string;
    workOrderId: string;
    itemId: string;
    warehouseId: string;
    plannedQty: string;
    issuedQty: string;
    unitCost: string | null;
    totalCost: string | null;
    movementId: string | null;
    issuedAt: Date | null;
}

// --- Production Variance ---

export interface ProductionVariance {
    id: string;
    tenantId: string;
    workOrderId: string;
    varianceType: VarianceType;
    costType: CostType;
    standardAmount: string;
    actualAmount: string;
    varianceAmount: string;
    referenceJeId: string | null;
    analyzedAt: Date;
}

// --- WO Lifecycle ---

export const WO_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
    PLANNED: ["RELEASED"],
    RELEASED: ["IN_PROGRESS", "PLANNED"],
    IN_PROGRESS: ["COMPLETED"],
    COMPLETED: ["CLOSED"],
    CLOSED: [],
};

// --- BOM Explosion Result ---

export interface ExplodedBomLine {
    componentProductId: string;
    totalQuantity: string;
    level: number;
    path: string[];
}
