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
  REFERENCE: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/40",
  MASTER:    "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/40",
  DOCUMENT:  "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/40",
  CONTROL:   "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:border-slate-700",
  JOURNAL:   "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800/40",
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
        <span className={`shrink-0 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${colorClass}`}>
          {entity.entity_class}
        </span>
      </div>
      {entity.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{entity.description}</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <Badge variant="outline" className="text-[10px] font-mono">{entity.module_id}</Badge>
        <Badge variant="outline" className="text-[10px] capitalize">{entity.ownership_model}</Badge>
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
        <Button variant="outline" size="sm" asChild>
          <Link href="/metadata-studio">Open Meta Studio</Link>
        </Button>
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
          <div className="flex items-center gap-1">
            {CLASS_OPTIONS.map((cls) => (
              <Button
                key={cls || "all"}
                variant={entityClass === cls ? "default" : "ghost"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setEntityClass(cls)}
              >
                {cls || "All"}
              </Button>
            ))}
          </div>
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
                  <Badge variant="secondary" className="text-[10px] px-1.5 normal-case tracking-normal">{items.length}</Badge>
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
