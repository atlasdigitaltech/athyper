"use client";
import { BUSINESS_PARTNER_360_PANEL } from "./panel-definition";
import {
  EntityRecord360ModeNavigation,
  EntityRecord360Panel,
} from "@athyper/platform-entity-form-detail";
import { PrimaryDetails } from "./components/primary-details";
import { ResourceSection } from "./components/resource-section";
import {
  PageWorkspace,
  PageResourceBoundary,
  useRecordPage,
  useAtlasBusinessContextPublisher,
} from "@athyper/platform-shell";

import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createBusinessPartner360Client,
  summaryQueryKey,
  type RoleLens,
  type Summary,
} from "./business-partner-360-client";
import {
  type BusinessPartner360State,
  BusinessPartner360Provider,
} from "./business-partner-360-context";
import {
  AccessScopeCard,
  RecordTechnicalDetails,
} from "./components/access-scope";
import { Overview } from "./components/overview";
import { TransactionContextBar } from "./components/transaction-context-bar";
import { IdentityHeader } from "./components/identity-header";
import {
  RestrictedSection,
  ScopeSelectionState,
  SectionStatePanel,
} from "./components/section-state";
import { CommonSection } from "./components/common-section";
import type { CommonSectionCode } from "./business-partner-360-section-client";
import {
  CustomerCompanySection,
  SupplierCompanySection,
} from "./components/role-company-sections";
import {
  BankingSection,
  CreditReviewSection,
  SupplierControlsSection,
} from "./components/commercial-controls";
import {
  BusinessActivitySection,
  GovernanceActivitySection,
  RequestsSection,
} from "./components/explainability-sections";
import { NetworkSection } from "./components/network-section";
import { RolesWorkspace } from "./components/roles-workspace";
import { realignPartnerPanel } from "./panel-definition";
import { sectionLabel } from "./section-registry";

export function BusinessPartner360Shell({
  businessPartnerId,
}: {
  readonly businessPartnerId: string;
}) {
  useRecordPage();
  const http = useApiClient(),
    identity = useSessionIdentity();
  const client = useMemo(() => createBusinessPartner360Client(http), [http]);
  const [summary, setSummary] = useState<Summary>(),
    [loadedKey, setLoadedKey] = useState<string>(),
    [error, setError] = useState<string>(),
    [revision, setRevision] = useState(0),
    [retry, setRetry] = useState(0),
    [showTransactionContext, setShowTransactionContext] = useState(false),
    [requiredCoordinates, setRequiredCoordinates] =
      useState<readonly string[]>(),
    [, setScrollRevision] = useState(0),
    modeNavigationRef = useRef<HTMLDivElement>(null),
    modeNavigationId = useId();
  const url = readUrl();
  const authEpoch = identity.scope?.authEpoch ?? 0;
  const previousBusinessPartnerId = useRef(businessPartnerId);
  const previousAuthEpoch = useRef(authEpoch);
  // Record admission uses the published directory policy on the server.
  // Only explicit record-link coordinates are transaction context.
  const { operatingOrganizationId, companyCodeId, legalEntityId } = url;
  const query = useMemo(
    () => ({
      tenantId: identity.scope?.tenantId ?? "unbound",
      principalId: identity.scope?.principalId ?? "unbound",
      businessPartnerId,
      roleLens: url.roleLens,
      authEpoch,
      ...(operatingOrganizationId ? { operatingOrganizationId } : {}),
      ...(companyCodeId ? { companyCodeId } : {}),
      ...(legalEntityId ? { legalEntityId } : {}),
      ...(url.asOf ? { asOf: url.asOf } : {}),
    }),
    [
      identity.scope?.tenantId,
      identity.scope?.principalId,
      businessPartnerId,
      url.roleLens,
      url.asOf,
      operatingOrganizationId,
      companyCodeId,
      legalEntityId,
      authEpoch,
    ],
  );
  const panel = useMemo(
    () =>
      realignPartnerPanel(
    summary?.recordHeader?.panel ?? BUSINESS_PARTNER_360_PANEL,
      ),
    [summary?.recordHeader?.panel],
  );
  const overviewTab = panel.tabs.find((tab) => tab.provider === "360")!;
  const legacyTab = panel.tabs.find((tab) => tab.sectionKey === url.section);
  const tab =
    (["roles-scope", "supplier-company", "customer-company"].includes(
      url.section,
    )
      ? panel.tabs.find((tab) => tab.key === "roles")
      : undefined) ??
    panel.tabs.find((tab) => tab.key === url.tab) ??
    legacyTab ??
    overviewTab;
  const railSections = panel.sections.filter((code) =>
    summary?.sections.some((item) => item.code === code),
  );
  const section =
    tab.sectionKey ??
    (railSections.includes(url.section)
      ? url.section
      : (railSections[0] ?? "overview"));
  const key = summaryQueryKey(query).join(":");
  useAtlasBusinessContextPublisher(
    loadedKey === key && summary && summary.identity.id === businessPartnerId
      ? {
          kind: "record",
          entityCode: "business_partner",
          recordId: businessPartnerId,
          section,
          savedRevision: String(summary.businessPartnerVersion),
          roleLens: url.roleLens,
          dirty: false,
          asOf: url.asOf ? `${url.asOf}T00:00:00.000Z` : undefined,
          workContext:
            summary.scope.operatingOrganizationId ||
            summary.scope.companyCodeId ||
            summary.scope.legalEntityId
              ? {
                  operatingOrganizationId:
                    summary.scope.operatingOrganizationId,
                  companyCodeId: summary.scope.companyCodeId,
                  legalEntityId: summary.scope.legalEntityId,
                }
              : undefined,
        }
      : undefined,
  );

  useEffect(() => {
    if (!showTransactionContext) return;
    const frame = window.requestAnimationFrame(() => {
      const editor = document.getElementById("bp-transaction-context");
      editor?.focus({ preventScroll: true });
      editor?.scrollIntoView?.({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showTransactionContext]);

  useEffect(() => {
    const onPopState = () => {
      setRevision((value) => value + 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (
      previousBusinessPartnerId.current !== businessPartnerId ||
      previousAuthEpoch.current !== authEpoch
    ) {
      previousBusinessPartnerId.current = businessPartnerId;
      previousAuthEpoch.current = authEpoch;
      setSummary(undefined);
    }
    setError(undefined);
    client
      .summary(query, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setSummary(value);
          setLoadedKey(key);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Business Partner summary is unavailable",
          );
      });
    return () => controller.abort();
  }, [client, key, businessPartnerId, authEpoch, retry]);
  const navigate = useCallback(
    (
      patch: Readonly<{ section?: string; roleLens?: RoleLens; tab?: string }>,
    ) => {
      const next = new URL(window.location.href);
      if (patch.section) next.searchParams.set("section", patch.section);
      if (patch.tab) next.searchParams.set("tab", patch.tab);
      if (patch.roleLens) {
        if (patch.roleLens === "all") next.searchParams.delete("roleLens");
        else next.searchParams.set("roleLens", patch.roleLens);
      }
      window.history.pushState({}, "", next);
      setRevision((value) => value + 1);
    },
    [],
  );

  const selectSection = useCallback(
    (code: string) =>
    navigate({
      section: code,
      tab:
        (["supplier-company", "customer-company"].includes(code)
          ? "roles"
          : undefined) ??
        panel.tabs.find((tab) => tab.sectionKey === code)?.key ??
        overviewTab.key,
      }),
    [navigate, panel, overviewTab.key],
  );
  const contextValue = useMemo<BusinessPartner360State | undefined>(
    () =>
      summary
        ? {
        summary,
        section,
        roleLens: url.roleLens,
        selectSection,
        openTransactionContext: (decision) => {
          setRequiredCoordinates(decision?.missingCoordinates);
          setShowTransactionContext(true);
        },
        retryDecisions: () => {
          setSummary(undefined);
          setRetry((value) => value + 1);
        },
        selectRole: (roleLens) => navigate({ roleLens }),
        selectScope: (operatingOrganizationId, companyCodeId) => {
          setShowTransactionContext(false);
          setSummary(undefined);
          setRetry((value) => value + 1);
          const next = new URL(window.location.href);
          next.searchParams.set(
            "operatingOrganizationId",
            operatingOrganizationId,
          );
          if (companyCodeId)
            next.searchParams.set("companyCodeId", companyCodeId);
          else next.searchParams.delete("companyCodeId");
          next.searchParams.delete("legalEntityId");
          window.history.pushState({}, "", next);
          setRevision((value) => value + 1);
        },
          }
        : undefined,
    [summary, section, url.roleLens, selectSection, navigate],
  );
  if (error)
    return (
      <PageResourceBoundary
        status="error"
        loading={null}
        empty={null}
        error={
          <PageWorkspace
            className="bp360"
            header={{ level: "collection", title: "Business Partner" }}
          >
          <Card>
            <h2>Unavailable</h2>
            <p>{error}</p>
            <button
              className="a-button a-button--secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
            {operatingOrganizationId || companyCodeId || legalEntityId ? (
              <button
                className="a-button a-button--secondary"
                onClick={() => {
                  const next = clearBusinessPartnerTransactionContext(
                    new URL(window.location.href),
                  );
                  window.history.replaceState({}, "", next);
                  setRevision((value) => value + 1);
                }}
              >
                Clear transaction context
              </button>
            ) : null}
          </Card>
          </PageWorkspace>
        }
      >
        {null}
      </PageResourceBoundary>
    );
  if (
    !summary ||
    loadedKey !== key ||
    summary.identity.id !== businessPartnerId
  )
    return (
      <PageResourceBoundary
        status="loading"
        error={null}
        empty={null}
        loading={
          <PageWorkspace
            className="bp360"
            aria-label="Loading Business Partner"
            header={{ level: "collection", title: "Loading Business Partner" }}
          >
          <Skeleton className="bp360-shell-skeleton" />
          </PageWorkspace>
        }
      >
        {null}
      </PageResourceBoundary>
    );
  const renderSection = (section: string) => {
    const manifest = summary.sections.find((item) => item.code === section);
    if (!manifest) return <RestrictedSection />;
    return manifest?.authorization === "restricted" ? (
      <RestrictedSection />
    ) : manifest?.reasonCode === "BP_360_SCOPE_REQUIRED" ? (
      <ScopeSelectionState />
    ) : section === "comments" || section === "attachments" ? (
      <ResourceSection key={section} code={section} />
    ) : isCommon(section) ? (
      <CommonSection code={section} />
    ) : section === "roles-scope" ? (
      <RolesWorkspace />
    ) : section === "supplier-company" ? (
      <SupplierCompanySection />
    ) : section === "customer-company" ? (
      <CustomerCompanySection />
    ) : section === "banking" ? (
      <BankingSection />
    ) : section === "qualifications-certificates" ? (
      <SupplierControlsSection />
    ) : section === "credit" ? (
      <CreditReviewSection />
    ) : section === "network" ? (
      <NetworkSection />
    ) : section === "requests" ? (
      <RequestsSection />
    ) : section === "activity" ? (
      <GovernanceActivitySection />
    ) : section === "business-activity" ? (
      <BusinessActivitySection />
    ) : (
      <SectionStatePanel
        state={manifest?.state ?? "ready"}
        reason={manifest?.reasonCode}
      >
        {section === "overview" ? (
          <div className="bp360-overview">
            <Overview summary={summary} />
            <RecordTechnicalDetails />
          </div>
        ) : undefined}
      </SectionStatePanel>
    );
  };
  const observeSection = (code: string) => {
    const next = new URL(window.location.href);
    if (next.searchParams.get("section") === code) return;
    next.searchParams.set("section", code);
    next.searchParams.set("tab", overviewTab.key);
    window.history.replaceState(window.history.state, "", next);
    setScrollRevision((value) => value + 1);
  };
  const navigateRecordMode = (code: string, nextTab: string) =>
    navigate({
      section:
        nextTab === overviewTab.key && !railSections.includes(code)
          ? (railSections[0] ?? "overview")
          : code,
      tab: nextTab,
    });
  return (
    <BusinessPartner360Provider value={contextValue!}>
      <PageWorkspace
        header={<IdentityHeader />}
        navigation={
          <EntityRecord360ModeNavigation
            panel={panel}
            activeTab={tab.key}
            activeSection={section}
            onNavigate={navigateRecordMode}
            navigationId={modeNavigationId}
            navigationRef={modeNavigationRef}
          />
        }
        navigationKind="record-mode"
        navigationBand="shell"
        toolbar={
        <TransactionContextBar
          expanded={showTransactionContext}
          onToggle={() => {
            setRequiredCoordinates(undefined);
            setShowTransactionContext((value) => !value);
          }}
        />
        }
        className="bp360"
        data-bp360-ready="true"
        data-bp360-section={section}
        data-bp360-role-lens={url.roleLens}
        data-bp360-historical={url.asOf ? "true" : "false"}
      >
        {showTransactionContext ? (
          <section
            id="bp-transaction-context"
            tabIndex={-1}
            aria-label="Transaction context"
          >
            <AccessScopeCard requiredCoordinates={requiredCoordinates} />
          </section>
        ) : null}
        <EntityRecord360Panel
          key={key}
          panel={panel}
          sections={summary.sections.map((item) => ({
            key: item.code,
            label:
              summary.recordHeader?.sections.find(
                (section) => section.key === item.code,
              )?.label ?? sectionLabel(item.code),
            ...(item.authorization === "granted" &&
            item.count !== undefined &&
            item.reasonCode !== "BP_360_SCOPE_REQUIRED" &&
            !["comments", "attachments"].includes(item.code)
              ? { count: item.count }
              : {}),
            ...(item.authorization === "restricted"
              ? { status: "Restricted" }
              : item.reasonCode === "BP_360_SCOPE_REQUIRED"
                ? {
                    status:
                      summary.recordHeader?.sections.find(
                        (section) => section.key === item.code,
                      )?.scopePrompt ?? "Select scope",
                  }
                : item.state === "stale"
                  ? { status: "Needs refresh" }
                  : {}),
          }))}
          activeSection={section}
          activeTab={tab.key}
          navigationRevision={revision}
          onNavigate={navigateRecordMode}
          onObserve={observeSection}
          modeNavigationId={modeNavigationId}
          modeNavigationRef={modeNavigationRef}
          renderSection={renderSection}
          renderSidebar={(item) => (
            <PrimaryDetails provider={item.provider} label={item.label} />
          )}
        />
      </PageWorkspace>
    </BusinessPartner360Provider>
  );
}

export function clearBusinessPartnerTransactionContext(url: URL) {
  const next = new URL(url);
  for (const key of [
    "operatingOrganizationId",
    "companyCodeId",
    "legalEntityId",
    "roleLens",
  ])
    next.searchParams.delete(key);
  return next;
}
function readUrl() {
  if (typeof window === "undefined")
    return {
      section: "overview",
      tab: undefined as string | undefined,
      roleLens: "all" as RoleLens,
      asOf: undefined,
    };
  const params = new URLSearchParams(window.location.search),
    lens = params.get("roleLens");
  return {
    section: params.get("section") ?? "overview",
    tab: params.get("tab") ?? undefined,
    roleLens:
      lens === "supplier" || lens === "customer" ? lens : ("all" as RoleLens),
    operatingOrganizationId: uuid(params.get("operatingOrganizationId")),
    companyCodeId: uuid(params.get("companyCodeId")),
    legalEntityId: uuid(params.get("legalEntityId")),
    asOf: /^\d{4}-\d{2}-\d{2}$/.test(params.get("asOf") ?? "")
      ? params.get("asOf")!
      : undefined,
  };
}
function uuid(value: string | null) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value
    : undefined;
}
function isCommon(value: string): value is CommonSectionCode {
  return (
    value === "identity" ||
    value === "contacts" ||
    value === "addresses" ||
    value === "identifiers-tax" ||
    value === "governance"
  );
}
