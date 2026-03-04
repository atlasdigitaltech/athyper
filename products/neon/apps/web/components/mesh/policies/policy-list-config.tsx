"use client";

// components/mesh/policies/policy-list-config.tsx
//
// ListPageConfig<PolicySummary> for the Policy Studio explorer.

import { Archive, PencilLine, Plus, Shield, Upload } from "lucide-react";

import { PolicyCard } from "./PolicyCard";

import type { PolicySummary } from "./types";
import type { ListPageConfig } from "@/components/mesh/list";

import { StatusDot } from "@/components/mesh/shared/StatusDot";
import { Badge } from "@/components/ui/badge";

const SCOPE_LABELS: Record<string, string> = {
  global: "Global",
  module: "Module",
  entity: "Entity",
  entity_version: "Version",
};

export function createPolicyListConfig(
  basePath: string,
): ListPageConfig<PolicySummary> {
  return {
    // Identity
    pageTitle: "Policy Explorer",
    entityLabel: "policy",
    entityLabelPlural: "policies",
    icon: Shield,
    basePath,
    getId: (item) => item.id,
    getItemHref: (item) => `${basePath}/${item.id}`,

    // Zone 3 — Command bar
    searchPlaceholder: "Search policies...",
    searchFn: (item, query) =>
      item.name.toLowerCase().includes(query) ||
      (item.description ?? "").toLowerCase().includes(query) ||
      (item.scopeKey ?? "").toLowerCase().includes(query),
    quickFilters: [
      {
        id: "scopeType",
        label: "Scope",
        defaultValue: "all",
        options: [
          { value: "all", label: "All Scopes" },
          { value: "global", label: "Global" },
          { value: "module", label: "Module" },
          { value: "entity", label: "Entity" },
          { value: "entity_version", label: "Version" },
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
      if (filters.scopeType && item.scopeType !== filters.scopeType)
        return false;
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
        accessor: (item) => (
          <div>
            <span className="font-medium">{item.name}</span>
            {item.description && (
              <p className="text-xs text-muted-foreground truncate max-w-[240px]">
                {item.description}
              </p>
            )}
          </div>
        ),
      },
      {
        id: "scope",
        header: "Scope",
        sortKey: "scope",
        accessor: (item) => (
          <Badge variant="outline" className="text-xs font-normal capitalize">
            {SCOPE_LABELS[item.scopeType] ?? item.scopeType}
          </Badge>
        ),
      },
      {
        id: "scopeKey",
        header: "Scope Key",
        accessor: (item) => (
          <span className="text-muted-foreground font-mono text-xs">
            {item.scopeKey ?? "—"}
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
        id: "rules",
        header: "Rules",
        align: "center",
        sortKey: "rules",
        sortFn: (a, b) =>
          (a.currentVersion?.ruleCount ?? 0) -
          (b.currentVersion?.ruleCount ?? 0),
        accessor: (item) => item.currentVersion?.ruleCount ?? 0,
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
    cardRenderer: (item) => <PolicyCard policy={item} basePath={basePath} />,

    // Zone 5 — Row expansion
    expandRenderer: (item) => (
      <div className="space-y-2">
        {item.description && (
          <p className="text-sm text-muted-foreground">{item.description}</p>
        )}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Scope</p>
            <p className="capitalize">
              {SCOPE_LABELS[item.scopeType] ?? item.scopeType}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Scope Key</p>
            <p className="font-mono text-xs">{item.scopeKey ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Rules</p>
            <p className="flex items-center gap-1">
              <Shield className="size-3 text-muted-foreground" />
              {item.currentVersion?.ruleCount ?? 0} rules
            </p>
          </div>
        </div>
      </div>
    ),

    // View configuration
    availableViews: ["table", "table-columns", "card-grid", "kanban"],
    defaultViewMode: "card-grid",
    defaultViewModeDesktop: "table",
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
        id: "global",
        label: "Global Policies",
        filters: { scopeType: "global" },
      },
      {
        id: "published",
        label: "Published Only",
        filters: { status: "published" },
      },
    ],

    // Primary action
    primaryAction: {
      label: "New Policy",
      icon: Plus,
      onClick: () => {
        // TODO: open create policy dialog
      },
    },
  };
}
