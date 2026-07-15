"use client";

type PerformanceMarkName =
  | "create-clicked"
  | "draft-initiated-started"
  | "draft-initiated-completed"
  | "edit-rsc-navigation-started"
  | "edit-rsc-navigation-completed"
  | "document-open-started"
  | "document-open-completed"
  | "rules-ready"
  | "line-metadata-ready"
  | "first-editable-field-rendered"
  | "editor-fully-interactive";

const MARK_PREFIX = "document-edit";
const alreadyMarked = new Set<string>();

export function markDocumentEditPerformance(name: string): void {
  if (typeof performance === "undefined") return;
  const sanitized = name.trim();
  if (!sanitized) return;
  try {
    performance.mark(`${MARK_PREFIX}:${sanitized}`);
  } catch {
    // Instrumentation is best effort.
  }
}

export function markDocumentEditPerformanceOnce(name: PerformanceMarkName): void {
  if (alreadyMarked.has(name)) return;
  alreadyMarked.add(name);
  markDocumentEditPerformance(name);
}

export function markDocumentEditPerformanceWithReason(
  name: PerformanceMarkName,
  _reason?: string,
): void {
  markDocumentEditPerformanceOnce(name);
}
