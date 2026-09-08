"use client";
import { BUSINESS_PARTNER_360_PANEL } from "./panel-definition";
import { EntityRecord360Panel } from "@athyper/platform-entity-form-detail";
import { PrimaryDetails } from "./components/primary-details";
import { ResourceSection } from "./components/resource-section";
import { PageHeader, useRecordPage } from "@athyper/platform-shell";

import {
  useApiClient,
  useSessionIdentity,
} from "@athyper/platform-shell-app-foundation";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBusinessPartner360Client,
  summaryQueryKey,
  type RoleLens,
  type Summary,
} from "./business-partner-360-client";
import { BusinessPartner360Provider } from "./business-partner-360-context";
import {
  AccessScopeCard,
  RecordTechnicalDetails,
} from "./components/access-scope";
import { Overview } from "./components/overview";
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
  RolesScopeSection,
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
    [, setScrollRevision] = useState(0);
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
  const key = summaryQueryKey(query).join(":");

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

  if (error)
    return (
      <div className="bp360">
        <PageHeader level="collection" title="Business Partner" />
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
      </div>
    );
  if (
    !summary ||
    loadedKey !== key ||
    summary.identity.id !== businessPartnerId
  )
    return (
      <div className="bp360" aria-label="Loading Business Partner">
        <PageHeader level="collection" title="Loading Business Partner" />
        <Skeleton className="bp360-shell-skeleton" />
      </div>
    );
  const panel = summary.recordHeader?.panel ?? BUSINESS_PARTNER_360_PANEL;
  const overviewTab = panel.tabs.find((tab) => tab.provider === "360")!;
  const legacyTab = panel.tabs.find((tab) => tab.sectionKey === url.section);
  const tab =
    panel.tabs.find((tab) => tab.key === url.tab) ?? legacyTab ?? overviewTab;
  const railSections = panel.sections.filter((code) =>
    summary.sections.some((item) => item.code === code),
  );
  const section =
    tab.sectionKey ??
    (railSections.includes(url.section)
      ? url.section
      : (railSections[0] ?? "overview"));
  const renderSection = (section: string) => {
    const manifest = summary.sections.find((item) => item.code === section);
    if (!manifest) return <RestrictedSection />;
    return manifest?.authorization === "restricted" ? (
      <RestrictedSection />
    ) : manifest?.reasonCode === "BP_360_SCOPE_REQUIRED" ? (
      <div className="bp360-section-list">
        <ScopeSelectionState />
        <AccessScopeCard />
      </div>
    ) : section === "comments" || section === "attachments" ? (
      <ResourceSection key={section} code={section} />
    ) : isCommon(section) ? (
      <CommonSection code={section} />
    ) : section === "roles-scope" ? (
      <RolesScopeSection />
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
            <AccessScopeCard />
            <RecordTechnicalDetails />
          </div>
        ) : undefined}
      </SectionStatePanel>
    );
  };
  const selectSection = (code: string) =>
    navigate({
      section: code,
      tab:
        panel.tabs.find((tab) => tab.sectionKey === code)?.key ??
        overviewTab.key,
    });
  const observeSection = (code: string) => {
    const next = new URL(window.location.href);
    if (next.searchParams.get("section") === code) return;
    next.searchParams.set("section", code);
    next.searchParams.set("tab", overviewTab.key);
    window.history.replaceState(window.history.state, "", next);
    setScrollRevision((value) => value + 1);
  };
  return (
    <BusinessPartner360Provider
      value={{
        summary,
        section,
        roleLens: url.roleLens,
        selectSection,
        selectRole: (roleLens) => navigate({ roleLens }),
        selectScope: (operatingOrganizationId, companyCodeId) => {
          const next = new URL(window.location.href);
          next.searchParams.set(
            "operatingOrganizationId",
            operatingOrganizationId,
          );
          next.searchParams.set("companyCodeId", companyCodeId);
          next.searchParams.delete("legalEntityId");
          window.history.pushState({}, "", next);
          setRevision((value) => value + 1);
        },
      }}
    >
      <div
        className="bp360"
        data-bp360-ready="true"
        data-bp360-section={section}
        data-bp360-role-lens={url.roleLens}
        data-bp360-historical={url.asOf ? "true" : "false"}
      >
        <IdentityHeader />
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
            !["comments", "attachments"].includes(item.code)
              ? { count: item.count }
              : {}),
            ...(item.authorization === "restricted"
              ? { status: "Restricted" }
              : item.reasonCode === "BP_360_SCOPE_REQUIRED"
                ? { status: "Select scope" }
                : item.state === "stale"
                  ? { status: "Needs refresh" }
                  : {}),
          }))}
          activeSection={section}
          activeTab={tab.key}
          navigationRevision={revision}
          onNavigate={(code, nextTab) =>
            navigate({
              section:
                nextTab === overviewTab.key && !railSections.includes(code)
                  ? (railSections[0] ?? "overview")
                  : code,
              tab: nextTab,
            })
          }
          onObserve={observeSection}
          renderSection={renderSection}
          renderSidebar={(item) => (
            <PrimaryDetails provider={item.provider} label={item.label} />
          )}
        />
      </div>
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
