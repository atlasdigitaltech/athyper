"use client";

/**
 * Metadata Studio — /metadata-studio
 *
 * Two-panel entity authoring workbench:
 *   Left  — entity browser (search + class filter, same catalog as /setup/metadata)
 *   Right — field browser for the selected entity
 *
 * Data: /api/relay/platform/entities and /api/relay/platform/entities/:name/fields
 */

import { useState } from "react";
import { ChevronRight, Database, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge,
  Input,
  Skeleton,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntityItem {
  id: string;
  name: string;
  label_singular: string | null;
  entity_class: string;
  table_schema: string;
  table_name: string;
  ownership_model: string | null;
  module_id: string | null;
}

interface EntityField {
  id: string;
  name: string;
  label: string | null;
  column_name: string;
  data_type: string;
  ui_type: string | null;
  is_required: boolean;
  is_unique: boolean;
  is_searchable: boolean;
  is_filterable: boolean;
  is_sortable: boolean;
  is_read_only: boolean;
  is_computed: boolean;
  is_active: boolean;
  sort_order: number;
  origin: string;
  cardinality: string;
}

// ── Class badge colours ───────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  REFERENCE: "bg-slate-100 text-slate-700 border-slate-200",
  MASTER:    "bg-blue-50 text-blue-700 border-blue-200",
  DOCUMENT:  "bg-amber-50 text-amber-700 border-amber-200",
  CONTROL:   "bg-violet-50 text-violet-700 border-violet-200",
  JOURNAL:   "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const DATA_TYPE_BADGE: Record<string, string> = {
  text:     "bg-sky-50 text-sky-700",
  integer:  "bg-indigo-50 text-indigo-700",
  decimal:  "bg-purple-50 text-purple-700",
  boolean:  "bg-teal-50 text-teal-700",
  uuid:     "bg-orange-50 text-orange-700",
  date:     "bg-rose-50 text-rose-700",
  datetime: "bg-rose-50 text-rose-700",
  enum:     "bg-yellow-50 text-yellow-700",
  json:     "bg-slate-100 text-slate-600",
};

const CLASS_OPTIONS = ["REFERENCE", "MASTER", "DOCUMENT", "CONTROL", "JOURNAL"];

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useEntities(search: string, entityClass: string) {
  return useQuery<EntityItem[]>({
    queryKey: ["platform", "entities", search, entityClass],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search)      params.set("search", search);
      if (entityClass) params.set("class",  entityClass);
      const res = await fetch(`/api/relay/platform/entities?${params}`);
      if (!res.ok) throw new Error("Failed to load entities");
      return res.json() as Promise<EntityItem[]>;
    },
    staleTime: 60 * 1000,
  });
}

function useEntityFields(entityName: string | null) {
  return useQuery<EntityField[]>({
    queryKey: ["platform", "entity-fields", entityName],
    queryFn: async () => {
      const res = await fetch(`/api/relay/platform/entities/${encodeURIComponent(entityName!)}/fields`);
      if (!res.ok) throw new Error("Failed to load fields");
      return res.json() as Promise<EntityField[]>;
    },
    enabled: !!entityName,
    staleTime: 30 * 1000,
  });
}

// ── Entity list item ──────────────────────────────────────────────────────────

function EntityRow({
  entity,
  selected,
  onSelect,
}: {
  entity: EntityItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "hover:bg-muted/40 border-transparent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{entity.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground font-mono">
            {entity.table_schema}.{entity.table_name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 mt-0.5">
          <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", CLASS_COLORS[entity.entity_class] ?? "bg-muted text-muted-foreground")}>
            {entity.entity_class}
          </span>
          {selected && <ChevronRight className="h-3 w-3 text-primary" />}
        </div>
      </div>
    </button>
  );
}

// ── Field table ───────────────────────────────────────────────────────────────

function FieldRow({ field }: { field: EntityField }) {
  const typeBadge = DATA_TYPE_BADGE[field.data_type] ?? "bg-muted text-muted-foreground";
  return (
    <tr className="border-b last:border-0 hover:bg-muted/20 text-xs">
      <td className="py-2 px-3 font-medium">{field.label ?? field.name}</td>
      <td className="py-2 px-3 font-mono text-muted-foreground text-[10px]">{field.name}</td>
      <td className="py-2 px-3">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-mono font-medium", typeBadge)}>
          {field.data_type}
        </span>
      </td>
      <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground">{field.column_name}</td>
      <td className="py-2 px-3">
        <div className="flex flex-wrap gap-1">
          {field.is_required  && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-200 text-amber-700">req</Badge>}
          {field.is_unique    && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-indigo-200 text-indigo-700">uniq</Badge>}
          {field.is_read_only && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">ro</Badge>}
          {field.is_computed  && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-teal-200 text-teal-700">calc</Badge>}
          {field.is_searchable && <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-sky-200 text-sky-700">search</Badge>}
        </div>
      </td>
      <td className="py-2 px-3 text-[10px] text-muted-foreground capitalize">{field.origin}</td>
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetadataStudioPage() {
  const [search, setSearch]         = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [classFilter, setClassFilter]   = useState("");
  const [selected, setSelected]         = useState<EntityItem | null>(null);

  const { data: entities, isLoading: entitiesLoading } = useEntities(activeSearch, classFilter);
  const { data: fields,   isLoading: fieldsLoading }   = useEntityFields(selected?.name ?? null);

  function handleSearch() {
    setActiveSearch(search.trim());
  }

  return (
    <PageFrame
      title="Meta Studio"
      description="Browse entity schemas and field definitions"
    >
      <div className="flex gap-4 h-[calc(100vh-12rem)] min-h-0">

        {/* ── Left: Entity browser ──────────────────────────────────────────── */}
        <div className="flex w-72 shrink-0 flex-col gap-3 overflow-hidden">

          {/* Search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Search entities…"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Class filter chips */}
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => setClassFilter("")}
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                classFilter === "" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            {CLASS_OPTIONS.map((cls) => (
              <button
                key={cls}
                onClick={() => setClassFilter(classFilter === cls ? "" : cls)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
                  classFilter === cls ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {cls}
              </button>
            ))}
          </div>

          {/* Entity list */}
          <div className="flex-1 overflow-y-auto space-y-0.5 pr-0.5">
            {entitiesLoading ? (
              <div className="space-y-1.5">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !entities || entities.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Database className="h-7 w-7 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">No entities found</p>
              </div>
            ) : (
              entities.map((entity) => (
                <EntityRow
                  key={entity.id}
                  entity={entity}
                  selected={selected?.id === entity.id}
                  onSelect={() => setSelected(entity)}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Right: Field browser ──────────────────────────────────────────── */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden rounded-lg border">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
              <Database className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm font-medium text-muted-foreground">Select an entity</p>
              <p className="text-xs text-muted-foreground/70 max-w-xs">
                Choose an entity from the list to browse its fields and schema details.
              </p>
            </div>
          ) : (
            <>
              {/* Entity header */}
              <div className="flex items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">{selected.name}</h2>
                    <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase", CLASS_COLORS[selected.entity_class] ?? "bg-muted")}>
                      {selected.entity_class}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">
                    {selected.table_schema}.{selected.table_name}
                    {selected.module_id && ` · module: ${selected.module_id}`}
                  </p>
                </div>
                {fields && (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {fields.length} fields
                  </span>
                )}
              </div>

              {/* Fields table */}
              <div className="flex-1 overflow-auto">
                {fieldsLoading ? (
                  <div className="space-y-2 p-4">
                    {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : !fields || fields.length === 0 ? (
                  <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                    No fields found for this entity.
                  </div>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted/50 border-b z-10">
                      <tr>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Label</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Name</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Type</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Column</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Flags</th>
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Origin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.map((field) => (
                        <FieldRow key={field.id} field={field} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>

      </div>
    </PageFrame>
  );
}
