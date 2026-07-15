import { FieldsSurfaceRenderer } from "./fields-surface";
import { LifecycleSurfaceRenderer } from "./lifecycle-surface";
import { AuditSummarySurfaceRenderer } from "./audit-surface";
import { LineItemsSurfaceRenderer, ChildRecordsSurfaceRenderer } from "./line-items-surface";
import { RichSummarySurfaceRenderer } from "./rich-summary-surface";
// Cleanup-plan v5 P5b — descriptor-driven document runtime surfaces.
import { PolymorphicPcLinesSurfaceRenderer } from "./polymorphic-pc-lines-surface";
import { HeaderScopePcStripSurfaceRenderer } from "./header-scope-pc-strip-surface";
import { PostingsPreviewSurfaceRenderer } from "./postings-preview-surface";
import {
  DocumentAccountingSurfaceRenderer,
  DocumentSchedulesSurfaceRenderer,
} from "./document-child-tables-surface";
import type { SurfaceKind, SurfaceRendererRegistry } from "./types";

const defaultRegistry: SurfaceRendererRegistry = new Map([
  ["fields", FieldsSurfaceRenderer],
  ["lifecycle", LifecycleSurfaceRenderer],
  ["audit_summary", AuditSummarySurfaceRenderer],
  ["line_items", LineItemsSurfaceRenderer],
  ["child_records", ChildRecordsSurfaceRenderer],
  ["summary_cards", RichSummarySurfaceRenderer],
  ["contacts_channel", RichSummarySurfaceRenderer],
  ["addresses", RichSummarySurfaceRenderer],
  ["banking_summary", RichSummarySurfaceRenderer],
  ["tax_profile_summary", RichSummarySurfaceRenderer],
  ["supplier_company_code", RichSummarySurfaceRenderer],
  ["operational_presentation", RichSummarySurfaceRenderer],
  // Cleanup-plan v5 P5b — document runtime renderers.
  ["polymorphic_pc_lines", PolymorphicPcLinesSurfaceRenderer],
  ["header_scope_pc_strip", HeaderScopePcStripSurfaceRenderer],
  ["postings_preview", PostingsPreviewSurfaceRenderer],
  // Phase 2 generic kinds — alias to existing renderers during the
  // compatibility window. When 2b/2c land their full extraction, the
  // entries above will be removed and the renderers can be renamed.
  ["document_lines", PolymorphicPcLinesSurfaceRenderer],
  ["document_components", HeaderScopePcStripSurfaceRenderer],
  ["document_schedules", DocumentSchedulesSurfaceRenderer],
  ["document_accounting", DocumentAccountingSurfaceRenderer],
]);

export function getSurfaceRenderer(kind: SurfaceKind) {
  return defaultRegistry.get(kind);
}

export { defaultRegistry };
