"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { ChoiceSelect } from "@athyper/platform-ui";
export interface EntitySectionItem {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
  readonly status?: string;
}
/** Navigation presentation shared by editable forms and record views. */
export function EntitySectionNavigation({
  sections,
  activeSection,
  onNavigate,
  label,
  className = "",
  trailing,
}: {
  sections: readonly EntitySectionItem[];
  activeSection: string;
  onNavigate: (key: string) => void;
  label: string;
  className?: string;
  /** Optional adjacent control for the compact, selector-based navigation state. */
  trailing?: ReactNode;
}) {
  return (
    <nav className={`a-section-navigation ${className}`} aria-label={label}>
      <label className="a-entity-record__picker">
        {label}
        <ChoiceSelect
          value={activeSection}
          onChange={onNavigate}
          options={sections.map((s) => ({
            value: s.key,
            label: `${s.label}${s.count === undefined ? "" : ` (${s.count})`}${s.status ? ` — ${s.status}` : ""}`,
          }))}
        />
      </label>
      <div className="a-entity-record__links">
        {sections.map((s) => (
          <button
            type="button"
            key={s.key}
            aria-current={s.key === activeSection ? "location" : undefined}
            onClick={() => onNavigate(s.key)}
          >
            <span>{s.label}</span>
            {s.count === undefined ? null : <small>{s.count}</small>}
            {s.status ? (
              <small className="a-entity-record__section-status">{s.status}</small>
            ) : null}
          </button>
        ))}
      </div>
      {trailing ? <div className="a-section-navigation__trailing">{trailing}</div> : null}
    </nav>
  );
}
/** Explicit navigation scrolls/focuses; passive scroll observation never moves focus. */
export function useEntitySectionScroll({
  root,
  attribute,
  contentSelector,
  activeSection,
  navigationRevision,
  scopeKey,
  enabled = true,
  initialSection,
  firstSectionAtPageTop = false,
  onObserve,
  getThreshold,
  fallbackSelector,
}: {
  root: RefObject<HTMLElement | null>;
  attribute: string;
  contentSelector: string;
  activeSection: string;
  navigationRevision: number;
  scopeKey: string;
  enabled?: boolean;
  initialSection?: string;
  /** Record overview starts with its identity header; later sections remain anchored. */
  firstSectionAtPageTop?: boolean;
  onObserve: (key: string) => void;
  getThreshold: () => number;
  fallbackSelector?: string;
}) {
  const callback = useRef(onObserve),
    threshold = useRef(getThreshold),
    scrollingTo = useRef<string | undefined>(undefined),
    handledNavigationRevision = useRef<number | undefined>(undefined);
  callback.current = onObserve;
  threshold.current = getThreshold;
  useEffect(() => {
    const initialNavigation = handledNavigationRevision.current === undefined;
    const explicitNavigation = handledNavigationRevision.current !== navigationRevision;
    if (!initialNavigation && !explicitNavigation) return;
    handledNavigationRevision.current = navigationRevision;
    if (
      !root.current ||
      (navigationRevision === 0 && enabled && activeSection === initialSection)
    )
      return;
    const target = enabled
      ? Array.from(
          root.current.querySelectorAll<HTMLElement>(`[${attribute}]`),
        ).find((e) => e.getAttribute(attribute) === activeSection)
      : fallbackSelector
        ? root.current.querySelector<HTMLElement>(fallbackSelector)
        : undefined;
    if (!target) return;
    scrollingTo.current = activeSection;
    const align = () => {
      if (firstSectionAtPageTop && activeSection === initialSection)
        window.scrollTo({ top: 0, behavior: "instant" });
      else target.scrollIntoView({ block: "start", behavior: "instant" });
    };
    const frame = requestAnimationFrame(() => {
      align();
      if (navigationRevision > 0) target.focus({ preventScroll: true });
    });
    const release = () => {
      scrollingTo.current = undefined;
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(() => {
            if (scrollingTo.current === activeSection)
              align();
          });
    const content = root.current.querySelector(contentSelector);
    if (content) observer?.observe(content);
    for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
      document.addEventListener(event, release, {
        capture: true,
        passive: true,
      });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      scrollingTo.current = undefined;
      for (const event of ["wheel", "touchstart", "pointerdown", "keydown"])
        document.removeEventListener(event, release, true);
    };
    // Active section changes from scrolling must not initiate another scroll.
  }, [navigationRevision, scopeKey, enabled]);
  useEffect(() => {
    if (!enabled || !root.current) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (
          scrollingTo.current ||
          !root.current ||
          !root.current.getClientRects().length
        )
          return;
        const elements = Array.from(
          root.current.querySelectorAll<HTMLElement>(`[${attribute}]`),
        ).filter((e) => e.getClientRects().length);
        const current =
          elements
            .filter((e) => e.getBoundingClientRect().top <= threshold.current())
            .at(-1) ?? elements[0];
        const key = current?.getAttribute(attribute);
        if (key) callback.current(key);
      });
    };
    document.addEventListener("scroll", update, true);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(update);
    const content = root.current.querySelector(contentSelector);
    if (content) observer?.observe(content);
    update();
    return () => {
      document.removeEventListener("scroll", update, true);
      observer?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [scopeKey, enabled]);
}
