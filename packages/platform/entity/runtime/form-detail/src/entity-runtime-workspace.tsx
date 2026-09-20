"use client";
import type { EntityRuntimeActionPlan, EntityRuntimeNavigationPlan, EntityRuntimeSectionResource, EntityRuntimeResourceContext, EntityRuntimeSummaryViewPlan } from "@athyper/platform-entity-descriptor-client";
import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { Building2Icon } from "@athyper/platform-icons";
import { Card } from "@athyper/platform-ui";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { EntitySectionWorkspace } from "./section-workspace";
import { CompiledEntitySectionContent } from "./compiled-section-content";
import { useEntityRuntimeSectionWorkspace, type EntityRuntimeSectionState } from "./use-section-resource";

/** Shared record workspace. Continuous mode is deliberately opt-in: it is for a parent tab such as 360 View, never direct tabs. */
export function EntityRuntimeWorkspace({
  entityCode, recordId, surfaceKey, deepLinkedSectionKey, contextKey = "default", resourceContext,
  locale = typeof navigator === "undefined" ? "und" : navigator.language, renderHeader, renderSection,
  renderBody, onSelectSection, onObserveSection, sectionNavigation = "rail", continuousSections = false, continuousScrollRoot,
}: {
  readonly entityCode: string; readonly recordId: string; readonly surfaceKey: string; readonly deepLinkedSectionKey?: string;
  readonly contextKey?: string; readonly resourceContext?: EntityRuntimeResourceContext; readonly locale?: string;
  readonly renderHeader: (header: Readonly<Record<string, unknown>>, revision: string, actions: readonly EntityRuntimeActionPlan[], navigation: EntityRuntimeHeaderNavigation) => ReactNode;
  readonly renderSection?: (input: { readonly sectionKey: string; readonly resource: EntityRuntimeSectionResource; readonly retry: () => void }) => ReactNode;
  readonly renderBody?: (input: { readonly navigation: EntityRuntimeHeaderNavigation; readonly content: ReactNode }) => ReactNode;
  readonly onSelectSection?: (sectionKey: string) => void;
  /** Called for a viewport update. Consumers should use replaceState, not pushState. */
  readonly onObserveSection?: (sectionKey: string) => void;
  readonly sectionNavigation?: "rail" | "header";
  readonly continuousSections?: boolean;
  /** The actual scroll surface for continuous mode. Defaults to the viewport. */
  readonly continuousScrollRoot?: RefObject<HTMLElement | null>;
}) {
  const client = useApiClient(), identity = useSessionIdentity();
  const [scrollRequest, setScrollRequest] = useState<string | undefined>(() => deepLinkedSectionKey);
  // A click has priority over viewport observation until the requested scroll lands.
  // A ref closes the small render gap between the click and the next observer callback.
  const manualScrollLock = useRef(false);
  const cacheScope = useMemo(() => [identity.scope?.tenantId ?? "unbound", identity.scope?.principalId ?? "unbound", identity.scope?.authEpoch ?? 0, contextKey, locale].join(":"), [contextKey, identity.scope?.authEpoch, identity.scope?.principalId, identity.scope?.tenantId, locale]);
  const workspace = useEntityRuntimeSectionWorkspace({ client, entityCode, recordId, surfaceKey, cacheScope, deepLinkedSectionKey, ...(resourceContext ? { resourceContext } : {}) });
  // IntersectionObserver uses a reading line below the pane top. At scrollTop 0,
  // Overview's heading is above that line, so make the document boundary explicit.
  useEffect(() => {
    if (!continuousSections || scrollRequest || manualScrollLock.current) return;
    const container = continuousScrollRoot?.current;
    const firstSection = workspace.bootstrap?.plan.navigation?.tabs.find((tab) => tab.provider === "360")?.sectionKeys[0];
    if (!container || !firstSection) return;
    const activateFirstAtTop = () => {
      if (container.scrollTop > 1 || manualScrollLock.current) return;
      workspace.observeSection(firstSection);
      onObserveSection?.(firstSection);
    };
    activateFirstAtTop();
    container.addEventListener("scroll", activateFirstAtTop, { passive: true });
    return () => container.removeEventListener("scroll", activateFirstAtTop);
  }, [continuousScrollRoot, continuousSections, onObserveSection, scrollRequest, workspace.bootstrap, workspace.observeSection]);
  if (workspace.bootstrapStatus === "loading") return <Card><p role="status">Loading record…</p></Card>;
  if (workspace.bootstrapStatus === "error" || !workspace.bootstrap) return <Card><p role="alert">{workspace.bootstrapError ?? "This record is unavailable."}</p></Card>;
  const { bootstrap } = workspace;
  const sectionItems = bootstrap.plan.sections.map((section) => ({ key: section.key, label: section.label?.defaultText ?? section.key }));
  const activeSection = workspace.activeSectionKey ?? bootstrap.plan.sections[0]?.key;
  if (!activeSection) return <Card><p>No authorized sections are available.</p></Card>;
  const navigation: EntityRuntimeHeaderNavigation = {
    sections: sectionItems, activeSection,
    ...(bootstrap.plan.navigation ? { navigation: bootstrap.plan.navigation } : {}),
    ...(bootstrap.plan.summaryView ? { summaryView: bootstrap.plan.summaryView } : {}),
    onSelectSection: (sectionKey) => {
      workspace.selectSection(sectionKey);
      // The parent changes tab mode in the same click. Queue the destination even
      // while a direct tab is still rendered, so the newly mounted 360 document
      // can land there before viewport observation takes over.
      const isContinuousDestination = bootstrap.plan.navigation?.tabs.some((tab) => tab.provider === "360" && tab.sectionKeys.includes(sectionKey)) ?? false;
      manualScrollLock.current = isContinuousDestination;
      setScrollRequest(isContinuousDestination ? sectionKey : undefined);
      onSelectSection?.(sectionKey);
    },
  };
  const overview = bootstrap.plan.navigation?.tabs.find((tab) => tab.provider === "360");
  const continuousItems = continuousSections && overview ? overview.sectionKeys.flatMap((key) => sectionItems.find((item) => item.key === key) ?? []) : [];
  const renderLoadedSection = (sectionKey: string, state: EntityRuntimeSectionState | undefined) => {
    if (!state || state.status === "loading") return <p role="status">Loading section…</p>;
    if (state.status === "context_required") return <SectionAvailabilityState title="Context required" detail="Select an authorized organization and company to view this section." icon={<Building2Icon size={22} />} />;
    if (state.status === "forbidden") return <SectionAvailabilityState title="Not authorized" detail={state.error ?? "You are not authorized to view this section."} />;
    if (state.status === "error") return <div role="alert"><p>{state.error ?? "This section is unavailable."}</p><button type="button" onClick={() => workspace.retrySection(sectionKey)}>Try again</button></div>;
    return state.resource
      ? (renderSection ? renderSection({ sectionKey, resource: state.resource, retry: () => workspace.retrySection(sectionKey) }) : <CompiledEntitySectionContent resource={state.resource} entityCode={entityCode} recordId={recordId} onChanged={() => workspace.invalidate(sectionKey)} onLoadMore={() => workspace.loadMore(sectionKey)} />)
      : <p>This section is unavailable.</p>;
  };
  const selectedContent = <EntitySectionWorkspace sections={sectionItems} activeSection={activeSection} onNavigate={navigation.onSelectSection} label="Record sections" navigation={sectionNavigation}>{renderLoadedSection(activeSection, workspace.sections[activeSection])}</EntitySectionWorkspace>;
  const content = continuousItems.length ? <div className="a-runtime-continuous-sections" aria-label="360 sections">
    {continuousItems.map((item, index) => <ContinuousSection key={item.key} item={item} selected={item.key === activeSection} initial={index === 0}
      state={workspace.sections[item.key]} scrollRoot={continuousScrollRoot} scrollTo={scrollRequest === item.key} onScrollSettled={() => { manualScrollLock.current = false; setScrollRequest(undefined); }} onApproach={() => workspace.preloadSection(item.key)} onObserve={() => { if (manualScrollLock.current) return; workspace.observeSection(item.key); onObserveSection?.(item.key); }}>
      {renderLoadedSection(item.key, workspace.sections[item.key])}
    </ContinuousSection>)}
    {/* Gives the final authorized heading enough trailing scroll range to align with
        the same reading line as every earlier section. */}
    <div className="a-runtime-continuous-sections__tail" aria-hidden="true" />
  </div> : selectedContent;
  return <>{renderHeader(bootstrap.header.values, bootstrap.header.revision, bootstrap.plan.actions, navigation)}{renderBody ? renderBody({ navigation, content }) : content}</>;
}

function SectionAvailabilityState({ title, detail, icon }: { readonly title: string; readonly detail: string; readonly icon?: ReactNode }) {
  return <Card className="a-runtime-section-availability" role="status">{icon ? <span className="a-runtime-section-availability__icon" aria-hidden="true">{icon}</span> : null}<div><h3>{title}</h3><p>{detail}</p></div></Card>;
}

function ContinuousSection({ item, selected, initial, state, scrollRoot, scrollTo, onScrollSettled, onApproach, onObserve, children }: { readonly item: { readonly key: string; readonly label: string }; readonly selected: boolean; readonly initial: boolean; readonly state?: EntityRuntimeSectionState; readonly scrollRoot?: RefObject<HTMLElement | null>; readonly scrollTo: boolean; readonly onScrollSettled: () => void; readonly onApproach: () => void; readonly onObserve: () => void; readonly children: ReactNode }) {
  const root = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null), [near, setNear] = useState(initial || selected);
  useEffect(() => { if (near && (!state || state.status === "idle")) onApproach(); }, [near, onApproach, state]);
  useEffect(() => {
    if (!root.current || typeof IntersectionObserver === "undefined") { if (selected) setNear(true); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      setNear(true);
      if (!state || state.status === "idle") onApproach();
      if (!selected) onObserve();
    }), { root: scrollRoot?.current ?? null, rootMargin: "-12% 0px -80% 0px", threshold: 0 });
    if (heading.current) observer.observe(heading.current);
    return () => observer.disconnect();
  }, [onApproach, onObserve, scrollRoot, selected, state]);
  useEffect(() => {
    if (!scrollTo) return;
    setNear(true);
    let cancelled = false;
    let settled = false;
    let settleTimer: number | undefined;
    let cleanup: (() => void) | undefined;
    const finish = () => {
      if (cancelled || settled) return;
      settled = true;
      cleanup?.();
      onScrollSettled();
    };
    const frame = window.requestAnimationFrame(() => {
      const target = root.current;
      const container = scrollRoot?.current;
      if (!target) { finish(); return; }
      if (!container) {
        target.scrollIntoView({ block: "start", behavior: "smooth" });
        settleTimer = window.setTimeout(finish, 850);
        return;
      }
      // The continuous document owns this scroll surface. Avoid scrollIntoView(),
      // which would also move the application root and its fixed contextual panes.
      const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      const resetSettleTimer = () => {
        if (settleTimer) window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(finish, 180);
      };
      const onScrollEnd = () => finish();
      cleanup = () => {
        container.removeEventListener("scroll", resetSettleTimer);
        container.removeEventListener("scrollend", onScrollEnd);
        if (settleTimer) window.clearTimeout(settleTimer);
      };
      container.addEventListener("scroll", resetSettleTimer, { passive: true });
      container.addEventListener("scrollend", onScrollEnd, { once: true });
      settleTimer = window.setTimeout(finish, 1_200);
      container.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      cleanup?.();
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, [onScrollSettled, scrollRoot, scrollTo]);
  return <section ref={root} id={`entity-runtime-section-${item.key}`} data-runtime-section={item.key} className="a-runtime-continuous-section" aria-labelledby={`entity-runtime-heading-${item.key}`}>
    <h2 ref={heading} id={`entity-runtime-heading-${item.key}`} tabIndex={-1}>{item.label}</h2>
    {near || state ? children : <div className="a-runtime-continuous-section__placeholder" aria-hidden="true" />}
  </section>;
}

export interface EntityRuntimeHeaderNavigation {
  readonly sections: readonly { readonly key: string; readonly label: string }[];
  readonly activeSection: string; readonly navigation?: EntityRuntimeNavigationPlan; readonly summaryView?: EntityRuntimeSummaryViewPlan;
  readonly onSelectSection: (sectionKey: string) => void;
}
