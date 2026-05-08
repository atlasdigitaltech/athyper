"use client";

/**
 * Setup — Entity Catalog — /setup/metadata
 *
 * Browsable catalog of all registered entities (control.entity) in the platform.
 * Read-only — authoring is done through the Meta Studio.
 */

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Database, Search } from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { FilterPillBar } from "@athyper/ui/composites";
import { Badge, Button, Input, Skeleton } from "@athyper/ui/primitives";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntityEntry {
  id: string;
  name: string;
  entity_class: string;
  ownership_model: string;
  module_id: string;
  table_schema: string;
  table_name: string;
  label_singular: string | null;
  label_plural: string | null;
  description: string | null;
  icon_key: string | null;
}

const CLASS_COLORS: Record<string, string> = {
  REFERENCE: "bg-primary/10 text-primary border-primary/30",
  MASTER:    "bg-accent/10 text-accent-foreground border-accent/30",
  DOCUMENT:  "bg-warning/10 text-warning border-warning/30",
  CONTROL:   "bg-muted text-muted-foreground border-border",
  JOURNAL:   "bg-success/10 text-success border-success/30",
};

// ── Hook ──────────────────────────────────────────────────────────────────────

function useEntityCatalog(search: string, entityClass: string) {
  return useQuery<{ data: EntityEntry[]; count: number }>({
    queryKey: ["setup", "entities", search, entityClass],
    queryFn: async () => {
      const p = new URLSearchParams({ limit: "200" });
      if (search) p.set("q", search);
      if (entityClass) p.set("class", entityClass);
      const res = await fetch(`/api/relay/platform/entities?${p}`);
      if (!res.ok) throw new Error("Failed to load entities");
      return res.json() as Promise<{ data: EntityEntry[]; count: number }>;
    },
    staleTime: 60 * 1000,
  });
}

// ── Components ────────────────────────────────────────────────────────────────

const CLASS_OPTIONS = ["", "REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "JOURNAL"];

function EntityCard({ entity }: { entity: EntityEntry }) {
  const colorClass = CLASS_COLORS[entity.entity_class] ?? CLASS_COLORS["CONTROL"]!;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{entity.label_singular ?? entity.name}</p>
          <p className="text-xs text-muted-foreground font-mono truncate">
            {entity.table_schema}.{entity.table_name}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-doc-support font-medium ${colorClass}`}>
          {entity.entity_class}
        </span>
      </div>
      {entity.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{entity.description}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Badge variant="outline" className="text-doc-support font-mono">{entity.module_id}</Badge>
        <Badge variant="outline" className="text-doc-support capitalize">{entity.ownership_model}</Badge>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetadataSetupPage() {
  const [search, setSearch] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [entityClass, setEntityClass] = useState("");

  const { data, isLoading } = useEntityCatalog(activeSearch, entityClass);
  const entities = data?.data ?? [];

  // Group by entity_class
  const grouped = entities.reduce<Record<string, EntityEntry[]>>((acc, e) => {
    (acc[e.entity_class] ??= []).push(e);
    return acc;
  }, {});

  return (
    <PageFrame
      title="Entity Catalog"
      description="All registered entities and data models in the platform"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/setup/parameters">Manage parameters</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/metadata-studio">Open Meta Studio</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder="Search entities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setActiveSearch(search)}
            />
          </div>
          <FilterPillBar
            items={["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "JOURNAL"].map((cls) => ({ value: cls, label: cls }))}
            value={entityClass}
            onChange={setEntityClass}
            allItem={{ label: "All" }}
          />
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : entities.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-12 text-center">
            <Database className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No entities found</p>
          </div>
        ) : entityClass ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entities.map((e) => <EntityCard key={e.id} entity={e} />)}
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cls, items]) => (
              <div key={cls}>
                <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {cls}
                  <Badge variant="secondary" className="text-doc-support px-1.5 normal-case tracking-normal">{items.length}</Badge>
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {items.map((e) => <EntityCard key={e.id} entity={e} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
