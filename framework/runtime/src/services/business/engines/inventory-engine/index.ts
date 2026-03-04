// =============================================================================
// Inventory Subledger Engine — Module Entry Point
// Athyper v2.1 Business Operating Platform
// =============================================================================

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

// ---------------------------------------------------------------------------
// Re-exports — Domain
// ---------------------------------------------------------------------------

export {
  ValuationMethod,
  MovementType,
  StocktakeStatus,
} from "./domain/types.js";

export type {
  Warehouse,
  ItemMaster,
  InventoryBalance,
  InventoryMovement,
  ValuationLayer,
  Stocktake,
  StocktakeLine,
  CreateWarehouseInput,
  UpdateWarehouseInput,
  CreateItemMasterInput,
  UpdateItemMasterInput,
  ReceiveStockInput,
  IssueStockInput,
  TransferStockInput,
  AdjustStockInput,
  RecordMovementInput,
  CreateStocktakeInput,
  StocktakeLineInput,
  CreateValuationLayerInput,
  ValuationResult,
  LayerConsumption,
  InventoryBalanceFilter,
  MovementFilter,
  ValuationLayerFilter,
} from "./domain/types.js";

// ---------------------------------------------------------------------------
// Re-exports — Valuation
// ---------------------------------------------------------------------------

export {
  getValuationCalculator,
  FifoCalculator,
  LifoCalculator,
  WeightedAvgCalculator,
  StandardCostCalculator,
  SpecificIdentificationCalculator,
} from "./domain/valuation.js";

export type { ValuationCalculator } from "./domain/valuation.js";

// ---------------------------------------------------------------------------
// Re-exports — Persistence
// ---------------------------------------------------------------------------

export type { WarehouseRepository } from "./persistence/warehouse-repo.js";
export type { ItemMasterRepository } from "./persistence/item-master-repo.js";
export type { InventoryBalanceRepository } from "./persistence/inventory-balance-repo.js";
export type { MovementRepository } from "./persistence/movement-repo.js";
export type { ValuationLayerRepository } from "./persistence/valuation-layer-repo.js";

// ---------------------------------------------------------------------------
// Re-exports — Services
// ---------------------------------------------------------------------------

export { DefaultInventoryService } from "./services/inventory-service.js";
export type { InventoryService } from "./services/inventory-service.js";

// ---------------------------------------------------------------------------
// Runtime Module
// ---------------------------------------------------------------------------

export const inventoryEngineModule: RuntimeModule = {
  name: "inventory-engine",

  register(container: Container): void {
    // Repository and service bindings are registered here.
    // Concrete repository implementations (backed by the DB adapter) are
    // provided by the platform wiring layer; this module declares the
    // contracts and default service implementation.

    // Example registration (uncomment when concrete repos are available):
    // container.register("inventoryService", () => {
    //   const warehouseRepo = container.resolve<WarehouseRepository>("warehouseRepository");
    //   const itemMasterRepo = container.resolve<ItemMasterRepository>("itemMasterRepository");
    //   const balanceRepo = container.resolve<InventoryBalanceRepository>("inventoryBalanceRepository");
    //   const movementRepo = container.resolve<MovementRepository>("movementRepository");
    //   const layerRepo = container.resolve<ValuationLayerRepository>("valuationLayerRepository");
    //   return new DefaultInventoryService(warehouseRepo, itemMasterRepo, balanceRepo, movementRepo, layerRepo);
    // });
  },

  contribute(): void {
    // Future: register health checks, event handlers, CLI commands, etc.
  },
};
