// ============================================================
// Asset Engine — RuntimeModule Entry Point
// Athyper v2.1 Business Operating Platform — Phase 2
// ============================================================

import type { Container } from "../../../../kernel/container.js";
import type { RuntimeModule } from "../../../types.js";

// ── Domain re-exports ────────────────────────────────────────
export {
  AssetClass,
  AssetStatus,
  BookType,
  DepreciationMethod,
  AssetTxnType,
  DepreciationRunStatus,
} from "./domain/types.js";

export type {
  Asset,
  AssetBook,
  AssetTransaction,
  DepreciationRun,
  CreateAssetInput,
  UpdateAssetInput,
  CreateAssetBookInput,
  UpdateAssetBookInput,
  RecordAssetTransactionInput,
  CreateDepreciationRunInput,
  AssetFilter,
  AssetBookFilter,
  AssetTransactionFilter,
  DepreciationRunFilter,
} from "./domain/types.js";

// ── Depreciation calculator ──────────────────────────────────
export {
  calculateDepreciation,
  type DepreciationParams,
  type DepreciationResult,
} from "./domain/depreciation-calculator.js";

// ── Persistence interfaces ───────────────────────────────────
export type { AssetRepository } from "./persistence/asset-repo.js";
export type { AssetBookRepository } from "./persistence/asset-book-repo.js";

// ── Service ──────────────────────────────────────────────────
export type { AssetService } from "./services/asset-service.js";
export { DefaultAssetService } from "./services/asset-service.js";

// ── RuntimeModule ────────────────────────────────────────────

export const assetEngine: RuntimeModule = {
  name: "assetEngine",

  register(container: Container): void {
    // Register asset engine tokens and factories.
    // Concrete repository implementations are bound by the adapter layer
    // at bootstrap time. The service wiring is:
    //
    //   container.register("assetService", (c) => {
    //     return new DefaultAssetService(
    //       c.resolve("assetRepository"),
    //       c.resolve("assetBookRepository"),
    //     );
    //   });
    //
    // Left as a no-op here — actual registration happens in the
    // platform bootstrap sequence where adapters are available.
    void container;
  },

  contribute(): void {
    // No cross-module contributions required at this stage.
  },
};

export default assetEngine;
