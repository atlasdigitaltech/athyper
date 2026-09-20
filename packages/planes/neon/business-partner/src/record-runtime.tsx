"use client";
import { EntityRuntimeWorkspace, invalidateEntityRuntimeSectionCache, summaryRenderers, type EntityRuntimeHeaderNavigation } from "@athyper/platform-entity-form-detail";
import { PageHeader, PageWorkspace, useRecordBreadcrumb, useRecordPage } from "@athyper/platform-shell";
import { ChevronDownIcon, ContactRoundIcon, SettingsIcon } from "@athyper/platform-icons";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { Badge, Button } from "@athyper/platform-ui";
import { entityRuntimeClient, type EntityRuntimeActionPlan, type EntityRuntimeResourceContext } from "@athyper/platform-entity-descriptor-client";
import { BUSINESS_PARTNER_360_PANEL } from "./360/panel-definition";
import { useEffect, useRef, useState, type RefObject } from "react";

/** BP domain entry only supplies its public entity coordinate; the shared runtime owns reads. */
export function BusinessPartnerRecordRuntime({ businessPartnerId }: { readonly businessPartnerId: string }) {
  useRecordPage();
  const http = useApiClient();
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [breadcrumbLabel, setBreadcrumbLabel] = useState("Business Partner");
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useRecordBreadcrumb(breadcrumbLabel, `/mdg/business-partner/${encodeURIComponent(businessPartnerId)}`);
  const [section, setSection] = useState(readSection);
  const [tab, setTab] = useState(readTab);
  const [resourceContext, setResourceContext] = useState(readResourceContext);
  const [actionError, setActionError] = useState<string>();
  const initialViewPreference = readRecordViewPreference();
  const [view, setView] = useState<"content" | "summary">(() => initialViewPreference.summary ? "summary" : "content");
  const [sectionView, setSectionView] = useState(() => initialViewPreference.section);
  const [pendingAction, setPendingAction] = useState<string>();
  useEffect(() => {
    const update = () => { setSection(readSection()); setTab(readTab()); setResourceContext(readResourceContext()); };
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  useEffect(() => {
    // The browser root is only used to dismiss the record identity. Once it has
    // passed, hand scrolling to the record panes instead of leaving a second page
    // scroll surface beneath a fixed workspace.
    const update = () => setHeaderCollapsed((collapsed) => collapsed ? window.scrollY > 16 : window.scrollY > 160);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  useEffect(() => { writeRecordViewPreference({ summary: view === "summary", section: sectionView }); }, [sectionView, view]);
  return <PageWorkspace width="wide" className={`bp360${headerCollapsed ? " bp360--header-collapsed" : ""}`}>
    <EntityRuntimeWorkspace
      entityCode="business_partner"
      recordId={businessPartnerId}
      surfaceKey="detail"
      deepLinkedSectionKey={section}
      contextKey={resourceContextKey(resourceContext)}
      resourceContext={resourceContext}
      sectionNavigation="header"
      continuousSections={sectionView && tab === "360"}
      continuousScrollRoot={contentScrollRef}
      onSelectSection={(sectionKey) => {
        const next = new URL(window.location.href);
        next.searchParams.set("section", sectionKey);
        window.history.pushState(window.history.state, "", next);
        setSection(sectionKey);
      }}
      onObserveSection={(sectionKey) => {
        const next = new URL(window.location.href);
        next.searchParams.set("section", sectionKey);
        window.history.replaceState(window.history.state, "", next);
        setSection(sectionKey);
      }}
      renderHeader={(values, revision, actions, navigation) => <div className="a-record-page-header">
        <RecordBreadcrumbRegistration values={values} onChange={setBreadcrumbLabel} />
        <PageHeader
          level="collection"
          title={text(values.name, "Business Partner")}
          icon={<ContactRoundIcon />}
          description={<span className="bp360-record-identity-line"><span>{[text(values.code), "Business Partner"].filter(Boolean).join(" · ")}</span><Badge tone={text(values.status).toLowerCase() === "active" ? "success" : "neutral"}>{text(values.status, "Active")}</Badge></span>}
          actions={<BusinessPartnerHeaderActions
            actions={actions}
            pendingAction={pendingAction}
            error={actionError}
            onStartFlow={(operationKey) => {
              const destination = operationKey === "request_role_extension"
                ? `/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/roles/new`
                : operationKey === "assign_organization_scope"
                  ? `/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/scope/new?kind=assign_organization`
                  : operationKey === "configure_company_scope"
                    ? `/mdg/business-partner/${encodeURIComponent(businessPartnerId)}/scope/new?kind=configure_company`
                    : undefined;
              if (destination) window.location.assign(destination);
            }}
            onRequestChange={async () => {
              setPendingAction("request_change"); setActionError(undefined);
              try {
                const receipt = await entityRuntimeClient.operation(http, {
                  entityCode: "business_partner", recordId: businessPartnerId, operationKey: "request_change",
                  expectedVersion: Number(revision), idempotencyKey: crypto.randomUUID(), input: {},
                });
                const requestId = typeof receipt.requestId === "string" ? receipt.requestId : undefined;
                if (!requestId) throw new Error("The governed request did not return a draft identity.");
                const changed = Array.isArray(receipt.changedResources) ? receipt.changedResources : [];
                for (const resource of changed) if (resource && typeof resource === "object" && (resource as Record<string, unknown>).entityCode === "business_partner" && (resource as Record<string, unknown>).recordId === businessPartnerId)
                  invalidateEntityRuntimeSectionCache({ cacheScope: "default", entityCode: "business_partner", recordId: businessPartnerId, surfaceKey: "detail" });
                window.location.assign(`/mdg/business-partner/requests/${encodeURIComponent(requestId)}/edit`);
              } catch (cause) { setActionError(cause instanceof Error ? cause.message : "Unable to start the change request."); }
              finally { setPendingAction(undefined); }
            }}
          />}
        />
        <BusinessPartnerModeNavigation navigation={navigation} view={view} sectionView={sectionView} onViewChange={setView} onSectionViewChange={setSectionView} onTabChange={setTab} />
      </div>}
      renderBody={({ navigation, content }) => <BusinessPartnerRecordBody
        navigation={navigation}
        content={content}
        view={view}
        sectionView={sectionView && tab === "360"}
        businessPartnerId={businessPartnerId}
        resourceContext={resourceContext}
        contentScrollRef={contentScrollRef}
      />}
    />
  </PageWorkspace>;
}

function RecordBreadcrumbRegistration({ values, onChange }: { readonly values: Readonly<Record<string, unknown>>; readonly onChange: (label: string) => void }) {
  // `name` and `code` are semantic header bindings resolved from the published header metadata.
  const name = text(values.name), code = text(values.code);
  const label = name && code ? `${name} (${code})` : name || code || "Business Partner";
  useEffect(() => { onChange(label); }, [label, onChange]);
  return null;
}

function BusinessPartnerModeNavigation({ navigation, view, sectionView, onViewChange, onSectionViewChange, onTabChange }: { readonly navigation: EntityRuntimeHeaderNavigation; readonly view: "content" | "summary"; readonly sectionView: boolean; readonly onViewChange: (view: "content" | "summary") => void; readonly onSectionViewChange: (value: boolean) => void; readonly onTabChange: (tab: string) => void }) {
  const modeMenu = useDismissibleDetails(), viewMenu = useDismissibleDetails();
  const available = new Map(navigation.sections.map((section) => [section.key, section]));
  const configuredTabs = navigation.navigation?.tabs ?? BUSINESS_PARTNER_360_PANEL.tabs.map((tab) => ({
    key: tab.key,
    label: { labelKey: `business_partner.tabs.${tab.key}`, defaultText: tab.label },
    provider: tab.provider,
    sectionKeys: tab.provider === "360" ? BUSINESS_PARTNER_360_PANEL.sections : [tab.sectionKey!],
  }));
  const overviewTab = configuredTabs.find((tab) => tab.provider === "360");
  const overviewSections = (overviewTab?.sectionKeys ?? []).flatMap((key) => available.get(key) ?? []);
  const directTabs = configuredTabs.filter((tab) => tab.provider === "section" && tab.sectionKeys.some((key) => available.has(key)));
  const overviewActive = overviewSections.some((section) => section.key === navigation.activeSection);
  return <nav className="a-record-360__tabs" aria-label="Record views">
    <details ref={modeMenu} className="a-record-360__group" data-active={overviewActive || undefined}>
      <summary aria-current={overviewActive ? "page" : undefined}>
        360 View <ChevronDownIcon aria-hidden="true" />
      </summary>
      <div role="menu" aria-label="360 View sections">
        {overviewSections.map((section) => <button
          key={section.key}
          type="button"
          role="menuitem"
          aria-current={section.key === navigation.activeSection ? "page" : undefined}
          onClick={() => {
            selectSection(navigation, section.key, overviewTab?.key ?? "360", onTabChange);
            modeMenu.current?.removeAttribute("open");
          }}
        >{section.label}</button>)}
      </div>
    </details>
    {directTabs.map((tab) => <button
      key={tab.key}
      type="button"
      aria-current={tab.sectionKeys.includes(navigation.activeSection) ? "page" : undefined}
      onClick={() => selectSection(navigation, tab.sectionKeys[0]!, tab.key, onTabChange)}
    >{tab.label.defaultText}</button>)}
    <details ref={viewMenu} className="a-record-360__view-control">
      <summary aria-label="View settings"><SettingsIcon aria-hidden="true" /></summary>
      <div role="menu" aria-label="View settings">
        <p>View settings</p>
        <button type="button" role="menuitemcheckbox" aria-checked="true" disabled><span className="a-record-360__view-setting-copy">Content view</span><span className="a-record-360__toggle" aria-hidden="true" /></button>
        <button type="button" role="menuitemcheckbox" aria-checked={sectionView} onClick={() => { onSectionViewChange(!sectionView); viewMenu.current?.removeAttribute("open"); }}><span className="a-record-360__view-setting-copy">Section view</span><span className="a-record-360__toggle" aria-hidden="true" /></button>
        {navigation.summaryView ? <button type="button" role="menuitemcheckbox" aria-checked={view === "summary"} onClick={() => { onViewChange(view === "summary" ? "content" : "summary"); viewMenu.current?.removeAttribute("open"); }}><span className="a-record-360__view-setting-copy">Summary view</span><span className="a-record-360__toggle" aria-hidden="true" /></button> : null}
      </div>
    </details>
  </nav>;
}
function BusinessPartnerRecordBody({ navigation, content, view, sectionView, businessPartnerId, resourceContext, contentScrollRef }: { readonly navigation: EntityRuntimeHeaderNavigation; readonly content: React.ReactNode; readonly view: "content" | "summary"; readonly sectionView: boolean; readonly businessPartnerId: string; readonly resourceContext?: EntityRuntimeResourceContext; readonly contentScrollRef: RefObject<HTMLDivElement | null> }) {
  const http = useApiClient();
  const [state, setState] = useState<{ loading: boolean; cards?: readonly Readonly<{ readonly key: string; readonly state: string; readonly data?: unknown }>[]; error?: string }>({ loading: false });
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (view !== "summary" || !navigation.summaryView) return;
    const controller = new AbortController();
    setState({ loading: true });
    entityRuntimeClient.summary(http, { entityCode: "business_partner", recordId: businessPartnerId, surfaceKey: "detail", ...(resourceContext ? { resourceContext } : {}), signal: controller.signal })
      .then((value) => !controller.signal.aborted && setState({ loading: false, cards: value.cards }))
      .catch((error) => !controller.signal.aborted && setState({ loading: false, error: error instanceof Error ? error.message : "Summary is unavailable." }));
    return () => controller.abort();
  }, [businessPartnerId, http, navigation.summaryView, resourceContext, view]);
  const overviewKeys = navigation.navigation?.tabs.find((tab) => tab.provider === "360")?.sectionKeys ?? BUSINESS_PARTNER_360_PANEL.sections;
  const overviewSections = overviewKeys.flatMap((key) => navigation.sections.find((section) => section.key === key) ?? []);
  const activeOverviewSection = overviewSections.find((section) => section.key === navigation.activeSection);
  useEffect(() => () => { if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current); }, []);
  const pinnedPanels = sectionView || view === "summary";
  const markScrolling = () => {
    setIsScrolling(true);
    if (scrollTimeout.current) window.clearTimeout(scrollTimeout.current);
    scrollTimeout.current = window.setTimeout(() => setIsScrolling(false), 700);
  };
  return <div className={`bp360-record-body${view === "summary" ? " bp360-record-body--summary" : ""}${sectionView ? " bp360-record-body--sections" : ""}${pinnedPanels ? " bp360-record-body--pinned" : ""}`}>
    {sectionView ? <aside className="bp360-section-outline" aria-label="360 sections">{overviewSections.map((section) => <button key={section.key} type="button" aria-current={section.key === navigation.activeSection ? "page" : undefined} onClick={() => navigation.onSelectSection(section.key)}>{section.label}</button>)}</aside> : null}
    <div ref={contentScrollRef} className={`bp360-record-content${isScrolling ? " is-scrolling" : ""}`} aria-label="Record content" onScroll={markScrolling}>
      {!sectionView && activeOverviewSection ? <header className="bp360-record-content__context">
        <h2>{activeOverviewSection.label}</h2>
      </header> : null}
      {content}
    </div>
    {view === "summary" && navigation.summaryView ? <aside className="bp360-summary-view" aria-label="Record summary">
      {navigation.summaryView.cards.map((card) => {
        const result = state.cards?.find((item) => item.key === card.key);
        return <section key={card.key}><h2>{card.label.defaultText}</h2>
          {state.loading && !result ? <p role="status">Loading…</p> : result?.state === "empty" ? <p>No designated record.</p> : result?.state === "context_required" ? <p>Select context to view this summary.</p> : result?.state === "unavailable" ? <p>Unavailable.</p> : result?.data ? <SummaryData value={result.data} rendererKey={card.rendererKey} /> : state.error ? <p role="alert">{state.error}</p> : <p>Unavailable.</p>}
        </section>;
      })}
    </aside> : null}
  </div>;
}
function SummaryData({ value, rendererKey }: { readonly value: unknown; readonly rendererKey: string }) {
  const Renderer = summaryRenderers[rendererKey];
  if (Renderer) return <>{Renderer({ data: value })}</>;
  if (!value || typeof value !== "object" || Array.isArray(value)) return <p>{String(value ?? "—")}</p>;
  return <dl>{Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== null && entry !== undefined && entry !== "").slice(0, 6).map(([key, entry]) => <div key={key}><dt>{key.replace(/[_-]/g, " ")}</dt><dd>{Array.isArray(entry) ? entry.join(", ") : typeof entry === "object" ? "Available" : String(entry)}</dd></div>)}</dl>;
}

function useDismissibleDetails() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (ref.current?.open && event.target instanceof Node && !ref.current.contains(event.target)) ref.current.removeAttribute("open"); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape" && ref.current?.open) { ref.current.removeAttribute("open"); ref.current.querySelector<HTMLElement>("summary")?.focus(); } };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", escape); };
  }, []);
  return ref;
}

function selectSection(navigation: EntityRuntimeHeaderNavigation, sectionKey: string, tabKey: string, onTabChange: (tab: string) => void) {
  navigation.onSelectSection(sectionKey);
  const next = new URL(window.location.href);
  next.searchParams.set("tab", tabKey);
  next.searchParams.set("section", sectionKey);
  window.history.replaceState(window.history.state, "", next);
  onTabChange(tabKey);
}

function BusinessPartnerHeaderActions({ actions, pendingAction, error, onRequestChange, onStartFlow }: { readonly actions: readonly EntityRuntimeActionPlan[]; readonly pendingAction?: string; readonly error?: string; readonly onRequestChange: () => Promise<void>; readonly onStartFlow: (operationKey: string) => void }) {
  const startFlows = actions.filter((action) => action.interaction === "start_flow");
  if (!startFlows.length) return null;
  const menu = useDismissibleDetails();
  return <details ref={menu} className="a-record-page-header__actions-menu">
    <summary className="a-button a-button--secondary">Actions</summary>
    <div>
    {startFlows.map((action) => action.operationKey === "request_change"
      ? <Button key={action.operationKey} type="button" loading={pendingAction === action.operationKey} onClick={() => { menu.current?.removeAttribute("open"); void onRequestChange(); }}>{action.label.defaultText}</Button>
      : <Button key={action.operationKey} type="button" variant="secondary" onClick={() => { menu.current?.removeAttribute("open"); onStartFlow(action.operationKey); }}>{action.label.defaultText}</Button>)}
    {error ? <p role="alert">{error}</p> : null}
    </div>
  </details>;
}

const RECORD_VIEW_PREFERENCE_KEY = "athyper.record-view.business-partner.v1";
function readRecordViewPreference(): { readonly summary: boolean; readonly section: boolean } {
  if (typeof window === "undefined") return { summary: false, section: false };
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(RECORD_VIEW_PREFERENCE_KEY) ?? "{}");
    return value && typeof value === "object" ? {
      summary: (value as Record<string, unknown>).summary === true,
      section: (value as Record<string, unknown>).section === true,
    } : { summary: false, section: false };
  } catch { return { summary: false, section: false }; }
}
function writeRecordViewPreference(value: { readonly summary: boolean; readonly section: boolean }): void {
  try { window.localStorage.setItem(RECORD_VIEW_PREFERENCE_KEY, JSON.stringify(value)); } catch { /* Storage can be unavailable in private/restricted browsers. */ }
}

function readTab(): string {
  if (typeof window === "undefined") return "360";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab && /^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(tab) ? tab : "360";
}
function readSection(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  const value = query.get("section");
  if (value && /^[A-Za-z][A-Za-z0-9_.-]{0,126}$/.test(value)) return value;
  const tab = query.get("tab");
  const configured = BUSINESS_PARTNER_360_PANEL.tabs.find((item) => item.key === tab);
  return configured?.provider === "section" ? configured.sectionKey : tab === "360" ? BUSINESS_PARTNER_360_PANEL.sections[0] : undefined;
}
function readResourceContext(): EntityRuntimeResourceContext | undefined {
  if (typeof window === "undefined") return undefined;
  const query = new URLSearchParams(window.location.search);
  const uuid = (key: string) => {
    const value = query.get(key);
    return value && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : undefined;
  };
  const asOf = query.get("asOf");
  const roleLens = query.get("roleLens");
  const value: EntityRuntimeResourceContext = {
    ...(uuid("operatingOrganizationId") ? { operatingOrganizationId: uuid("operatingOrganizationId")! } : {}),
    ...(uuid("companyCodeId") ? { companyCodeId: uuid("companyCodeId")! } : {}),
    ...(uuid("legalEntityId") ? { legalEntityId: uuid("legalEntityId")! } : {}),
    ...(asOf && /^\d{4}-\d{2}-\d{2}$/.test(asOf) ? { asOf } : {}),
    ...(roleLens === "all" || roleLens === "supplier" || roleLens === "customer" ? { roleLens } : {}),
  };
  return Object.keys(value).length ? value : undefined;
}
function resourceContextKey(value?: EntityRuntimeResourceContext): string {
  return value ? JSON.stringify(value) : "unscoped";
}
function text(value: unknown, fallback = ""): string { return typeof value === "string" && value.trim() ? value : fallback; }
