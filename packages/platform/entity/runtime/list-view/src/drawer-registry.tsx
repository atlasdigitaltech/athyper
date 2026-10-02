"use client";
import type { CollectionControlOption } from "@athyper/platform-collection-controls";
import React, { type ReactNode } from "react";
import type { EntityListDescriptorV1 } from "@athyper/contract-platform-entity-list";
import { ColumnsIcon, FilterIcon, GroupIcon, LayoutIcon, SortIcon } from "@athyper/platform-icons";
import { CollectionControlPanel } from "@athyper/platform-shell/tool-panel";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";

/** Shared presentation registry; availability comes from the resolved list contract.
 * `label` is the English fallback; user-facing text comes from `list.controls.<key>.*`. */
export const LIST_DRAWERS = [
  { key: "filters", label: "Filters", Icon: FilterIcon, available: (d: EntityListDescriptorV1) => d.fields.some(f => f.filterOperators.length) || Boolean(d.scope.filterKinds?.length || d.scope.quickFilters?.length) },
  { key: "sort", label: "Sort", Icon: SortIcon, available: (d: EntityListDescriptorV1) => d.limits.maxSortLevels > 0 && d.fields.some(f => f.sortable) },
  { key: "columns", label: "Columns", Icon: ColumnsIcon, available: (d: EntityListDescriptorV1) => d.fields.length > 0 },
  { key: "group", label: "Group by", Icon: GroupIcon, available: (d: EntityListDescriptorV1) => d.fields.some(f => f.groupable) },
  { key: "display", label: "Display settings", Icon: LayoutIcon, available: (_d: EntityListDescriptorV1) => true },
  { key: "views", label: "Manage views", Icon: LayoutIcon, available: (_d: EntityListDescriptorV1) => true },
] as const;
export type ListDrawerKey = typeof LIST_DRAWERS[number]["key"];
export const listDrawer = (key: ListDrawerKey) => LIST_DRAWERS.find(item => item.key === key)!;

/** Localized tab label, title and description for one control section. */
export function listDrawerText(
  key: ListDrawerKey,
  descriptor: EntityListDescriptorV1,
  intl: ReturnType<typeof useEntityI18n>,
) {
  const entity = descriptor.entity.pluralLabel;
  return {
    label: intl.message(`list.controls.${key}.tab`),
    title: intl.message(`list.controls.${key}.title`),
    description: intl.message(`list.controls.${key}.description`, { entity }),
  };
}

/** The list's sections on the shared CollectionControlPanel (same panel as
 * Notifications and Inbox). `sections` receives `finish`: after an apply, an
 * overlay closes while a pinned panel stays open beside the refreshed list. */
export function ListDrawerHost({ active, onSelect, onOpenChange, descriptor, sections, allowedKeys, context, counts }: {
  readonly active: ListDrawerKey; readonly onSelect: (key: ListDrawerKey) => void;
  readonly onOpenChange: (open: boolean) => void; readonly descriptor: EntityListDescriptorV1;
  readonly sections: (finish: (open: boolean) => void) => Record<ListDrawerKey, ReactNode>;
  readonly allowedKeys?: readonly ListDrawerKey[];
  /** Panel-level context shown under the header on every tab: the list and its record count. */
  readonly context: { readonly label: ReactNode; readonly detail?: ReactNode };
  /** Tab badges, e.g. active filters. */
  readonly counts?: Partial<Record<ListDrawerKey, number>>;
}) {
  const intl = useEntityI18n();
  const options: CollectionControlOption<ListDrawerKey>[] = LIST_DRAWERS
    .filter(item => item.available(descriptor) && (!allowedKeys || allowedKeys.includes(item.key)))
    .map(item => ({ key: item.key, Icon: item.Icon, count: counts?.[item.key], ...listDrawerText(item.key, descriptor, intl) }));
  return <CollectionControlPanel active={active} onSelect={onSelect} onOpenChange={onOpenChange} options={options} sections={sections} entity={descriptor.entity.pluralLabel} context={context} />;
}
