"use client";

// components/mesh/schemas/SchemaExplorer.tsx
//
// Meta-Studio schema explorer — enhanced version using the generic list page system.

import { RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { EntityFormDialog } from "./EntityFormDialog";
import { createSchemaListConfig } from "./schema-list-config";

import type { EntitySummary } from "@/lib/schema-manager/types";

import {
  AdvancedFilterPanel,
  FilterChips,
  ListCommandBar,
  ListPageFooter,
  ListPageHeader,
  ListPageProvider,
  SelectionToolbar,
  ViewRouter,
  useListPage,
} from "@/components/mesh/list";
import { Button } from "@/components/ui/button";
import { useSchemaList } from "@/lib/schema-manager/use-schema-list";

// ─── Inner content (consumes context) ────────────────────────

function SchemaExplorerContent() {
  const { error, refresh } = useListPage<EntitySummary>();

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
          <RefreshCw className="mr-1.5 size-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Zone 1 — Page Header */}
      <ListPageHeader<EntitySummary>
        breadcrumbs={[
          { label: "Admin", href: "#" },
          { label: "Mesh" },
          { label: "Schema Explorer" },
        ]}
      />

      {/* Zone 3 — Command Bar */}
      <ListCommandBar<EntitySummary> />

      {/* Filter Chips */}
      <FilterChips<EntitySummary> />

      {/* Zone 3B — Advanced Filters */}
      <AdvancedFilterPanel<EntitySummary> />

      {/* Selection Toolbar */}
      <SelectionToolbar<EntitySummary> />

      {/* Zone 4 — Results (4-view router + preview drawer) */}
      <ViewRouter<EntitySummary> />

      {/* Footer */}
      <ListPageFooter<EntitySummary> />
    </div>
  );
}

// ─── Wrapper (provides context) ──────────────────────────────

interface SchemaExplorerProps {
  basePath: string;
}

export function SchemaExplorer({ basePath }: SchemaExplorerProps) {
  const { entities, loading, error, refresh } = useSchemaList();
  const [createOpen, setCreateOpen] = useState(false);

  const openCreateDialog = useCallback(() => setCreateOpen(true), []);
  const config = useMemo(
    () => createSchemaListConfig(basePath, openCreateDialog),
    [basePath, openCreateDialog],
  );

  return (
    <ListPageProvider<EntitySummary>
      config={config}
      items={entities}
      loading={loading}
      error={error}
      refresh={refresh}
    >
      <SchemaExplorerContent />
      <EntityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={refresh}
      />
    </ListPageProvider>
  );
}
