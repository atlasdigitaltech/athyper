"use client";
import { ChevronDownIcon, ChevronRightIcon } from "@athyper/platform-icons";
import React, { useId, useState } from "react";
export interface CompanyChoice { readonly companyCodeId: string; readonly code: string; readonly displayName: string; readonly legalEntityId: string; readonly legalEntityCode: string; readonly legalEntityName: string; readonly countryCode?: string; readonly functionalCurrency: string; readonly legalEntityLogoUrl?: string; }
export function ScopePickerToolbar({ query, onQueryChange, searchLabel, allLabel, allSelected, onAll, selectedCount, availableCount, closeOnSelect = false, showControls = true }: { showControls?: boolean; query: string; onQueryChange: (value: string) => void; searchLabel: string; allLabel: string; allSelected: boolean; onAll: () => void; selectedCount: number; availableCount: number; closeOnSelect?: boolean }) {
  return <div className="a-scope-picker-toolbar">
    <input type="search" data-context-picker-autofocus aria-label={searchLabel} placeholder={searchLabel} value={query} onChange={event => onQueryChange(event.target.value)}/>
    {showControls ? <><button type="button" aria-label={allLabel} title={allLabel} aria-pressed={allSelected} data-context-picker-select={closeOnSelect || undefined} onClick={onAll}>All</button>
    <small role="status" aria-label={`${selectedCount} selected · ${availableCount} available`} title={`${selectedCount} selected · ${availableCount} available`}><b>{selectedCount}</b> selected · {availableCount}</small></> : null}
  </div>;
}
/** Presentation only: callers supply authorized choices and own selection semantics. */
export function CompanyGroups({ companies, selectedId, onSelect, query = "", allLabel = "All permitted companies", showAll = true, closeOnSelect = false, selectedIds, onSelectionChange, onQueryChange, searchLabel = "Search company name or code" }: { readonly onQueryChange?: (value: string) => void; readonly searchLabel?: string; readonly companies: readonly CompanyChoice[]; readonly selectedId?: string; readonly onSelect?: (id?: string) => void; readonly selectedIds?: readonly string[]; readonly onSelectionChange?: (ids: readonly string[]) => void; readonly query?: string; readonly allLabel?: string; readonly closeOnSelect?: boolean; readonly showAll?: boolean }) {
  const multiple = Boolean(onSelectionChange), selected = selectedIds ?? (selectedId ? [selectedId] : []);
  const toggle = (key: string) => multiple ? onSelectionChange?.(selected.includes(key) ? selected.filter(id => id !== key) : [...selected, key]) : onSelect?.(key);
  const id = useId(), [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const matches = companies.filter(c => `${c.displayName} ${c.code} ${c.legalEntityName} ${c.legalEntityCode}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const groups = new Map<string, CompanyChoice[]>();
  for (const company of matches) groups.set(company.legalEntityId, [...(groups.get(company.legalEntityId) ?? []), company]);
  return <div className="a-company-groups">
    {onQueryChange ? <ScopePickerToolbar showControls={!multiple} query={query} onQueryChange={onQueryChange} searchLabel={searchLabel} allLabel={allLabel} allSelected={!selected.length} onAll={() => multiple ? onSelectionChange?.([]) : onSelect?.(undefined)} selectedCount={selected.length} availableCount={matches.length} closeOnSelect={closeOnSelect}/> : <>{showAll ? <button type="button" className="a-company-groups__all" aria-pressed={!selected.length} data-context-picker-select={closeOnSelect || undefined} onClick={() => multiple ? onSelectionChange?.([]) : onSelect?.(undefined)}>{allLabel}</button> : null}<small role="status">{matches.length} companies · {groups.size} legal entities</small></>}
    {[...groups.entries()].sort(([, a], [, b]) => a[0]!.legalEntityName.localeCompare(b[0]!.legalEntityName)).map(([key, rows]) => { const legal = rows[0]!, expanded = !!query || !collapsed.has(key); return <section key={key} className="a-company-groups__group">
      <button type="button" className="a-company-groups__heading" aria-expanded={expanded} onClick={() => setCollapsed(current => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; })}>
        <span className="a-company-groups__chevron" aria-hidden="true">{expanded ? <ChevronDownIcon size={20}/> : <ChevronRightIcon size={20}/>}</span><span className="a-company-groups__avatar">{legal.legalEntityLogoUrl ? <img src={legal.legalEntityLogoUrl} alt=""/> : legal.legalEntityName.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>
        <span><strong>{legal.legalEntityName}</strong><small>Legal entity · {legal.legalEntityCode.toUpperCase()}</small></span>
      </button>
      {expanded ? <div>{rows.map(company => <label key={company.companyCodeId} className="a-company-groups__row" data-selected={selected.includes(company.companyCodeId) || undefined}>
        <input data-context-picker-select={closeOnSelect || undefined} type={multiple ? "checkbox" : "radio"} name={id} disabled={multiple && selected.length >= 100 && !selected.includes(company.companyCodeId)} checked={selected.includes(company.companyCodeId)} onChange={() => toggle(company.companyCodeId)}/><span><strong>{company.displayName}</strong><small>{company.code.toUpperCase()} · {company.countryCode ?? "—"} · {company.functionalCurrency}</small></span>
      </label>)}</div> : null}
    </section>; })}
    {!matches.length ? <p role="status">No permitted companies match your search.</p> : null}
  </div>;
}
