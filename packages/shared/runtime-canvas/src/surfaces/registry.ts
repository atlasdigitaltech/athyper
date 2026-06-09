import { FieldsSurfaceRenderer } from "./fields-surface";
import { LifecycleSurfaceRenderer } from "./lifecycle-surface";
import { AuditSummarySurfaceRenderer } from "./audit-surface";
import { LineItemsSurfaceRenderer, ChildRecordsSurfaceRenderer } from "./line-items-surface";
import { RichSummarySurfaceRenderer } from "./rich-summary-surface";
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
]);

export function getSurfaceRenderer(kind: SurfaceKind) {
  return defaultRegistry.get(kind);
}

export { defaultRegistry };
