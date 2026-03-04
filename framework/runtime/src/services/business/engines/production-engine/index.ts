// framework/runtime/src/services/business/engines/production-engine/index.ts

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

export const productionEngineModule: RuntimeModule = {
  name: "engine.production",

  register(c: Container) {
    // Register production repositories and services
  },

  contribute(c: Container) {
    // Register overhead absorption, variance analysis jobs
  },
};

// Re-export domain types
export type {
  BillOfMaterials,
  BomLine,
  CreateBomInput,
  CreateBomLineInput,
  BomStatus,
  Routing,
  WorkOrder,
  CreateWorkOrderInput,
  WorkOrderStatus,
  WorkOrderCost,
  CostType,
  WorkOrderMaterialIssue,
  ProductionVariance,
  VarianceType,
  ExplodedBomLine,
} from "./domain/types.js";
export { WO_TRANSITIONS } from "./domain/types.js";

// Re-export persistence
export type { WorkOrderRepo } from "./persistence/work-order-repo.js";
export type { BomRepo } from "./persistence/bom-repo.js";

// Re-export domain logic
export { explodeBom, consolidateExplodedBom } from "./domain/bom-exploder.js";
export {
  calculateMaterialVariances,
  calculateLaborVariances,
  calculateOverheadVariances,
  calculateAllVariances,
} from "./domain/variance-analysis.js";
