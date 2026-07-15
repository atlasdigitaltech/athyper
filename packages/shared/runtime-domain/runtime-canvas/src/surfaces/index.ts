export type {
  RuntimeCanvasFlags,
  RuntimeListState,
  RuntimeSurfaceRenderer,
  RuntimeSurfaceRendererProps,
  SurfaceKind,
  SurfaceRendererRegistry,
} from "./types";
export { readRuntimeCanvasFlags } from "./types";
export { getSurfaceRenderer, defaultRegistry } from "./registry";
export { FieldsSurfaceRenderer } from "./fields-surface";
export { LifecycleSurfaceRenderer } from "./lifecycle-surface";
export { AuditSummarySurfaceRenderer } from "./audit-surface";
export {
  AuditSummaryStrip,
  resolveAuditSummaryData,
  type AuditSummaryActor,
  type AuditSummaryData,
  type AuditSummaryStripProps,
  type ResolveAuditSummaryInput,
} from "../header/audit-summary-strip";
export { LineItemsSurfaceRenderer, ChildRecordsSurfaceRenderer } from "./line-items-surface";
export { RichSummarySurfaceRenderer } from "./rich-summary-surface";

// Interaction-surface shells + SurfaceStackController moved down to
// @athyper/ui/surfaces so runtime-line-item (and any other upstream package)
// can consume them without creating a circular dependency on runtime-canvas.
// Re-exported here for backward compatibility with existing
// `@athyper/runtime-canvas/surfaces` imports.
export * from "@athyper/ui/surfaces";
