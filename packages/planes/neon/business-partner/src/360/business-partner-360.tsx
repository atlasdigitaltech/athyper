"use client";

import { useApiClient, useSessionIdentity } from "@athyper/platform-shell-app-foundation";
import { PageSurface } from "@athyper/platform-surface-kit";
import { Card, Skeleton } from "@athyper/platform-ui";
import { useNeonOperatingOrganization, useNeonWorkContext } from "@athyper/product-neon-shell";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBusinessPartner360Client, summaryQueryKey, type RoleLens, type Summary } from "./business-partner-360-client";
import { BusinessPartner360Provider } from "./business-partner-360-context";
import { IdentityHeader } from "./components/identity-header";
import { ScopeBar } from "./components/scope-bar";
import { SectionNavigation } from "./components/section-navigation";
import { RestrictedSection, ScopeSelectionState, SectionStatePanel } from "./components/section-state";
import { CommonSection } from "./components/common-section";
import type { CommonSectionCode } from "./business-partner-360-section-client";
import {CustomerCompanySection,RolesScopeSection,SupplierCompanySection} from "./components/role-company-sections";
import {BankingSection,CreditReviewSection,SupplierControlsSection} from "./components/commercial-controls";
import {BusinessActivitySection,GovernanceActivitySection,RequestsSection} from "./components/explainability-sections";
import {WorkforceSection} from "./components/workforce-section";
import {NetworkSection} from "./components/network-section";
import {sectionLabel} from "./section-registry";

export function BusinessPartner360Shell({ businessPartnerId }: { readonly businessPartnerId: string }) {
  const http = useApiClient(), identity = useSessionIdentity(), work = useNeonWorkContext(), organizations = useNeonOperatingOrganization();
  const client = useMemo(() => createBusinessPartner360Client(http), [http]);
  const [summary, setSummary] = useState<Summary>(), [error, setError] = useState<string>(), [revision, setRevision] = useState(0);
  const url = readUrl(), company = work.selection.mode === "company" ? work.selection : undefined;
  const organization = organizations.selected(url.roleLens === "customer" ? "sales" : url.roleLens === "supplier" ? "procurement" : "shared_services");
  const authEpoch = identity.scope?.authEpoch ?? 0;
  const contextScopeKey = [organization?.id ?? "-", company?.companyCodeId ?? "-", company?.legalEntityId ?? "-"].join(":");
  const previousContextScopeKey = useRef(contextScopeKey);
  const previousBusinessPartnerId = useRef(businessPartnerId);
  const previousAuthEpoch = useRef(authEpoch);
  const operatingOrganizationId = url.operatingOrganizationId ?? organization?.id;
  const companyCodeId = url.companyCodeId ?? company?.companyCodeId;
  const legalEntityId = url.legalEntityId ?? company?.legalEntityId;
  const query = useMemo(() => ({ tenantId: identity.scope?.tenantId ?? "unbound", principalId: identity.scope?.principalId ?? "unbound", businessPartnerId, roleLens: url.roleLens, authEpoch, ...(operatingOrganizationId ? { operatingOrganizationId } : {}), ...(companyCodeId ? { companyCodeId } : {}), ...(legalEntityId ? { legalEntityId } : {}), ...(url.asOf ? { asOf: url.asOf } : {}) }), [identity.scope?.tenantId, identity.scope?.principalId, businessPartnerId, url.roleLens, url.asOf, operatingOrganizationId, companyCodeId, legalEntityId, authEpoch]);
  const key = summaryQueryKey(query).join(":");

  const focusSection=useRef(false);
  useEffect(() => { const onPopState = () => {focusSection.current=true;setRevision(value => value + 1);}; window.addEventListener("popstate", onPopState); return () => window.removeEventListener("popstate", onPopState); }, []);
  useEffect(()=>{if(!focusSection.current)return;focusSection.current=false;requestAnimationFrame(()=>document.getElementById("bp360-section")?.focus());},[revision]);
  useEffect(() => {
    const contextChanged = previousContextScopeKey.current !== contextScopeKey;
    previousContextScopeKey.current = contextScopeKey;
    if (!contextChanged && (url.operatingOrganizationId || !organization?.id) && (url.companyCodeId || !company?.companyCodeId) && (url.legalEntityId || !company?.legalEntityId)) return;
    const next = new URL(window.location.href);
    setCoordinate(next, "operatingOrganizationId", organization?.id); setCoordinate(next, "companyCodeId", company?.companyCodeId); setCoordinate(next, "legalEntityId", company?.legalEntityId);
    window.history.replaceState({}, "", next); setRevision(value => value + 1);
  }, [contextScopeKey, organization?.id, company?.companyCodeId, company?.legalEntityId]);
  useEffect(() => { const controller = new AbortController(); if(previousBusinessPartnerId.current!==businessPartnerId||previousAuthEpoch.current!==authEpoch){previousBusinessPartnerId.current=businessPartnerId;previousAuthEpoch.current=authEpoch;setSummary(undefined);} setError(undefined); client.summary(query, controller.signal).then(setSummary).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Business Partner summary is unavailable"); }); return () => controller.abort(); }, [client,key,businessPartnerId,authEpoch]);
  const navigate = useCallback((patch: Readonly<{ section?: string; roleLens?: RoleLens }>) => { const next = new URL(window.location.href); if (patch.section) next.searchParams.set("section", patch.section); if (patch.roleLens) next.searchParams.set("roleLens", patch.roleLens); window.history.pushState({}, "", next); focusSection.current=true;setRevision(value => value + 1); }, []);

  if (error) return <PageSurface title="Business Partner"><Card><h2>Unavailable</h2><p>{error}</p><button onClick={() => setRevision(value => value + 1)}>Try again</button></Card></PageSurface>;
  if (!summary) return <PageSurface title="Business Partner"><Skeleton className="bp360-shell-skeleton" /></PageSurface>;
  const visible = summary.sections.some(item => item.code === url.section), section = visible ? url.section : "overview", manifest = summary.sections.find(item => item.code === section);
  const sectionContent = manifest?.authorization === "restricted" ? <RestrictedSection /> : manifest?.reasonCode === "BP_360_SCOPE_REQUIRED" ? <ScopeSelectionState /> : isCommon(section) ? <CommonSection code={section} /> : section==="roles-scope"?<RolesScopeSection/>:section==="supplier-company"?<SupplierCompanySection/>:section==="customer-company"?<CustomerCompanySection/>:section==="banking"?<BankingSection/>:section==="qualifications-certificates"?<SupplierControlsSection/>:section==="credit"?<CreditReviewSection/>:section==="workforce"?<WorkforceSection/>:section==="network"?<NetworkSection/>:section==="requests"?<RequestsSection/>:section==="activity"?<GovernanceActivitySection/>:section==="business-activity"?<BusinessActivitySection/>:<SectionStatePanel state={manifest?.state ?? "ready"} reason={manifest?.reasonCode}>{section === "overview" ? <Overview summary={summary} /> : undefined}</SectionStatePanel>;
  return <BusinessPartner360Provider value={{ summary, section, roleLens: url.roleLens, selectSection: code => navigate({ section: code }), selectRole: roleLens => navigate({ roleLens }) }}><div data-bp360-ready="true" data-bp360-section={section} data-bp360-role-lens={url.roleLens} data-bp360-historical={url.asOf?"true":"false"}><PageSurface title={summary.identity.displayName} description="Governed Business Partner 360"><IdentityHeader /><ScopeBar /><div className="bp360-layout"><SectionNavigation /><main id="bp360-section" tabIndex={-1} aria-labelledby="bp360-active-section-heading"><h2 id="bp360-active-section-heading" className="bp360-visually-hidden">{sectionLabel(section)}</h2>{sectionContent}</main></div></PageSurface></div></BusinessPartner360Provider>;
}

function Overview({ summary }: { readonly summary: Summary }) { const completeness=summary.completeness;return <div className="bp360-overview"><Card><h2>Identity summary</h2><p>{summary.identity.legalName ?? summary.identity.displayName}</p><p>{summary.primaryAddress ? [summary.primaryAddress.line1, summary.primaryAddress.locality, summary.primaryAddress.countryCode].filter(Boolean).join(", ") : "No primary address"}</p><p>{summary.primaryContact?.displayName ?? "No primary contact"}</p><p>{summary.identifiers.map(item => `${item.schemeCode}: ${item.maskedValue}`).join(" · ") || "No visible identifiers"}</p><p>{summary.openWork.activeRequestCount} open requests</p></Card><Card><h2>Data completeness</h2>{completeness.status==="definition_unavailable"?<p>Completeness guidance is unavailable. Canonical identity remains visible.</p>:<><p>{completeness.percent}% · {completeness.completeCount} of {completeness.requiredCount} required items complete{completeness.restrictedCount?` · ${completeness.restrictedCount} verified restricted values`:""}</p>{completeness.readOnly?<p>Historical view is read-only.</p>:undefined}<RequirementList title="Required" items={completeness.required}/><RequirementList title="Recommended" items={completeness.recommended}/></>}</Card></div>; }
function RequirementList({title,items}:{readonly title:string;readonly items:Summary["completeness"]["required"]}){if(!items.length)return null;return <section><h3>{title}</h3><ul>{items.map(item=><li key={item.code}>{item.code.replaceAll("."," ")} — {item.state==="restricted_satisfied"?"Verified (restricted)":item.state==="satisfied"?"Complete":"Missing"}{item.action?<>{" "}<a href={item.action.href}>{item.action.label}</a></>:undefined}</li>)}</ul></section>;}
function setCoordinate(url: URL, name: string, value?: string) { if (value) url.searchParams.set(name, value); else url.searchParams.delete(name); }
function readUrl() { if (typeof window === "undefined") return { section: "overview", roleLens: "all" as RoleLens, asOf: undefined }; const params = new URLSearchParams(window.location.search), lens = params.get("roleLens"); return { section: params.get("section") ?? "overview", roleLens: lens === "supplier" || lens === "customer" || lens === "workforce" ? lens : "all" as RoleLens, operatingOrganizationId: uuid(params.get("operatingOrganizationId")), companyCodeId: uuid(params.get("companyCodeId")), legalEntityId: uuid(params.get("legalEntityId")), asOf: /^\d{4}-\d{2}-\d{2}$/.test(params.get("asOf") ?? "") ? params.get("asOf")! : undefined }; }
function uuid(value: string | null) { return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : undefined; }
function isCommon(value:string):value is CommonSectionCode{return value==="identity"||value==="contacts"||value==="addresses"||value==="identifiers-tax";}
