/**
 * @athyper/document-runtime
 *
 * Document rendering engine for transaction documents (PO, INV, GR, etc.).
 * Architecture: Chain Ribbon → Header → Status Lanes → Exceptions → Tabs
 */
export { ProcessChainRibbon, type ProcessChainRibbonProps } from "./chain";
export { DocumentHeader, type DocumentHeaderProps, type MetadataCluster } from "./header";
export { StatusLanes, type StatusLanesProps } from "./status";
export { ExceptionStack, type ExceptionStackProps } from "./exceptions";
export { OverviewGrid, type OverviewGridProps, type OverviewCard } from "./overview";
export { DocumentShell, type DocumentShellProps } from "./shell";

// ── Items sub-module — generic document line items grid ───────────────────────
// PostingTrace + JournalGrid: @athyper/finance-workbench/views
export { ItemsGrid, type ItemsGridProps, type ItemsGridColumn } from "./items";
