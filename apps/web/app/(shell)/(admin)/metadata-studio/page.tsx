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

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardList, Database, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  contractsForScope,
  getUnknownTopLevelKeys,
  type PropertyContractEntry,
} from "@athyper/api-contracts";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import {
  Badge,
  Input,
  Skeleton,
} from "@athyper/ui/primitives";
import { cn, resolveSemanticColors, entityClassIntent, dataTypeIntent, FIELD_FLAG_INTENT } from "@athyper/theme";

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
  display_config?: Record<string, unknown> | null;
  feature_flags?: Record<string, unknown> | null;
  data_policy?: Record<string, unknown> | null;
  identity_config?: Record<string, unknown> | null;
  search_config?: Record<string, unknown> | null;
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
  default_value?: unknown;
  compute_expr?: unknown;
  enum_config?: Record<string, unknown> | null;
  enum_domain_code?: string | null;
  reference_config?: Record<string, unknown> | null;
  money_config?: Record<string, unknown> | null;
  json_config?: Record<string, unknown> | null;
  datetime_config?: Record<string, unknown> | null;
  ui_hint?: Record<string, unknown> | null;
  visibility?: Record<string, unknown> | null;
  editability?: Record<string, unknown> | null;
  lookup_config?: Record<string, unknown> | null;
  lookup_profile?: Record<string, unknown> | null;
  filter_config?: Record<string, unknown> | null;
  collection_behavior?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  validation_rules?: Record<string, unknown> | null;
  constraints?: Record<string, unknown> | null;
  group_key?: string | null;
}

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
      const body = await res.json() as EntityItem[] | { data?: EntityItem[] };
      return Array.isArray(body) ? body : body.data ?? [];
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
          <p className="mt-0.5 truncate text-doc-support text-muted-foreground font-mono">
            {entity.table_schema}.{entity.table_name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 mt-0.5">
          <span className={cn("rounded border px-1.5 py-0.5 text-doc-field-label font-semibold uppercase", resolveSemanticColors(entityClassIntent(entity.entity_class)).subtleBadge)}>
            {entity.entity_class}
          </span>
          {selected && <ChevronRight className="h-3 w-3 text-primary" />}
        </div>
      </div>
    </button>
  );
}

// ── Field table ───────────────────────────────────────────────────────────────

function FieldRow({
  field,
  selected,
  onSelect,
}: {
  field: EntityField;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const typeBadge = resolveSemanticColors(dataTypeIntent(field.data_type)).subtleBadge;
  const flagCls = (key: string) =>
    cn("text-doc-field-label px-1 py-0 h-4", resolveSemanticColors(FIELD_FLAG_INTENT[key] ?? "neutral").subtleBadge);
  return (
    <tr
      onClick={onSelect}
      className={cn(
        "border-b last:border-0 text-xs",
        onSelect && "cursor-pointer hover:bg-muted/20",
        selected && "bg-primary/5",
      )}
    >
      <td className="py-2 px-3 font-medium">{field.label ?? field.name}</td>
      <td className="py-2 px-3 font-mono text-muted-foreground text-doc-support">{field.name}</td>
      <td className="py-2 px-3">
        <span className={cn("rounded px-1.5 py-0.5 text-doc-support font-mono font-medium", typeBadge)}>
          {field.data_type}
        </span>
      </td>
      <td className="py-2 px-3 font-mono text-doc-support text-muted-foreground">{field.column_name}</td>
      <td className="py-2 px-3">
        <div className="flex flex-wrap gap-1">
          {field.is_required   && <Badge variant="outline" className={flagCls("required")}>req</Badge>}
          {field.is_unique     && <Badge variant="outline" className={flagCls("unique")}>uniq</Badge>}
          {field.is_read_only  && <Badge variant="outline" className={flagCls("read_only")}>ro</Badge>}
          {field.is_computed   && <Badge variant="outline" className={flagCls("computed")}>calc</Badge>}
          {field.is_searchable && <Badge variant="outline" className={flagCls("searchable")}>search</Badge>}
        </div>
      </td>
      <td className="py-2 px-3 text-doc-support text-muted-foreground capitalize">{field.origin}</td>
    </tr>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function contractValue(entry: PropertyContractEntry, entity: EntityItem | null, field: EntityField | null): unknown {
  if (entry.scope === "entity") return entity?.[entry.property as keyof EntityItem] ?? null;
  if (!field) return null;
  return field[entry.property as keyof EntityField] ?? null;
}

function valueSummary(value: unknown): string {
  if (value == null) return "Not set";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length ? keys.slice(0, 4).join(", ") + (keys.length > 4 ? ` +${keys.length - 4}` : "") : "Empty object";
  }
  return String(value);
}

function ContractRow({
  entry,
  value,
}: {
  entry: PropertyContractEntry;
  value: unknown;
}) {
  const unknownKeys = getUnknownTopLevelKeys(entry, value);
  const record = asRecord(value);
  const deprecatedHits = entry.deprecatedKeys.filter((item) => record && item.key in record);
  const hasWarning = unknownKeys.length > 0 || deprecatedHits.length > 0;

  return (
    <tr className="border-b last:border-0 align-top text-xs hover:bg-muted/20">
      <td className="px-3 py-2">
        <div className="font-medium">{entry.uiLabel}</div>
        <div className="mt-0.5 font-mono text-doc-support text-muted-foreground">{entry.property}</div>
      </td>
      <td className="px-3 py-2">
        <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-doc-field-label font-medium">
          {entry.phase}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-doc-field-label font-medium">
          {entry.compileTarget}
        </span>
      </td>
      <td className="px-3 py-2 text-muted-foreground">{entry.uiTab}</td>
      <td className="px-3 py-2 text-muted-foreground">{entry.uiControl.replace(/_/g, " ")}</td>
      <td className="px-3 py-2">
        <div className="flex items-start gap-1.5">
          {hasWarning ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
          )}
          <div className="min-w-0">
            <div className="truncate text-muted-foreground">{valueSummary(value)}</div>
            {unknownKeys.length > 0 && (
              <div className="mt-1 text-doc-support text-warning">
                Unknown: {unknownKeys.join(", ")}
              </div>
            )}
            {deprecatedHits.length > 0 && (
              <div className="mt-1 text-doc-support text-warning">
                Deprecated: {deprecatedHits.map((item) => item.key).join(", ")}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function ContractInspector({
  entity,
  selectedField,
}: {
  entity: EntityItem | null;
  selectedField: EntityField | null;
}) {
  const entityContracts = contractsForScope("entity");
  const fieldContracts = contractsForScope("entity_field");
  const rows = selectedField ? fieldContracts : entityContracts;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">
            {selectedField ? `Field contract: ${selectedField.name}` : "Entity contracts"}
          </h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Registry-backed contract definitions, compile targets, and current metadata values.
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 border-b bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Property</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Phase</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Compile</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tab</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Control</th>
              <th className="px-3 py-2 text-left font-medium text-muted-foreground">Current value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => (
              <ContractRow
                key={`${entry.scope}:${entry.property}`}
                entry={entry}
                value={contractValue(entry, entity, selectedField)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MetadataStudioPage() {
  const [search, setSearch]         = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [classFilter, setClassFilter]   = useState("");
  const [selected, setSelected]         = useState<EntityItem | null>(null);
  const [activeTab, setActiveTab]       = useState<"fields" | "contracts">("fields");
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);

  const { data: entities, isLoading: entitiesLoading } = useEntities(activeSearch, classFilter);
  const { data: fields,   isLoading: fieldsLoading }   = useEntityFields(selected?.name ?? null);
  const selectedField = useMemo(
    () => fields?.find((field) => field.id === selectedFieldId) ?? null,
    [fields, selectedFieldId],
  );

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
                "rounded-full px-2.5 py-1 text-doc-support font-medium transition-colors",
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
                  "rounded-full px-2.5 py-1 text-doc-support font-medium transition-colors",
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
              <EmptyState
                icon={<Database className="h-7 w-7 text-muted-foreground/30" />}
                title="No entities found"
                size="sm"
                className="py-10"
              />
            ) : (
              entities.map((entity) => (
                <EntityRow
                  key={entity.id}
                  entity={entity}
                  selected={selected?.id === entity.id}
                  onSelect={() => {
                    setSelected(entity);
                    setSelectedFieldId(null);
                    setActiveTab("fields");
                  }}
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
                    <span className={cn("rounded border px-1.5 py-0.5 text-doc-field-label font-semibold uppercase", resolveSemanticColors(entityClassIntent(selected.entity_class)).subtleBadge)}>
                      {selected.entity_class}
                    </span>
                  </div>
                  <p className="mt-0.5 text-doc-support font-mono text-muted-foreground">
                    {selected.table_schema}.{selected.table_name}
                    {selected.module_id && ` · module: ${selected.module_id}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {fields && (
                    <span className="text-xs text-muted-foreground">
                      {fields.length} fields
                    </span>
                  )}
                  <div className="flex rounded-md border bg-background p-0.5">
                    {(["fields", "contracts"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "rounded px-2 py-1 text-doc-support font-medium capitalize transition-colors",
                          activeTab === tab
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fields / contract inspector */}
              {activeTab === "contracts" ? (
                <ContractInspector entity={selected} selectedField={selectedField} />
              ) : (
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
                        <FieldRow
                          key={field.id}
                          field={field}
                          selected={selectedFieldId === field.id}
                          onSelect={() => {
                            setSelectedFieldId(field.id);
                            setActiveTab("contracts");
                          }}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              )}
            </>
          )}
        </div>

      </div>
    </PageFrame>
  );
}
