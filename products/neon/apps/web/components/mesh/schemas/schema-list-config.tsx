"use client";

// components/mesh/schemas/schema-list-config.tsx
//
// ListPageConfig<EntitySummary> for the Meta-Studio schema explorer.

import {
  Archive,
  GitBranch,
  Layers,
  PencilLine,
  Plus,
  Shapes,
  Upload,
} from "lucide-react";

import { SchemaCard } from "./SchemaCard";

import type { ListPageConfig } from "@/components/mesh/list";
import type { EntitySummary } from "@/lib/schema-manager/types";

import { KindBadge } from "@/components/mesh/shared/KindBadge";
import { StatusDot } from "@/components/mesh/shared/StatusDot";

export function createSchemaListConfig(
  basePath: string,
): ListPageConfig<EntitySummary> {
  return {
    // Identity
    pageTitle: "Schema Explorer",
    entityLabel: "entity",
    entityLabelPlural: "entities",
    icon: Shapes,
    basePath,
    getId: (item) => item.id,
    getItemHref: (item) => `${basePath}/${item.name}`,

    // Zone 3 — Command bar
    searchPlaceholder: "Search entities...",
    searchFn: (item, query) =>
      item.name.toLowerCase().includes(query) ||
      item.tableName.toLowerCase().includes(query),
    quickFilters: [
      {
        id: "kind",
        label: "Kind",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Kinds" },
          { value: "ref", label: "Reference" },
          { value: "ent", label: "Enterprise" },
          { value: "doc", label: "Document" },
          { value: "int", label: "Integration" },
        ],
      },
      {
        id: "status",
        label: "Status",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Statuses" },
          { value: "draft", label: "Draft" },
          { value: "published", label: "Published" },
          { value: "archived", label: "Archived" },
        ],
      },
    ],
    filterFn: (item, filters) => {
      if (filters.kind && item.kind !== filters.kind) return false;
      if (filters.status) {
        const status = item.currentVersion?.status ?? "draft";
        if (status !== filters.status) return false;
      }
      return true;
    },

    // Zone 4 — Columns
    columns: [
      {
        id: "name",
        header: "Name",
        sortKey: "name",
        accessor: (item) => <span className="font-medium">{item.name}</span>,
      },
      {
        id: "kind",
        header: "Kind",
        sortKey: "kind",
        accessor: (item) => <KindBadge kind={item.kind} />,
      },
      {
        id: "table",
        header: "Table",
        accessor: (item) => (
          <span className="text-muted-foreground font-mono text-xs">
            {item.tableSchema}.{item.tableName}
          </span>
        ),
      },
      {
        id: "version",
        header: "Version",
        align: "center",
        accessor: (item) =>
          item.currentVersion ? `v${item.currentVersion.versionNo}` : "—",
      },
      {
        id: "fields",
        header: "Fields",
        align: "center",
        sortKey: "fields",
        sortFn: (a, b) => a.fieldCount - b.fieldCount,
        accessor: (item) => item.fieldCount,
      },
      {
        id: "relations",
        header: "Relations",
        align: "center",
        sortKey: "relations",
        sortFn: (a, b) => a.relationCount - b.relationCount,
        accessor: (item) => item.relationCount,
      },
      {
        id: "status",
        header: "Status",
        sortKey: "status",
        accessor: (item) => {
          const status = item.currentVersion?.status ?? "draft";
          return (
            <div className="flex items-center gap-1.5">
              <StatusDot status={status} />
              <span className="text-xs capitalize">{status}</span>
            </div>
          );
        },
      },
    ],

    // Zone 4 — Card renderer
    cardRenderer: (item) => <SchemaCard entity={item} basePath={basePath} />,

    // Zone 5 — Row expansion
    expandRenderer: (item) => (
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Table</p>
            <p className="font-mono text-xs">
              {item.tableSchema}.{item.tableName}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Fields</p>
            <p className="flex items-center gap-1">
              <Layers className="size-3 text-muted-foreground" />
              {item.fieldCount} fields
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Relations</p>
            <p className="flex items-center gap-1">
              <GitBranch className="size-3 text-muted-foreground" />
              {item.relationCount} relations
            </p>
          </div>
        </div>
        {item.currentVersion && (
          <div className="text-xs text-muted-foreground">
            Version {item.currentVersion.versionNo} •{" "}
            <span className="capitalize">{item.currentVersion.status}</span>
            {item.currentVersion.publishedAt && (
              <>
                {" "}
                • Published{" "}
                {new Date(item.currentVersion.publishedAt).toLocaleDateString()}
              </>
            )}
          </div>
        )}
      </div>
    ),

    // View configuration
    availableViews: ["table", "table-columns", "card-grid", "kanban"],
    defaultViewMode: "card-grid",
    defaultViewModeDesktop: "table",
    defaultDensity: "comfortable",
    defaultDensityDesktop: "compact",
    kanban: {
      getLaneId: (item) => item.currentVersion?.status ?? "draft",
      lanes: [
        { id: "draft", label: "Draft", icon: PencilLine },
        { id: "published", label: "Published", icon: Upload },
        { id: "archived", label: "Archived", icon: Archive },
      ],
    },
    presets: [
      { id: "default", label: "Default", isDefault: true },
      {
        id: "drafts",
        label: "My Drafts",
        filters: { status: "draft" },
        viewMode: "kanban",
      },
      {
        id: "published",
        label: "Published Only",
        filters: { status: "published" },
      },
      {
        id: "minimal",
        label: "Minimal Columns",
        viewMode: "table-columns",
        columnVisibility: {
          name: true,
          kind: true,
          status: true,
          table: false,
          version: false,
          relations: false,
          fields: false,
        },
      },
    ],

    // Primary action
    primaryAction: {
      label: "New Entity",
      icon: Plus,
      onClick: () => {
        // TODO: open create entity dialog
      },
    },
  };
}
