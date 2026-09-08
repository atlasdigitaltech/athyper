"use client";
import React, { createContext, useContext, useState } from "react";
import { CompanyGroups, ScopePickerToolbar, type CompanyChoice } from "@athyper/platform-ui";
export type DirectorySelection = Readonly<{ partnerRole?: "supplier" | "customer"; eligibleOperation?: "order" | "invoice" | "payment"; operatingOrganizationIds?: readonly string[]; companyCodeIds?: readonly string[] }>;
export interface DirectoryFilterAdapter { readonly value: DirectorySelection; readonly companies: readonly CompanyChoice[]; readonly organizations: readonly { id: string; displayName: string; companyAssignments: readonly { companyCodeId: string }[] }[]; readonly unavailable?: boolean; readonly apply: (value: DirectorySelection) => void; }
export const DirectoryFilterContext = createContext<DirectoryFilterAdapter | undefined>(undefined);
export const useDirectoryFilters = () => useContext(DirectoryFilterContext);
export function DirectoryFilterEditor({ adapter, value, onChange, kinds }: { adapter: DirectoryFilterAdapter; value: DirectorySelection; onChange: (value: DirectorySelection) => void; kinds: readonly string[] }) {
  const [query, setQuery] = useState("");
  const companyIds = value.companyCodeIds ?? [], organizationIds = value.operatingOrganizationIds ?? [];
  const organizations = adapter.organizations.filter(org => `${org.displayName} ${"code" in org ? org.code : ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <>{adapter.unavailable ? <p role="alert">Access is unavailable. Reload the page to retry.</p> : null}<div className="a-directory-filter a-directory-filter--single">
    {kinds.includes("organization") ? <div><ScopePickerToolbar showControls={false} query={query} onQueryChange={setQuery} searchLabel="Search organizations" allLabel="All permitted organizations" allSelected={!organizationIds.length} onAll={() => onChange({...value,operatingOrganizationIds:[]})} selectedCount={organizationIds.length} availableCount={organizations.length}/><div className="a-directory-organizations">{organizations.map(org => <label className="a-company-groups__row" data-selected={organizationIds.includes(org.id)||undefined} key={org.id}><input type="checkbox" disabled={adapter.unavailable || (organizationIds.length >= 100 && !organizationIds.includes(org.id))} checked={organizationIds.includes(org.id)} onChange={() => onChange({...value,operatingOrganizationIds:organizationIds.includes(org.id)?organizationIds.filter(id=>id!==org.id):[...organizationIds,org.id]})}/><span><strong>{org.displayName}</strong>{"code" in org ? <small>{String(org.code)}</small> : null}</span></label>)}</div>{!organizations.length?<p role="status">No permitted organizations match your search.</p>:null}</div> : null}
    {kinds.includes("company") ? <div><CompanyGroups companies={adapter.unavailable ? [] : adapter.companies} selectedIds={companyIds} query={query} onQueryChange={setQuery} onSelectionChange={ids=>onChange({...value,companyCodeIds:ids})}/></div> : null}
  </div></>;
}

export function scopeFilterReady(filter: import("@athyper/contract-platform-entity-list").EntityScopeFilterV1, value: DirectorySelection, adapter: DirectoryFilterAdapter) {
  return (filter.requires ?? []).every(key => key === "partnerRole" ? Boolean(value.partnerRole) : key === "organization" ? value.operatingOrganizationIds?.length === 1 : value.companyCodeIds?.length === 1)
    && (filter.key !== "eligibleOperation" || Boolean(adapter.organizations.find(org => org.id === value.operatingOrganizationIds?.[0])?.companyAssignments.some(company => company.companyCodeId === value.companyCodeIds?.[0])));
}
export function ScopeQuickFilters({ filters, value, adapter, onChange }: { filters: readonly import("@athyper/contract-platform-entity-list").EntityScopeFilterV1[]; value: DirectorySelection; adapter: DirectoryFilterAdapter; onChange: (value: DirectorySelection) => void }) {
  return <div className="a-entity-list__scope-quick-filters">{filters.map(filter => {
    const ready = scopeFilterReady(filter, value, adapter);
    return <label key={filter.key}>{filter.label}<select aria-label={filter.label} value={value[filter.key] ?? ""} disabled={!ready || adapter.unavailable} onChange={event => onChange({...value, [filter.key]: event.target.value || undefined, ...(filter.key === "partnerRole" ? {eligibleOperation:undefined} : {})})}><option value="">{filter.emptyLabel}</option>{filter.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{!ready ? <small>Select a role, one organization and one compatible company.</small> : null}</label>;
  })}</div>;
}
