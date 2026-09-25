"use client";
import {CollectionDrawerHost} from "@athyper/platform-collection-controls";
import React, { type ReactNode } from "react";
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
  const options = LIST_DRAWERS.filter(item => item.available(descriptor) && (!allowedKeys || allowedKeys.includes(item.key))).map(item=>({...item,description:item.description(descriptor)}));
  return <CollectionDrawerHost active={active} onSelect={onSelect} onOpenChange={onOpenChange} options={options} sections={sections}/>;
}
