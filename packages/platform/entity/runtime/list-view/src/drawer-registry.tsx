"use client";
import React, { useState, useRef, type ReactNode } from "react";
import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { CheckIcon, ChevronDownIcon, ColumnsIcon, FilterIcon, GroupIcon, LayoutIcon, SortIcon } from "@athyper/platform-icons";
import { Drawer, Menu, MenuContent, MenuItem, MenuTrigger } from "@athyper/platform-ui";

/** Shared presentation registry; availability comes from the resolved list contract. */
export const LIST_DRAWERS = [
  { key: "filters", label: "Filters", Icon: FilterIcon, available: (d: EntityListDescriptorV1) => d.fields.some(f => f.filterOperators.length) || Boolean(d.scope.filterKinds?.length || d.scope.quickFilters?.length), description: (d: EntityListDescriptorV1) => `Refine the authorized ${d.entity.pluralLabel.toLocaleLowerCase()} list.` },
  { key: "sort", label: "Sort", Icon: SortIcon, available: (d: EntityListDescriptorV1) => d.limits.maxSortLevels > 0 && d.fields.some(f => f.sortable), description: (d: EntityListDescriptorV1) => `Choose the order of ${d.entity.pluralLabel.toLocaleLowerCase()}.` },
  { key: "columns", label: "Columns", Icon: ColumnsIcon, available: (d: EntityListDescriptorV1) => d.fields.length > 0, description: (d: EntityListDescriptorV1) => `Choose and arrange fields for ${d.entity.pluralLabel.toLocaleLowerCase()}.` },
  { key: "group", label: "Group by", Icon: GroupIcon, available: (d: EntityListDescriptorV1) => d.fields.some(f => f.groupable), description: (d: EntityListDescriptorV1) => `Organize ${d.entity.pluralLabel.toLocaleLowerCase()} into sections using one field.` },
  { key: "display", label: "Display settings", Icon: LayoutIcon, available: (_d: EntityListDescriptorV1) => true, description: (d: EntityListDescriptorV1) => `Set personal defaults for ${d.plane[0]!.toUpperCase()}${d.plane.slice(1)} lists on this device.` },
  { key: "views", label: "Manage views", Icon: LayoutIcon, available: (_d: EntityListDescriptorV1) => true, description: (d: EntityListDescriptorV1) => `Personal and shared views for ${d.entity.pluralLabel.toLocaleLowerCase()}.` },
] as const;
export type ListDrawerKey = typeof LIST_DRAWERS[number]["key"];
export const listDrawer = (key: ListDrawerKey) => LIST_DRAWERS.find(item => item.key === key)!;

/** Mounted for one open session: visited sections retain drafts; closing discards them. */
export function ListDrawerHost({ active, onSelect, onOpenChange, descriptor, sections, allowedKeys }: {
  readonly active: ListDrawerKey; readonly onSelect: (key: ListDrawerKey) => void;
  readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1;
  readonly sections: Record<ListDrawerKey, ReactNode>;
  readonly allowedKeys?: readonly ListDrawerKey[];
}) {
  const selector = useRef<HTMLSpanElement>(null);
  const [visited, setVisited] = useState<readonly ListDrawerKey[]>([active]);
  const options = LIST_DRAWERS.filter(item => item.available(descriptor) && (!allowedKeys || allowedKeys.includes(item.key)));
  const current = options.find(item => item.key === active) ?? options[0]!;
  const { Icon } = current;
  const select = (key: ListDrawerKey) => { setVisited(keys => keys.includes(key) ? keys : [...keys, key]); onSelect(key); selector.current?.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')?.focus(); };
  return <Drawer.Root open onOpenChange={onOpenChange}><Drawer.Panel size="wide" variant="task" mobilePresentation="fullscreen" className="a-entity-list__controls-drawer">
    <Drawer.Header icon={<Icon/>} title={<span ref={selector}><Menu><MenuTrigger className="a-entity-list__drawer-selector" aria-label={`Switch list controls, current: ${current.label}`}>{current.label}<ChevronDownIcon size={16}/></MenuTrigger><MenuContent className="a-entity-list__drawer-menu">{options.map(item => <MenuItem key={item.key} aria-current={item.key === current.key ? "true" : undefined} onClick={() => select(item.key)}><item.Icon size={18}/><span>{item.label}</span>{item.key === current.key ? <CheckIcon size={16}/> : null}</MenuItem>)}</MenuContent></Menu></span>} description={current.description(descriptor)} closeLabel={`Close ${current.label.toLocaleLowerCase()}`}/>
    <span className="a-visually-hidden" role="status" aria-live="polite">{current.label} controls</span>
    {options.filter(item => visited.includes(item.key) || item.key === current.key).map(item => <div key={item.key} hidden={item.key !== current.key} inert={item.key !== current.key} className={`a-entity-list__drawer-section a-entity-list__${item.key === "views" ? "manage-views" : item.key === "display" ? "display-settings" : item.key === "filters" ? "filter" : item.key}-drawer`} data-list-drawer={item.key}>{sections[item.key]}</div>)}
  </Drawer.Panel></Drawer.Root>;
}
