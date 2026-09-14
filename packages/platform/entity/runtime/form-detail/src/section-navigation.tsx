"use client";
import { useEffect, useRef, type RefObject } from "react";
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
}: {
  sections: readonly EntitySectionItem[];
  activeSection: string;
  onNavigate: (key: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <nav className={`a-section-navigation ${className}`} aria-label={label}>
      <label className="a-record-360__picker">
        {label}
        <select
          value={activeSection}
          onChange={(e) => onNavigate(e.target.value)}
        >
          {sections.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
              {s.count === undefined ? "" : ` (${s.count})`}
              {s.status ? ` — ${s.status}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="a-record-360__links">
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
              <small className="a-record-360__section-status">{s.status}</small>
            ) : null}
          </button>
        ))}
      </div>
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
  onObserve: (key: string) => void;
  getThreshold: () => number;
  fallbackSelector?: string;
}) {
  const callback = useRef(onObserve),
    threshold = useRef(getThreshold),
    scrollingTo = useRef<string | undefined>(undefined);
  callback.current = onObserve;
  threshold.current = getThreshold;
  useEffect(() => {
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
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start", behavior: "instant" });
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
              target.scrollIntoView({ block: "start", behavior: "instant" });
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
