// ─────────────────────────────────────────────────────────────────────────────
// @athyper/runtime-add-item — orchestrates the pick → stage → fill → commit
// pipeline across registered SourceAdapters. Consumes interaction-surface
// shells from @athyper/ui and adapter-contract schemas from
// @athyper/runtime-contracts.
//
// Package layout:
//   ./adapter          — SourceAdapter executable interface + SourceAdapterRegistry
//   ./controller       — AddItemController hook + DraftLineCommitter pipeline
//   ./telemetry        — TelemetryDispatcher + AddItemTelemetryEvent union
//   ./test-harness     — defineSourceAdapterContractSuite + synthetic adapters
// ─────────────────────────────────────────────────────────────────────────────

export * from "./adapter";
export * from "./controller";
export * from "./picker";
export * from "./telemetry";
