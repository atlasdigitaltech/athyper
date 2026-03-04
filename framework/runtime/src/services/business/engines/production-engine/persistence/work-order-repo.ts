// framework/runtime/src/services/business/engines/production-engine/persistence/work-order-repo.ts

import type {
  PaginationParams,
  PaginatedResult,
} from "../../shared/engine-base.js";
import type {
  WorkOrder,
  CreateWorkOrderInput,
  WorkOrderStatus,
} from "../domain/types.js";

export interface WorkOrderRepo {
  create(
    input: CreateWorkOrderInput & { woNumber: string },
  ): Promise<WorkOrder>;
  getById(tenantId: string, id: string): Promise<WorkOrder | null>;
  getByWoNumber(
    tenantId: string,
    entityCode: string,
    woNumber: string,
  ): Promise<WorkOrder | null>;
  updateStatus(
    tenantId: string,
    id: string,
    status: WorkOrderStatus,
    timestamps?: Record<string, Date>,
  ): Promise<WorkOrder>;
  updateCompletedQty(
    tenantId: string,
    id: string,
    completedQty: string,
  ): Promise<WorkOrder>;
  list(
    tenantId: string,
    filters: {
      entityCode?: string;
      status?: WorkOrderStatus;
      productId?: string;
    },
    pagination: PaginationParams,
  ): Promise<PaginatedResult<WorkOrder>>;
}
