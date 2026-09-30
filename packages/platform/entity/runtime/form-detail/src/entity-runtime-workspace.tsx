"use client";
import { entityRuntimeClient, type EntityRuntimeActionPlan, type EntityRuntimeNavigationPlan, type EntityRuntimeSectionResource, type EntityRuntimeResourceContext, type EntityRuntimeSummaryViewPlan } from "@athyper/platform-entity-descriptor-client";
import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { Building2Icon } from "@athyper/platform-icons";
import { Card } from "@athyper/platform-ui";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { EntitySectionWorkspace } from "./section-workspace";
import { CompiledEntitySectionContent } from "./compiled-section-content";
import { useEntityRuntimeSectionWorkspace, type EntityRuntimeSectionState } from "./use-section-resource";

/** Shared record workspace. Continuous mode is deliberately opt-in: each admitted tab declares continuous or selected section display. */
export function EntityRuntimeWorkspace({
  entityCode, recordId, surfaceKey, deepLinkedSectionKey, contextKey = "default", resourceContext,
  locale = typeof navigator === "undefined" ? "und" : navigator.language, renderHeader, renderSection,
  renderBody, onSelectSection, onObserveSection, sectionNavigation = "rail", continuousSections = false, continuousScrollRoot, collaborationSectionKeys = [],
}: {
  readonly entityCode: string; readonly recordId: string; readonly surfaceKey: string; readonly deepLinkedSectionKey?: string;
  readonly contextKey?: string; readonly resourceContext?: EntityRuntimeResourceContext; readonly locale?: string;
  readonly renderHeader: (header: Readonly<Record<string, unknown>>, revision: string, actions: readonly EntityRuntimeActionPlan[], navigation: EntityRuntimeHeaderNavigation) => ReactNode;
  readonly renderSection?: (input: { readonly sectionKey: string; readonly resource: EntityRuntimeSectionResource; readonly retry: () => void }) => ReactNode;
  readonly renderBody?: (input: { readonly navigation: EntityRuntimeHeaderNavigation; readonly content: ReactNode }) => ReactNode;
  readonly onSelectSection?: (sectionKey: string, tabKey?: string) => void;
  /** Called for a viewport update. Consumers should use replaceState, not pushState. */
  readonly onObserveSection?: (sectionKey: string) => void;
  readonly sectionNavigation?: "rail" | "header";
  readonly continuousSections?: boolean;
  /** The actual scroll surface for continuous mode. Defaults to the viewport. */
  readonly continuousScrollRoot?: RefObject<HTMLElement | null>;
  /** Published section keys exposed by an optional shared collaboration surface. */
  readonly collaborationSectionKeys?: readonly string[];
}) {
  const client = useApiClient(), identity = useSessionIdentity();
  const [scrollRequest, setScrollRequest] = useState<string | undefined>(() => deepLinkedSectionKey);
  // A click has priority over viewport observation until the requested scroll lands.
  // A ref closes the small render gap between the click and the next observer callback.
  const manualScrollLock = useRef(Boolean(deepLinkedSectionKey));
  const settleScroll = useCallback(() => {
    manualScrollLock.current = false;
    setScrollRequest(undefined);
  }, []);
  const cacheScope = useMemo(() => [identity.scope?.tenantId ?? "unbound", identity.scope?.principalId ?? "unbound", identity.scope?.authEpoch ?? 0, contextKey, locale].join(":"), [contextKey, identity.scope?.authEpoch, identity.scope?.principalId, identity.scope?.tenantId, locale]);
  const workspace = useEntityRuntimeSectionWorkspace({ client, entityCode, recordId, surfaceKey, cacheScope, deepLinkedSectionKey, ...(resourceContext ? { resourceContext } : {}) });
  // IntersectionObserver uses a reading line below the pane top. At scrollTop 0,
  // Overview's heading is above that line, so make the document boundary explicit.
  useEffect(() => {
    if (!continuousSections || scrollRequest || manualScrollLock.current) return;
    const container = continuousScrollRoot?.current;
    const group = workspace.bootstrap?.plan.navigation?.tabs.find((tab) => tab.sectionDisplay === "continuous" && tab.sectionKeys.includes(workspace.activeSectionKey ?? ""));
    if (workspace.activeSectionKey && !group?.sectionKeys.includes(workspace.activeSectionKey)) return;
    const firstSection = group?.sectionKeys[0];
    if (!container || !firstSection) return;
    const activateFirstAtTop = () => {
      if (container.scrollTop > 1 || manualScrollLock.current) return;
      workspace.observeSection(firstSection);
      onObserveSection?.(firstSection);
    };
    activateFirstAtTop();
    container.addEventListener("scroll", activateFirstAtTop, { passive: true });
    return () => container.removeEventListener("scroll", activateFirstAtTop);
  }, [continuousScrollRoot, continuousSections, onObserveSection, scrollRequest, workspace.bootstrap, workspace.activeSectionKey, workspace.observeSection]);
  const { bootstrap } = workspace;
  const sectionItems = useMemo(() => bootstrap?.plan.sections.map(section => ({key:section.key,label:section.label?.defaultText ?? section.key})) ?? [],[bootstrap?.plan.sections]);
  const activeSection = workspace.activeSectionKey ?? bootstrap?.plan.sections[0]?.key;
  const collaborationKeys = JSON.stringify(collaborationSectionKeys);
  const collaborationSections = useMemo(() => (JSON.parse(collaborationKeys) as string[]).flatMap(key => sectionItems.find(section => section.key === key) ?? []),[collaborationKeys,sectionItems]);
  const selectSection = useCallback((sectionKey:string, tabKey?:string) => {
    workspace.selectSection(sectionKey);
    const continuous = bootstrap?.plan.navigation?.tabs.some(tab => tab.sectionDisplay === "continuous" && tab.sectionKeys.includes(sectionKey)) ?? false;
    manualScrollLock.current = continuous;
    setScrollRequest(continuous ? sectionKey : undefined);
    onSelectSection?.(sectionKey, tabKey);
  },[workspace.selectSection,bootstrap?.plan.navigation,onSelectSection,continuousSections]);
  const renderSectionRef = useRef<(sectionKey:string)=>ReactNode>(()=>null);
  const renderCollaboration = useCallback((sectionKey:string)=>renderSectionRef.current(sectionKey),[]);
  const navigation = useMemo<EntityRuntimeHeaderNavigation>(() => ({
    sections:sectionItems,activeSection:activeSection ?? "",
    ...(bootstrap?.plan.navigation ? {navigation:bootstrap.plan.navigation} : {}),
    ...(bootstrap?.plan.summaryView ? {summaryView:bootstrap.plan.summaryView} : {}),
    onSelectSection:selectSection,
    ...(collaborationSections.length ? {collaboration:{sections:collaborationSections,preloadSection:workspace.preloadSection,renderSection:renderCollaboration}} : {}),
  }),[sectionItems,activeSection,bootstrap?.plan.navigation,bootstrap?.plan.summaryView,selectSection,collaborationSections,workspace.preloadSection,workspace.sections,renderCollaboration]);
  if (workspace.bootstrapStatus === "loading") return <Card><p role="status">Loading record…</p></Card>;
  if (workspace.bootstrapStatus === "error" || !bootstrap) return <Card><p role="alert">{workspace.bootstrapError ?? "This record is unavailable."}</p></Card>;
  if (!activeSection) return <Card><p>No authorized sections are available.</p></Card>;
  const activeGroup = bootstrap.plan.navigation?.tabs.find(tab => tab.sectionKeys.includes(activeSection));
  const continuousItems = continuousSections && activeGroup?.sectionDisplay === "continuous" ? activeGroup.sectionKeys.flatMap((key) => sectionItems.find((item) => item.key === key) ?? []) : [];
  const renderLoadedSection = (sectionKey: string, state: EntityRuntimeSectionState | undefined) => {
    // Keep an already admitted section mounted during refresh so drafts and action dialogs survive.
    if (!state || (state.status === "loading" && !state.resource)) return <p role="status">Loading section…</p>;
    if (state.status === "context_required") return <SectionAvailabilityState title="Context required" detail="Select an authorized organization and company to view this section." icon={<Building2Icon size={22} />} />;
    if (state.status === "forbidden") return <SectionAvailabilityState title="Section unavailable" detail="Your current access does not include this record section. Refresh the record after changing organization or company context." icon={<Building2Icon size={22} />} />;
    if (state.status === "error") return <div role="alert"><p>{state.error ?? "This section is unavailable."}</p><button type="button" onClick={() => workspace.retrySection(sectionKey)}>Try again</button></div>;
    const loadThreadPage = (threadRootId: string, cursor?: string) => entityRuntimeClient.section(client, {
      entityCode, recordId, surfaceKey, sectionKey, ...(cursor ? { cursor } : {}),
      resourceContext: { ...resourceContext, threadRootId },
    });
    return state.resource
      ? (renderSection ? renderSection({ sectionKey, resource: state.resource, retry: () => workspace.retrySection(sectionKey) }) : <CompiledEntitySectionContent resource={state.resource} entityCode={entityCode} recordId={recordId} onChanged={() => workspace.invalidate(sectionKey)} loadingMore={state.loadingMore} loadMoreError={state.loadMoreError} onLoadMore={() => workspace.loadMore(sectionKey)} onLoadMentionsPage={(cursor, signal) => entityRuntimeClient.section(client, {entityCode, recordId, surfaceKey, sectionKey, cursor, signal, resourceContext: {...resourceContext, commentFilter: "mentions"}})} onLoadThreadPage={state.resource.presentation.rendererKey === "platform.comments.v1" ? loadThreadPage : undefined} />)
      : <p>This section is unavailable.</p>;
  };
  renderSectionRef.current = sectionKey => renderLoadedSection(sectionKey, workspace.sections[sectionKey]);
  const selectedContent = <EntitySectionWorkspace sections={sectionItems} activeSection={activeSection} onNavigate={navigation.onSelectSection} label="Record sections" navigation={sectionNavigation}>{renderLoadedSection(activeSection, workspace.sections[activeSection])}</EntitySectionWorkspace>;
  const content = continuousItems.length ? <div className="a-runtime-continuous-sections" aria-label={`${activeGroup?.label.defaultText ?? "Record"} sections`}>
    {continuousItems.map((item, index) => <ContinuousSection key={item.key} item={item} selected={item.key === activeSection} initial={index === 0}
      state={workspace.sections[item.key]} scrollRoot={continuousScrollRoot} scrollTo={scrollRequest === item.key} onScrollSettled={settleScroll} onApproach={() => workspace.preloadSection(item.key)} onObserve={() => { if (manualScrollLock.current) return; workspace.observeSection(item.key); onObserveSection?.(item.key); }}>
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
  useLayoutEffect(() => {
    if (!scrollTo) return;
    setNear(true);
    let cancelled = false;
    let focused = false;
    const target = root.current;
    if (!target) return;
    const align = () => {
      if (cancelled) return;
      const container = scrollRoot?.current;
      // A supplied pane may not have attached its ref on the first layout pass.
      // Never move the outer page while waiting for that pane.
      if (scrollRoot && !container) return;
      if (container) {
        const top = target.getBoundingClientRect().top - container.getBoundingClientRect().top
          - container.clientTop + container.scrollTop;
        if (Math.abs(container.scrollTop - Math.max(0, top)) > 1)
          container.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      } else {
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
      if (!focused) {
        heading.current?.focus({ preventScroll: true });
        focused = true;
      }
    };
    // Explicit navigation is a destination jump, not a tour through the document.
    align();
    const frame = window.requestAnimationFrame(align);
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(align);
    // Preceding lazy sections can expand without changing the target's own size.
    // Observe each section as well as the document and keep the selected heading anchored.
    const documentRoot = target.parentElement;
    if (documentRoot) {
      observer?.observe(documentRoot);
      for (const child of documentRoot.children) observer?.observe(child);
    }
    const release = () => {
      if (cancelled) return;
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      onScrollSettled();
    };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) release();
    };
    // Relinquish anchoring immediately on user intent, before native scrolling.
    const events = ["wheel", "touchstart", "pointerdown"] as const;
    for (const event of events) document.addEventListener(event, release, { capture: true, passive: true });
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.cancelAnimationFrame(frame);
      for (const event of events) document.removeEventListener(event, release, true);
      document.removeEventListener("keydown", onKey, true);
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
  readonly onSelectSection: (sectionKey: string, tabKey?: string) => void;
  /** A browser projection backed by this workspace's admitted section cache. */
  readonly collaboration?: Readonly<{
    readonly sections: readonly { readonly key: string; readonly label: string }[];
    readonly preloadSection: (sectionKey: string) => void;
    readonly renderSection: (sectionKey: string) => ReactNode;
  }>;
}
