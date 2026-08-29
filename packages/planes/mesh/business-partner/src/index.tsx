"use client";

import type { EntityListScopeCoordinateV1 } from "@athyper/contract-platform-entity-list";
import { EntityListRuntime, ListScopeControl } from "@athyper/platform-entity-list-view";
import { ContentHeader } from "@athyper/platform-shell";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { useMeshAccountContext } from "@athyper/product-mesh-shell";
import { useMemo } from "react";

const moduleLinks = [
  { href: "/mdg/business-partner", label: "Overview" },
  { href: "/mdg/business-partner/profile", label: "My Organization" },
  { href: "/mdg/business-partner/relationships", label: "Relationships" },
  { href: "/mdg/business-partner/requests", label: "Change Requests" },
] as const;

function ModuleNavigation({current}:{readonly current:string}) {
  return <nav className="athyper-module-nav" aria-label="Business Partner module">{moduleLinks.map((item)=><a key={item.href} href={item.href} aria-current={item.href===current?"page":undefined}>{item.label}</a>)}</nav>;
}

export function BusinessPartnerOverview() {
  const account=useMeshAccountContext(),selected=account.selected;
  return <section className="athyper-landing" aria-labelledby="page-title"><ModuleNavigation current="/mdg/business-partner"/><ContentHeader eyebrow="Master Data Governance" title="Business Partner" description="Maintain your organization identity and share governed profile information with connected customers and suppliers."/><div className="athyper-landing__status"><span aria-hidden="true"/><div><strong>{selected?`${selected.displayName} is selected`:account.status==="loading"?"Resolving your organization":"Select an acting account"}</strong><p>{selected?`${roleLabel(selected.role)} · ${accountReference(selected)}`:"Choose the organization you are authorized to represent before opening governed data."}</p></div></div><div className="athyper-landing__grid"><article><a className="athyper-landing__module-link" href="/mdg/business-partner/profile">Open organization profile</a><p>Owned information</p><h2>My Organization</h2><p>Review the legal identity and profile currently associated with the acting network account.</p><span className="athyper-landing__number" aria-hidden="true">01</span></article><article><a className="athyper-landing__module-link" href="/mdg/business-partner/relationships">Open relationships</a><p>Connected parties</p><h2>Relationships</h2><p>View authorized supplier-to-customer relationships and profile-sharing connections.</p><span className="athyper-landing__number" aria-hidden="true">02</span></article><article><a className="athyper-landing__module-link" href="/mdg/business-partner/requests">Open change requests</a><p>Governed maintenance</p><h2>Change Requests</h2><p>Understand how proposed profile changes are validated and approved before publication.</p><span className="athyper-landing__number" aria-hidden="true">03</span></article></div></section>;
}

export function BusinessPartnerProfile() {
  const account=useMeshAccountContext(),selected=account.selected;
  return <section className="athyper-landing" aria-labelledby="page-title"><ModuleNavigation current="/mdg/business-partner/profile"/><ContentHeader eyebrow="Business Partner" title="My Organization" description="The governed organization identity for the account you are authorized to represent."/>{selected?<ul className="athyper-governance-list"><li><strong>Display name</strong><span>{selected.displayName}</span></li><li><strong>Legal name</strong><span>{selected.legalName??"Not supplied"}</span></li><li><strong>Account code</strong><span>{selected.code.toUpperCase()}</span></li><li><strong>Business role</strong><span>{roleLabel(selected.role)}</span></li><li><strong>Country and currency</strong><span>{[selected.countryCode,selected.defaultCurrency].filter(Boolean).join(" · ")||"Not supplied"}</span></li></ul>:<div className="athyper-landing__status"><span aria-hidden="true"/><div><strong>{account.status==="loading"?"Resolving your organization":"Organization context required"}</strong><p>Select an acting account from the header to view its governed profile.</p></div></div>}</section>;
}

export function BusinessPartnerChangeRequests() {
  return <section className="athyper-landing" aria-labelledby="page-title"><ModuleNavigation current="/mdg/business-partner/requests"/><ContentHeader eyebrow="Business Partner" title="Change Requests" description="Partner-maintained information enters Neon as a governed proposal; it never overwrites the canonical record directly."/><ul className="athyper-governance-list"><li><strong>1. Propose</strong><span>The authorized supplier or customer supplies updated profile information and supporting evidence.</span></li><li><strong>2. Validate and match</strong><span>Required-field, identity, duplicate, and relationship checks run against the published Studio definition.</span></li><li><strong>3. Review and approve</strong><span>A Neon steward reviews sensitive legal, tax, bank, and role changes using maker-checker controls.</span></li><li><strong>4. Publish</strong><span>After approval, the canonical record is updated and the governed result is published back through Mesh.</span></li></ul><div className="athyper-landing__status"><span aria-hidden="true"/><div><strong>Invitation-backed submissions are active</strong><p>Direct authenticated profile amendment requires a dedicated Mesh-to-Neon request API contract before an edit action can be safely enabled here.</p></div></div></section>;
}

export function BusinessPartnerNetworkList() {
  const client = useApiClient();
  const accounts = useMeshAccountContext();
  const coordinate = useMemo<EntityListScopeCoordinateV1 | undefined>(() => accounts.selected ? Object.freeze({ networkAccountId: accounts.selected.networkAccountId }) : undefined, [accounts.selected?.networkAccountId]);
  const selected = accounts.selected;
  const control = <ListScopeControl id="mesh-list-network-account" label="Acting account" value={selected?.networkAccountId} options={accounts.accounts.map((account) => ({ value: account.networkAccountId, label: `${account.code} · ${account.displayName} · ${account.role}` }))} status={accounts.status} loadingLabel="Loading network accounts…" emptyLabel="No authorized network accounts" selectLabel="Select a network account" summaryLabel="Authorized acting account" accessLabel={selected ? `${selected.role} access` : undefined} onChange={(value) => { if (value) accounts.select(value); }}/>;
  return <><ModuleNavigation current="/mdg/business-partner/relationships"/><EntityListRuntime client={client} entityCode="network_relationship" scopeCoordinate={coordinate} scopeControl={control} headerDescription="Authorized Business Partner relationships and profile-sharing connections."/></>;
}

function accountReference(account:{readonly code:string;readonly countryCode?:string;readonly defaultCurrency?:string}):string{return `${account.code.toUpperCase()}${account.countryCode?` · ${account.countryCode}`:""}${account.defaultCurrency?` · ${account.defaultCurrency}`:""}`;}
function roleLabel(role:"buyer"|"supplier"|"both"):string{return role==="buyer"?"CUSTOMER":role==="supplier"?"SUPPLIER":"SUPPLIER & CUSTOMER";}
