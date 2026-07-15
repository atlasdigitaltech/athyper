"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "@athyper/theme/utils";
import { getSectionElementId } from "./types";

export interface DocumentSectionProps {
  /** Stable section identifier (e.g. `"overview"`, `"lines"`). */
  id: string;
  /** Section heading rendered inside the landmark; omit if the section provides its own. */
  title?: string;
  /**
   * Register this section's root element with the scrollspy ref registry.
   * Wire from `useDocumentPageController#registerSectionRef`.
   */
  registerRef?: (id: string, el: HTMLElement | null) => void;
  /** Optional class on the section element. */
  className?: string;
  /** Optional class on the heading. */
  headingClassName?: string;
  /** Optional decoration rendered next to the heading (badges, counts, action buttons). */
  headingTrailing?: ReactNode;
  children: ReactNode;
}

/**
 * `<section>` landmark with stable anchor, ID-keyed scroll registration,
 * and `scroll-margin-top` equal to the published EntityHeader offset.
 *
 * Element ID: `document-section-${id}` (namespaced to avoid hash-routing
 * collisions). The data-section-id attribute is consumed by the scrollspy
 * IntersectionObserver callback to map elements back to section IDs.
 *
 * Accessibility: when `title` is provided, renders an `<h2>` and ties it
 * to the section via `aria-labelledby`. Acts as an anchor landmark, not
 * an ARIA tab panel — sections coexist in one document flow.
 */
export function DocumentSection({
  id,
  title,
  registerRef,
  className,
  headingClassName,
  headingTrailing,
  children,
}: DocumentSectionProps) {
  const ref = useRef<HTMLElement>(null);
  const elementId = getSectionElementId(id);
  const headingId = `${elementId}-title`;

  useEffect(() => {
    const el = ref.current;
    registerRef?.(id, el);
    return () => registerRef?.(id, null);
  }, [id, registerRef]);

  return (
    <section
      ref={ref}
      id={elementId}
      data-section-id={id}
      aria-labelledby={title ? headingId : undefined}
      style={{ scrollMarginTop: "calc(var(--entity-header-offset, 0px) + 1rem)" }}
      className={cn(
        "scroll-mt-[calc(var(--entity-header-offset,0px)+1rem)]",
        "border-t border-border/60 first:border-t-0",
        "py-6",
        className,
      )}
    >
      {title && (
        <header className="mb-3 flex items-baseline justify-between gap-3 px-4 sm:px-6">
          <h2
            id={headingId}
            className={cn("text-base font-semibold tracking-tight", headingClassName)}
          >
            {title}
          </h2>
          {headingTrailing && <div className="shrink-0">{headingTrailing}</div>}
        </header>
      )}
      {children}
    </section>
  );
}
