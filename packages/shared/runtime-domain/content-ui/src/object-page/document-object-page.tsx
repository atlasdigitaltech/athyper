"use client";

import { type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { DocumentSection } from "./document-section";
import type { DocumentSectionDescriptor } from "./types";

export interface DocumentObjectPageProps<TKind extends string = string> {
  /** Ordered list of sections to render. Order is presentation order on the page. */
  sections: DocumentSectionDescriptor<TKind>[];
  /** Wire from `useDocumentPageController#registerSectionRef`. */
  registerSectionRef?: (id: string, el: HTMLElement | null) => void;
  /**
   * Render the contents of a single section. Called per descriptor in `sections`.
   * The consumer owns section content — this package only manages the skeleton.
   */
  renderSection: (descriptor: DocumentSectionDescriptor<TKind>) => ReactNode;
  /** Optional per-section heading override. Falls back to `descriptor.label`. */
  resolveTitle?: (descriptor: DocumentSectionDescriptor<TKind>) => string | undefined;
  /** Optional per-section className for the wrapping `<section>` element. */
  resolveSectionClassName?: (descriptor: DocumentSectionDescriptor<TKind>) => string | undefined;
  /** Optional content rendered above the first section (document chrome). */
  chromeSlot?: ReactNode;
  /** Optional content rendered after the last section (footer). */
  footerSlot?: ReactNode;
  className?: string;
}

/**
 * Object-page skeleton — renders every section shell in order, always
 * mounted regardless of viewport visibility. Lazy data loading is the
 * consumer's responsibility (Phase 3 will add a `useLazyDocumentSections`
 * hook to gate the queries inside `renderSection`).
 *
 * Invariant: this skeleton is mode-agnostic. Switching between view and
 * edit mode must not add, remove, or reorder sections — only the inner
 * field renderers change. Layout shift on mode toggle is a regression.
 *
 * Reusable across neon / mesh / admin. The consumer provides section
 * content; this component only owns the section landmarks, anchors,
 * scroll-margin offset, and ref registration for scrollspy.
 */
export function DocumentObjectPage<TKind extends string = string>({
  sections,
  registerSectionRef,
  renderSection,
  resolveTitle,
  resolveSectionClassName,
  chromeSlot,
  footerSlot,
  className,
}: DocumentObjectPageProps<TKind>) {
  return (
    <div className={cn("flex flex-col", className)}>
      {chromeSlot}
      {sections.map((descriptor) => {
        const title = resolveTitle ? resolveTitle(descriptor) : descriptor.label;
        const sectionClass = resolveSectionClassName?.(descriptor);
        return (
          <DocumentSection
            key={descriptor.id}
            id={descriptor.id}
            title={title}
            registerRef={registerSectionRef}
            className={sectionClass}
          >
            {renderSection(descriptor)}
          </DocumentSection>
        );
      })}
      {footerSlot}
    </div>
  );
}
