"use client";
import {
  EntitySectionNavigation,
  useEntitySectionScroll,
} from "./section-navigation";
import { Component, useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import type { EntityRecord360PanelV1 } from "@athyper/contract-platform-entity-runtime";

export interface Record360Section {
  readonly key: string;
  readonly label: string;
  readonly count?: number;
  readonly status?: string;
}

export function EntityRecord360ModeNavigation({
  panel,
  activeTab,
  onSelectTab,
  navigationId,
  navigationRef,
}: {
  readonly panel: EntityRecord360PanelV1;
  readonly activeTab: string;
  readonly onSelectTab: (tab: string, preferredSection?: string) => void;
  readonly navigationId: string;
  readonly navigationRef: RefObject<HTMLDivElement | null>;
}) {
  const tab = panel.tabs.find((item) => item.key === activeTab) ?? panel.tabs[0]!;
  return <div
    ref={navigationRef}
    role="tablist"
    aria-label="Record views"
    className="a-record-360__tabs"
    onKeyDown={(event) => {
      const buttons = Array.from(
        navigationRef.current!.querySelectorAll<HTMLButtonElement>("[role=tab]"),
      );
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "ArrowRight" ? (index + 1) % buttons.length
        : event.key === "ArrowLeft" ? (index - 1 + buttons.length) % buttons.length
          : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : undefined;
      if (next !== undefined) {
        event.preventDefault();
        buttons[next]?.focus();
        buttons[next]?.click();
      }
    }}
  >
    {panel.tabs.map((item) => <button
      key={item.key}
      type="button"
      role="tab"
      id={`${navigationId}-tab-${item.key}`}
      aria-controls={`${navigationId}-content`}
      aria-selected={item.key === tab.key}
      tabIndex={item.key === tab.key ? 0 : -1}
      onClick={() => onSelectTab(item.key, item.sectionKey)}
    >
      {item.label}
    </button>)}
  </div>;
}

/** Shared scroll navigation. The adapter supplies only authorized section providers. */
export function EntityRecord360Panel({
  panel,
  sections,
  activeSection,
  activeTab,
  navigationRevision,
  onSelectTab,
  onSelectSection,
  onObserve,
  renderSection,
  renderSidebar,
  modeNavigationRef,
  modeNavigationId,
}: {
  readonly panel: EntityRecord360PanelV1;
  readonly sections: readonly Record360Section[];
  readonly activeSection: string;
  readonly activeTab: string;
  readonly navigationRevision: number;
  /** Changes record mode only; it must not initiate section scrolling. */
  readonly onSelectTab: (tab: string, preferredSection?: string) => void;
  /** Explicit left-rail navigation; this initiates scrolling and focus. */
  readonly onSelectSection: (section: string) => void;
  readonly onObserve: (section: string) => void;
  readonly renderSection: (key: string) => ReactNode;
  readonly renderSidebar: (
    provider: EntityRecord360PanelV1["sidebar"][number],
  ) => ReactNode;
  /** When provided, the record-mode tabs are rendered by PageWorkspace.navigation. */
  readonly modeNavigationRef?: RefObject<HTMLDivElement | null>;
  readonly modeNavigationId?: string;
}) {
  const root = useRef<HTMLDivElement>(null),
    internalNavigationRef = useRef<HTMLDivElement>(null),
    generatedNavigationId = useId(),
    tabsRoot = modeNavigationRef ?? internalNavigationRef,
    navigationId = modeNavigationId ?? generatedNavigationId;
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
  useEntitySectionScroll({
    root,
    attribute: "data-record-section",
    contentSelector: ".a-record-360__sections",
    activeSection,
    navigationRevision,
    scopeKey: `${activeTab}:${signature}`,
    enabled: tab.provider === "360",
    initialSection: rail[0]?.key,
    onObserve,
    getThreshold: () =>
      (tabsRoot.current?.getBoundingClientRect().bottom ?? 0) + 24,
    fallbackSelector: "[role=tabpanel]",
  });
  return (
    <div ref={root} className="a-record-360">
      {modeNavigationRef ? null : <EntityRecord360ModeNavigation panel={panel} activeTab={activeTab} onSelectTab={onSelectTab} navigationId={navigationId} navigationRef={tabsRoot} />}
      <div
        id={`${navigationId}-content`}
        role="tabpanel"
        tabIndex={-1}
        aria-labelledby={`${navigationId}-tab-${tab.key}`}
        className={
          tab.provider === "360"
            ? "a-record-360__layout"
            : "a-record-360__content"
        }
      >
        {tab.provider === "360" ? (
          <>
            <EntitySectionNavigation
              className="a-record-360__rail"
              label="360 sections"
              sections={rail}
              activeSection={activeSection}
              onNavigate={onSelectSection}
            />
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
              aria-label="Primary record details"
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
        <SectionBoundary label={item.label}>{children}</SectionBoundary>
      ) : (
        <div
          className="a-record-360__placeholder"
          aria-hidden="true"
        />
      )}
    </section>
  );
}

/**
 * A render failure in one section must not take down neighboring sections or the panel's
 * heading/navigation. Matches the existing ShellSurfaceBoundary convention (local class
 * boundary, Retry resets local state) rather than introducing a different pattern.
 */
class SectionBoundary extends Component<
  { readonly label: string; readonly children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="a-record-360__section-error">
        <p>{this.props.label} could not be displayed.</p>
        <button type="button" onClick={() => this.setState({ failed: false })}>
          Try again
        </button>
      </div>
    );
  }
}
