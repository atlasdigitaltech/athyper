import { FieldsSurfaceRenderer } from "./fields-surface";
import { LifecycleSurfaceRenderer } from "./lifecycle-surface";
import { AuditSummarySurfaceRenderer } from "./audit-surface";
import { LineItemsSurfaceRenderer, ChildRecordsSurfaceRenderer } from "./line-items-surface";
import { RichSummarySurfaceRenderer } from "./rich-summary-surface";
// Cleanup-plan v5 P5b — descriptor-driven document runtime surfaces.
import { DocumentHeaderSurfaceRenderer } from "./document-header-surface";
import { PolymorphicPcLinesSurfaceRenderer } from "./polymorphic-pc-lines-surface";
import { HeaderScopePcStripSurfaceRenderer } from "./header-scope-pc-strip-surface";
import { PostingsPreviewSurfaceRenderer } from "./postings-preview-surface";
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
  ["document_header", DocumentHeaderSurfaceRenderer],
  ["polymorphic_pc_lines", PolymorphicPcLinesSurfaceRenderer],
  ["header_scope_pc_strip", HeaderScopePcStripSurfaceRenderer],
  ["postings_preview", PostingsPreviewSurfaceRenderer],
]);

export function getSurfaceRenderer(kind: SurfaceKind) {
  return defaultRegistry.get(kind);
}

export { defaultRegistry };
