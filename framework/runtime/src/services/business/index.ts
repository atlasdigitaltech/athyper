/**
 * Business Services
 *
 * Domain-specific business logic services.
 * Organized as engines under the v2.1 Business Operating Platform.
 */

export const moduleCode = "business";
export const moduleName = "Business Services";

// =============================================================================
// Shared Engine Foundations
// =============================================================================
export * as EngineShared from "./engines/shared/index.js";

// =============================================================================
// Phase 1: Core Platform Engines
// =============================================================================
export * as EventStore from "./engines/event-store/index.js";
export * as OUIntent from "./engines/ou-intent/index.js";
export * as BudgetEngine from "./engines/budget-engine/index.js";
export * as CommitmentEngine from "./engines/commitment-engine/index.js";
export * as TaxEngine from "./engines/tax-engine/index.js";
export * as PostingEngine from "./engines/posting-engine/index.js";
export * as DecisionGrid from "./engines/decision-grid/index.js";

// =============================================================================
// Phase 2: Extended Engines
// =============================================================================
export * as AssetEngine from "./engines/asset-engine/index.js";
export * as InventoryEngine from "./engines/inventory-engine/index.js";
export * as CommissionEngine from "./engines/commission-engine/index.js";

// =============================================================================
// Phase 3: Enterprise Scale Engines
// =============================================================================
export * as FederationEngine from "./engines/federation-engine/index.js";
export * as ProductionEngine from "./engines/production-engine/index.js";

// =============================================================================
// Phase 4: Autonomous Platform
// =============================================================================
export * as AtlasAI from "./engines/atlas-ai/index.js";
