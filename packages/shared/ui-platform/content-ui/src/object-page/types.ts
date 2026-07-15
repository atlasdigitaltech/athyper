/**
 * Object-page shared types.
 *
 * Plane-agnostic — consumed by neon (DOCUMENT entities), mesh, and admin.
 * Section content (overview, lines, accounting, etc.) is provided by the
 * consumer; this package only manages skeleton, anchors, scrollspy, and
 * the scroll-intent arbiter.
 */

/**
 * Sources that may trigger a programmatic scroll. The scroll-intent arbiter
 * suppresses scrollspy updates for the active source so the IntersectionObserver
 * does not fight programmatic motion.
 *
 * - `tabClick`     — user clicked a tab; scroll-intent suppression 1000ms or scrollend.
 * - `jumpToError`  — validation jumped to first invalid field; suppression 1000ms.
 * - `modeToggle`   — edit↔view toggle re-anchored to nearest heading; suppression 500ms.
 * - `focus`        — input received focus; **no suppression** (tab-follows-focus is desired UX).
 */
export type ScrollIntentSource = "tabClick" | "jumpToError" | "modeToggle" | "focus";

export type SectionLoadPolicy = "eager" | "nearViewport" | "onDemand";

/**
 * Descriptor for a single document section.
 *
 * `TKind` is a consumer-defined string literal union — neon uses
 * `"overview" | "lines" | "distributions" | ...`; mesh/admin may use
 * different vocabularies without subclassing this type.
 */
export interface DocumentSectionDescriptor<TKind extends string = string> {
  /** Stable section identifier. Used for ref registry and element ID. */
  id: string;
  /** Tab label rendered in the EntityHeader tab strip. */
  label: string;
  /** Semantic kind, consumer-defined. */
  kind: TKind;
  /** Loading policy for the section's data fetches. */
  loadPolicy: SectionLoadPolicy;
  /** Whether this section contains any editable fields under the current mask. */
  hasEditableFields?: boolean;
  /** Optional URL hash. Defaults to `id`. Use to expose a friendlier slug. */
  hash?: string;
}

/**
 * Map descriptors → element IDs and hashes. The two namespaces are kept
 * distinct so element IDs cannot collide with arbitrary page content.
 */
export function getSectionElementId(id: string): string {
  return `document-section-${id}`;
}

export function getSectionHash<TKind extends string>(
  descriptor: DocumentSectionDescriptor<TKind>,
): string {
  return descriptor.hash ?? descriptor.id;
}
