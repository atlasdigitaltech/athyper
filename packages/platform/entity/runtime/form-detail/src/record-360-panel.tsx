"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { EntityRecord360PanelV1 } from "@athyper/contract-platform-entity-runtime";

export interface Record360Section {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
  readonly status?: string;
}

/** Shared scroll navigation. The adapter supplies only authorized section providers. */
export function EntityRecord360Panel({
  panel,
  sections,
  activeSection,
  activeTab,
  navigationRevision,
  onNavigate,
  onObserve,
  renderSection,
  renderSidebar,
}: {
  readonly panel: EntityRecord360PanelV1;
  readonly sections: readonly Record360Section[];
  readonly activeSection: string;
  readonly activeTab: string;
  readonly navigationRevision: number;
  readonly onNavigate: (section: string, tab: string) => void;
  readonly onObserve: (section: string) => void;
  readonly renderSection: (key: string) => ReactNode;
  readonly renderSidebar: (
    provider: EntityRecord360PanelV1["sidebar"][number],
  ) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null),
    tabsRoot = useRef<HTMLDivElement>(null),
    id = useId();
  const observerCallback = useRef(onObserve);
  observerCallback.current = onObserve;
  const scrollingTo = useRef<string | undefined>(undefined);
  const rail = panel.sections.flatMap(
    (key) => sections.find((item) => item.key === key) ?? [],
  );
  const tab = panel.tabs.find((tab) => tab.key === activeTab) ?? panel.tabs[0]!;
  const overviewTab = panel.tabs.find((tab) => tab.provider === "360")!;
  const signature = rail.map((item) => item.key).join(":");
  useEffect(() => {
    if (!tabsRoot.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      root.current?.style.setProperty(
        "--record-tabs-height",
        `${entry!.target.getBoundingClientRect().height}px`,
      ),
    );
    observer.observe(tabsRoot.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (
      !root.current ||
      (navigationRevision === 0 &&
        tab.provider === "360" &&
        activeSection === rail[0]?.key)
    )
      return;
    const target =
      tab.provider === "360"
        ? Array.from(
            root.current.querySelectorAll<HTMLElement>("[data-record-section]"),
          ).find((element) => element.dataset.recordSection === activeSection)
        : root.current.querySelector<HTMLElement>("[role=tabpanel]");
    if (!target) return;
    scrollingTo.current = activeSection;
    const frame = requestAnimationFrame(() => {
      target.scrollIntoView({ block: "start", behavior: "instant" });
      if (navigationRevision > 0) target.focus({ preventScroll: true });
    });
    // Preserve the selected heading while earlier lazy sections change height.
    // Any deliberate user interaction releases the anchor immediately.
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
    const content = root.current.querySelector(".a-record-360__sections");
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
    // Only explicit navigation scrolls/focuses; scroll-spy updates do neither.
  }, [navigationRevision, activeTab, signature]);
  useEffect(() => {
    if (tab.provider !== "360" || !root.current) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (scrollingTo.current || !root.current) return;
        const threshold =
          (tabsRoot.current?.getBoundingClientRect().bottom ?? 0) + 24;
        const elements = Array.from(
          root.current.querySelectorAll<HTMLElement>("[data-record-section]"),
        );
        const current =
          elements
            .filter(
              (element) => element.getBoundingClientRect().top <= threshold,
            )
            .at(-1) ?? elements[0];
        if (current?.dataset.recordSection)
          observerCallback.current(current.dataset.recordSection);
      });
    };
    document.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("scroll", update, true);
      cancelAnimationFrame(frame);
    };
  }, [activeTab, signature]);
  return (
    <div ref={root} className="a-record-360">
      <div
        ref={tabsRoot}
        role="tablist"
        aria-label="Record views"
        className="a-record-360__tabs"
        onKeyDown={(event) => {
          const buttons = Array.from(
            tabsRoot.current!.querySelectorAll<HTMLButtonElement>("[role=tab]"),
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % buttons.length
              : event.key === "ArrowLeft"
                ? (index - 1 + buttons.length) % buttons.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            buttons[next]?.focus();
            buttons[next]?.click();
          }
        }}
      >
        {panel.tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${id}-tab-${item.key}`}
            aria-controls={`${id}-content`}
            aria-selected={item.key === tab.key}
            tabIndex={item.key === tab.key ? 0 : -1}
            onClick={() =>
              onNavigate(item.sectionKey ?? activeSection, item.key)
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        id={`${id}-content`}
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`${id}-tab-${tab.key}`}
        className={
          tab.provider === "360"
            ? "a-record-360__layout"
            : "a-record-360__content"
        }
      >
        {tab.provider === "360" ? (
          <>
            <nav className="a-record-360__rail" aria-label="360 sections">
              <label className="a-record-360__picker">
                Section
                <select
                  value={activeSection}
                  onChange={(event) =>
                    onNavigate(event.target.value, overviewTab.key)
                  }
                >
                  {rail.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="a-record-360__links">
                {rail.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={
                      activeSection === item.key ? "location" : undefined
                    }
                    onClick={() => onNavigate(item.key, overviewTab.key)}
                  >
                    <span>{item.label}</span>
                    {item.count === undefined ? null : (
                      <small>{item.count}</small>
                    )}
                    {item.status ? (
                      <small className="a-record-360__section-status">
                        {item.status}
                      </small>
                    ) : null}
                  </button>
                ))}
              </div>
            </nav>
            <div className="a-record-360__sections">
              {rail.map((item, index) => (
                <ProgressiveSection
                  key={item.key}
                  item={item}
                  initial={index === 0}
                  selected={item.key === activeSection}
                >
                  {renderSection(item.key)}
                </ProgressiveSection>
              ))}
            </div>
            <aside
              className="a-record-360__sidebar"
              aria-label="Primary partner details"
            >
              {panel.sidebar.map((item) => (
                <div key={item.key}>{renderSidebar(item)}</div>
              ))}
            </aside>
          </>
        ) : (
          renderSection(tab.sectionKey!)
        )}
      </div>
    </div>
  );
}

function ProgressiveSection({
  item,
  initial,
  selected,
  children,
}: {
  item: Record360Section;
  initial: boolean;
  selected: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null),
    [loaded, setLoaded] = useState(initial || selected),
    id = useId();
  useEffect(() => {
    if (loaded) return;
    if (selected || typeof IntersectionObserver === "undefined") {
      setLoaded(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setLoaded(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, [loaded, selected]);
  return (
    <section
      ref={root}
      data-record-section={item.key}
      tabIndex={-1}
      aria-labelledby={id}
      className="a-record-360__section"
    >
      <h2 id={id}>{item.label}</h2>
      {loaded || selected ? (
        children
      ) : (
        <div
          className="a-record-360__placeholder"
          aria-label={`${item.label} loads when approached`}
        />
      )}
    </section>
  );
}
