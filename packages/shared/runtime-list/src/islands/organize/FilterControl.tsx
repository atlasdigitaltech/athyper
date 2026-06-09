"use client";

import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Filter, Loader2, Plus, Search, X } from "lucide-react";
import { DatePicker } from "@athyper/ui/composites";
import { ActiveFilterCard } from "@athyper/ui/organize";
import type { RuntimeField, RuntimeFilterKind, RuntimeFilterOperator, RuntimeFilterOption } from "../../core/types";
import { PaletteButton } from "./PaletteButton";
import { PaletteDrawerActions } from "./PaletteDrawerActions";
import { PaletteDrawer } from "./PaletteDrawer";
import {
  ORGANIZE_COMPACT_DATE_INPUT_CLASS,
  ORGANIZE_INPUT_WITH_CLEAR_CLASS,
  ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS,
  ORGANIZE_SECTION_LABEL_CLASS,
  filterValuePillClass,
} from "./paletteStyles";
import {
  buildFilterOverrides,
  parseFilterDraft,
  sanitizeFilterValue,
  serializeOrganizeState,
} from "./organizeUrl";
import { useOrganizePanel } from "./organizeState";

interface FilterControlProps {
  fieldOptionsApiHrefBase?: string | null;
  filterableFields:  RuntimeField[];
  listBaseHref:      string;
  rawSearchParams:   Record<string, string | string[] | undefined>;
  buttonSize?:       "default" | "compact";
}

export function FilterControl({
  fieldOptionsApiHrefBase,
  filterableFields,
  listBaseHref,
  rawSearchParams,
  buttonSize = "default",
}: FilterControlProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panel = useOrganizePanel("filter");
  const currentDraft = useMemo(
    () => parseFilterDraft(rawSearchParams, filterableFields),
    [filterableFields, rawSearchParams],
  );
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [stagedFieldNames, setStagedFieldNames] = useState<string[]>(() => Object.keys(currentDraft));
  const [fieldSearch, setFieldSearch] = useState("");
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [recentFieldNames, setRecentFieldNames] = useState<string[]>([]);
  const hasChanges = !filterDraftsEqual(draft, currentDraft, filterableFields);
  const activeFilterCount = Object.values(currentDraft)
    .filter((values) => normalizeFilterValues(values).length > 0).length;

  useEffect(() => {
    if (panel.open) {
      setDraft(currentDraft);
      setStagedFieldNames(Object.keys(currentDraft));
      setFieldSearch("");
      setRecentFieldNames(readRecentFilterFields(listBaseHref));
    }
  }, [currentDraft, listBaseHref, panel.open]);

  if (filterableFields.length === 0) return null;

  const apply = () => {
    rememberRecentFilterFields(listBaseHref, Object.keys(draft), setRecentFieldNames);
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, buildFilterOverrides(filterableFields, draft)));
    panel.close();
  };

  const reset = () => {
    setDraft({});
    setStagedFieldNames([]);
  };

  const fieldByName = new Map(filterableFields.map((field) => [field.name, field] as const));
  const prototypeFields = filterableFields
    .filter(isPrototypeFilterField)
    .sort(prototypeFieldSort);
  const activeFieldNames = Array.from(new Set([...Object.keys(draft), ...stagedFieldNames]))
    .filter((name) => fieldByName.has(name));
  const activeFieldNameSet = new Set(activeFieldNames);
  const draftFilterCount = Object.values(draft).filter((values) => normalizeFilterValues(values).length > 0).length;
  const activeFields = activeFieldNames
    .map((name) => fieldByName.get(name))
    .filter((field): field is RuntimeField => Boolean(field));
  const suggestedFields = prototypeFields
    .filter((field) => !activeFieldNameSet.has(field.name))
    .slice(0, 6);
  const recentFields = recentFieldNames
    .map((name) => fieldByName.get(name))
    .filter((field): field is RuntimeField => Boolean(field))
    .filter((field) => !activeFieldNameSet.has(field.name))
    .slice(0, 6);
  const searchableFields = filterableFields
    .filter((field) => field.isFilterable !== false)
    .sort(filterPickerSort);
  const searchResults = fieldSearch.trim()
    ? searchableFields.filter((field) => fieldMatchesSearch(field, fieldSearch)).slice(0, 12)
    : null;
  const advancedFields = searchableFields.filter((field) => !activeFieldNameSet.has(field.name));
  const advancedGroups = groupAdvancedFields(advancedFields);

  const setFieldValues = (fieldName: string, values: string[]) => {
    setDraft((prev) => setDraftEntry(prev, fieldName, values));
    if (values.length > 0) {
      setStagedFieldNames((prev) => prev.includes(fieldName) ? prev : [...prev, fieldName]);
    }
  };

  const addField = (fieldName: string) => {
    setStagedFieldNames((prev) => prev.includes(fieldName) ? prev : [...prev, fieldName]);
    setFieldSearch("");
    rememberRecentFilterFields(listBaseHref, [fieldName], setRecentFieldNames);
  };

  const removeField = (fieldName: string) => {
    setDraft((prev) => setDraftEntry(prev, fieldName, []));
    setStagedFieldNames((prev) => prev.filter((name) => name !== fieldName));
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      <PaletteButton
        ref={buttonRef}
        icon={Filter}
        label="Filter"
        active={activeFilterCount > 0}
        expanded={panel.open}
        size={buttonSize}
        onClick={panel.toggle}
      />
      {panel.open && (
        <PaletteDrawer
          anchorRef={buttonRef}
          title={`Filter${draftFilterCount > 0 ? ` ${draftFilterCount}` : ""}`}
          icon={Filter}
          onClose={panel.close}
          footer={(
            <PaletteDrawerActions
              onApply={apply}
              onReset={reset}
              onDiscard={panel.close}
              hasChanges={hasChanges}
            />
          )}
        >
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={fieldSearch}
                onChange={(event) => setFieldSearch(event.currentTarget.value)}
                placeholder="Add filter..."
                className={ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS}
              />
              {fieldSearch && (
                <button
                  type="button"
                  aria-label="Clear filter search"
                  onClick={() => setFieldSearch("")}
                  className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </div>

            {searchResults !== null ? (
              <FilterSearchResults
                query={fieldSearch}
                results={searchResults}
                activeFieldNames={activeFieldNameSet}
                advancedAvailable={advancedFields.length > 0}
                onAdd={addField}
                onOpenMore={() => {
                  setFieldSearch("");
                  setShowMoreFilters(true);
                }}
              />
            ) : (
              <>
                {suggestedFields.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Suggested filters</h3>
                      <span className="text-xs text-muted-foreground">Metadata driven</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {suggestedFields.map((field) => (
                        <button
                          key={field.name}
                          type="button"
                          onClick={() => addField(field.name)}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                        >
                          <Plus aria-hidden="true" className="size-3.5" />
                          {field.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {recentFields.length > 0 && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Recently used</h3>
                      <span className="text-xs text-muted-foreground">{recentFields.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentFields.map((field) => (
                        <button
                          key={field.name}
                          type="button"
                          onClick={() => addField(field.name)}
                          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                        >
                          <Plus aria-hidden="true" className="size-3.5" />
                          {field.label}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Active filters</h3>
                    {draftFilterCount > 0 && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                        {draftFilterCount}
                      </span>
                    )}
                  </div>
                  {activeFields.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-6 text-center">
                      <p className="text-sm font-medium">No filters selected</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {prototypeFields.length > 0
                          ? "Add suggested filters from the metadata above."
                          : "Open More filters to choose from the available fields."}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeFields.map((field) => (
                        <ActiveFilterRow
                          key={field.name}
                          field={field}
                          fieldOptionsApiHrefBase={fieldOptionsApiHrefBase}
                          values={draft[field.name] ?? []}
                          onChange={(values) => setFieldValues(field.name, values)}
                          onRemove={() => removeField(field.name)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {advancedFields.length > 0 && (
                  <section className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowMoreFilters((value) => !value)}
                      className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-semibold hover:text-foreground"
                    >
                      {showMoreFilters
                        ? <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
                        : <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                      }
                      <span className="flex-1">More filters</span>
                      <span className="text-xs font-normal text-muted-foreground">{advancedFields.length}</span>
                    </button>

                    {showMoreFilters && (
                      <div className="space-y-3">
                        {advancedGroups.map((group) => {
                          const collapsed = collapsedGroups[group.key] ?? false;
                          return (
                            <div key={group.key} className="rounded-lg border">
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.key)}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
                              >
                                {collapsed
                                  ? <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                                  : <ChevronDown aria-hidden="true" className="size-4 text-muted-foreground" />
                                }
                                <span className="flex-1">{group.label}</span>
                                <span className="text-xs font-normal text-muted-foreground">{group.fields.length}</span>
                              </button>
                              {!collapsed && (
                                <div className="divide-y px-1 pb-1">
                                  {group.fields.map((field) => (
                                    <FieldPickerRow
                                      key={field.name}
                                      field={field}
                                      onAdd={() => addField(field.name)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        </PaletteDrawer>
      )}
    </>
  );
}

const DATE_DATA_TYPES = new Set(["date", "datetime", "timestamp", "timestamptz"]);

const DATE_EMPTY_FILTERS = [
  ["null", "is empty"],
  ["notnull", "has value"],
] as const;

const DATE_SHORTCUT_FILTERS = [
  ["@today", "Today"],
  ["@this_week", "This Week"],
  ["@this_month", "This Month"],
  ["@this_quarter", "This Quarter"],
  ["@this_year", "This Year"],
  ["@yesterday", "Yesterday"],
  ["@last_week", "Last Week"],
  ["@last_month", "Last Month"],
  ["@last_quarter", "Last Quarter"],
  ["@last_year", "Last Year"],
  ["@ytd", "YTD"],
  ["@mtd", "MTD"],
] as const;

const RECENT_FILTER_LIMIT = 8;
const FILTER_INPUT_WITH_CLEAR_CLASS = ORGANIZE_INPUT_WITH_CLEAR_CLASS;

function setDraftEntry(
  draft:     Record<string, string[]>,
  fieldName: string,
  values:    string[],
): Record<string, string[]> {
  const normalized = normalizeFilterValues(values);
  const next = { ...draft };
  if (normalized.length > 0) {
    next[fieldName] = normalized;
  } else {
    delete next[fieldName];
  }
  return next;
}

function normalizedFieldText(field: RuntimeField): string {
  return `${field.name} ${field.label} ${field.semanticRole ?? ""} ${field.dataType} ${field.uiType ?? ""} ${field.filter?.kind ?? ""} ${field.filter?.section?.label ?? ""}`
    .toLowerCase()
    .replace(/[_-]/g, " ");
}

function isStatusFilterField(field: RuntimeField): boolean {
  const kind = runtimeFilterKind(field);
  if (kind !== "enum" && kind !== "lookup" && kind !== "boolean" && kind !== "text") return false;
  const text = normalizedFieldText(field);
  return text.includes("status")
    || text.includes(" state")
    || text.includes("stage")
    || text.includes(" active")
    || text.includes("enabled");
}

function isDateFilterField(field: RuntimeField): boolean {
  const kind = runtimeFilterKind(field);
  if (kind === "date" || kind === "datetime") return true;
  const dataType = field.dataType.toLowerCase();
  const text = normalizedFieldText(field);
  return DATE_DATA_TYPES.has(dataType)
    || text.includes(" created at")
    || text.includes(" updated at")
    || text.includes(" date")
    || text.endsWith(" at");
}

function isPrototypeFilterField(field: RuntimeField): boolean {
  return field.filter?.quick === true || isStatusFilterField(field) || isDateFilterField(field);
}

function prototypeFieldSort(a: RuntimeField, b: RuntimeField): number {
  const aQuick = a.filter?.quick === true ? 0 : 1;
  const bQuick = b.filter?.quick === true ? 0 : 1;
  if (aQuick !== bQuick) return aQuick - bQuick;

  const aQuickOrder = a.filter?.quickOrder ?? 999;
  const bQuickOrder = b.filter?.quickOrder ?? 999;
  if (aQuickOrder !== bQuickOrder) return aQuickOrder - bQuickOrder;

  const aStatus = isStatusFilterField(a) ? 0 : 1;
  const bStatus = isStatusFilterField(b) ? 0 : 1;
  if (aStatus !== bStatus) return aStatus - bStatus;

  const preferred = ["status", "state", "is_active", "active", "created_at", "updated_at"];
  const aRank = preferred.includes(a.name) ? preferred.indexOf(a.name) : 999;
  const bRank = preferred.includes(b.name) ? preferred.indexOf(b.name) : 999;
  if (aRank !== bRank) return aRank - bRank;

  return a.order - b.order;
}

function filterPickerSort(a: RuntimeField, b: RuntimeField): number {
  const aPrototype = isPrototypeFilterField(a) ? 0 : 1;
  const bPrototype = isPrototypeFilterField(b) ? 0 : 1;
  if (aPrototype !== bPrototype) return aPrototype - bPrototype;
  if (aPrototype === 0) return prototypeFieldSort(a, b);
  return a.order - b.order;
}

function filterKindLabel(field: RuntimeField): string {
  const kind = runtimeFilterKind(field);
  if (kind === "date" || kind === "datetime") return kind === "datetime" ? "Date and time" : "Date";
  if (kind === "boolean") return "Yes / No";
  if (kind === "number") return "Number";
  if (kind === "money") return "Amount";
  if (kind === "enum") return "Choice";
  if (kind === "lookup") return "Lookup";
  if (kind === "reference") return "Reference";
  if (kind === "json") return "JSON";
  if (kind === "presence") return "Presence";
  if (isStatusFilterField(field)) return "Status";
  return "Field";
}

function fieldMatchesSearch(field: RuntimeField, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return normalizedFieldText(field).includes(q);
}

function groupAdvancedFields(fields: RuntimeField[]): Array<{ key: string; label: string; fields: RuntimeField[] }> {
  const groups = new Map<string, RuntimeField[]>();
  for (const field of fields) {
    const key = field.filter?.section?.key ?? field.semanticRole ?? runtimeFilterKind(field) ?? field.dataType ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), field]);
  }
  return Array.from(groups.entries()).map(([key, groupFields]) => ({
    key,
    label: groupFields.find((field) => field.filter?.section?.key === key)?.filter?.section?.label ?? formatGroupLabel(key),
    fields: groupFields.sort((a, b) => a.order - b.order),
  })).sort((a, b) => {
    const aOrder = a.fields.find((field) => field.filter?.section?.key === a.key)?.filter?.section?.order ?? 999;
    const bOrder = b.fields.find((field) => field.filter?.section?.key === b.key)?.filter?.section?.order ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.label.localeCompare(b.label);
  });
}

function formatGroupLabel(key: string): string {
  if (!key) return "Other";
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function runtimeFilterKind(field: RuntimeField): RuntimeFilterKind {
  return field.filter?.kind ?? fallbackFilterKind(field);
}

function fallbackFilterKind(field: RuntimeField): RuntimeFilterKind {
  const dataType = field.dataType.toLowerCase();
  const uiType = field.uiType?.toLowerCase() ?? "";
  if (DATE_DATA_TYPES.has(dataType)) return dataType === "date" ? "date" : "datetime";
  if (dataType === "boolean" || dataType === "bool" || uiType.includes("checkbox")) return "boolean";
  if (["integer", "bigint", "decimal", "numeric", "number"].includes(dataType)) return "number";
  if (dataType === "money") return "money";
  if (dataType === "enum" || dataType === "lifecycle_state") return "enum";
  if (dataType === "json" || dataType === "jsonb") return "json";
  if (field.options && field.options.length > 0) return "enum";
  return "text";
}

function allowsFilterOperator(field: RuntimeField, operator: RuntimeFilterOperator): boolean {
  const operators = field.filter?.operators;
  return !operators?.length || operators.includes(operator);
}

function allowsAnyFilterOperator(field: RuntimeField, operators: RuntimeFilterOperator[]): boolean {
  return operators.some((operator) => allowsFilterOperator(field, operator));
}

function supportsEmptyOperators(field: RuntimeField): boolean {
  return allowsAnyFilterOperator(field, ["empty", "not_empty"]);
}

function recentFilterStorageKey(listBaseHref: string): string {
  return `runtime-list:recent-filters:${listBaseHref}`;
}

function readRecentFilterFields(listBaseHref: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(recentFilterStorageKey(listBaseHref));
    const parsed = raw ? JSON.parse(raw) as unknown : null;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, RECENT_FILTER_LIMIT)
      : [];
  } catch {
    return [];
  }
}

function rememberRecentFilterFields(
  listBaseHref: string,
  fieldNames:   string[],
  setRecent:    Dispatch<SetStateAction<string[]>>,
): void {
  const names = fieldNames.filter(Boolean);
  if (names.length === 0) return;
  setRecent((prev) => {
    const next = [...names, ...prev.filter((name) => !names.includes(name))].slice(0, RECENT_FILTER_LIMIT);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(recentFilterStorageKey(listBaseHref), JSON.stringify(next));
      } catch { /* localStorage is best effort */ }
    }
    return next;
  });
}

function FilterSearchResults({
  query,
  results,
  activeFieldNames,
  advancedAvailable,
  onAdd,
  onOpenMore,
}: {
  query:             string;
  results:           RuntimeField[];
  activeFieldNames:  Set<string>;
  advancedAvailable: boolean;
  onAdd:             (fieldName: string) => void;
  onOpenMore:        () => void;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-center">
        <p className="text-sm font-medium">No filters match "{query}".</p>
        {advancedAvailable && (
          <button
            type="button"
            onClick={onOpenMore}
            className="mt-2 text-sm font-medium underline underline-offset-2"
          >
            Open more filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      {results.map((field) => {
        const active = activeFieldNames.has(field.name);
        return (
          <button
            key={field.name}
            type="button"
            disabled={active}
            onClick={() => onAdd(field.name)}
            className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50 disabled:cursor-default disabled:bg-muted/30"
          >
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
              <Plus aria-hidden="true" className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{field.label}</span>
              <span className="text-xs text-muted-foreground">{filterKindLabel(field)}</span>
            </span>
            <span className="text-xs text-muted-foreground">{active ? "Added" : "Add"}</span>
          </button>
        );
      })}
    </div>
  );
}

function FieldPickerRow({
  field,
  onAdd,
}: {
  field: RuntimeField;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm transition-colors hover:bg-muted/60"
    >
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground">
        <Plus aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{field.label}</span>
        <span className="text-xs text-muted-foreground">{filterKindLabel(field)}</span>
      </span>
      <span className="text-xs font-medium text-muted-foreground">Add</span>
    </button>
  );
}

function ActiveFilterRow({
  field,
  fieldOptionsApiHrefBase,
  values,
  onChange,
  onRemove,
}: {
  field:    RuntimeField;
  fieldOptionsApiHrefBase?: string | null;
  values:   string[];
  onChange: (values: string[]) => void;
  onRemove: () => void;
}) {
  const value = values[0] ?? "";
  const nullPresenceActions = supportsEmptyOperators(field)
    ? <EmptyValueButtons field={field} value={value} onChange={onChange} />
    : null;

  const kind = runtimeFilterKind(field);
  if (kind === "date" || kind === "datetime") {
    return (
      <ActiveFilterCard
        label={field.label}
        onClear={onRemove}
        headerActions={nullPresenceActions}
      >
        {allowsAnyFilterOperator(field, ["relative", "between", "gte", "lte", "gt", "lt", "eq"])
          ? <DateFilterEditor field={field} values={values} onChange={onChange} />
          : <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />
        }
      </ActiveFilterCard>
    );
  }

  return (
    <ActiveFilterCard
      label={field.label}
      onClear={onRemove}
      headerActions={nullPresenceActions}
    >
      <FilterFieldController
        field={field}
        fieldOptionsApiHrefBase={fieldOptionsApiHrefBase}
        values={values}
        onChange={onChange}
      />
    </ActiveFilterCard>
  );
}

function FilterFieldController({
  field,
  fieldOptionsApiHrefBase,
  values,
  onChange,
}: {
  field:    RuntimeField;
  fieldOptionsApiHrefBase?: string | null;
  values:   string[];
  onChange: (values: string[]) => void;
}) {
  const kind = runtimeFilterKind(field);
  if (kind === "date" || kind === "datetime") {
    return allowsAnyFilterOperator(field, ["relative", "between", "gte", "lte", "gt", "lt", "eq"])
      ? <DateFilterEditor field={field} values={values} onChange={onChange} />
      : <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />;
  }
  if (kind === "boolean") {
    return allowsFilterOperator(field, "eq")
      ? <BooleanFilterEditor values={values} onChange={onChange} />
      : <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />;
  }
  if (kind === "number" || kind === "money") {
    return allowsAnyFilterOperator(field, ["between", "gte", "lte", "gt", "lt", "eq"])
      ? <NumericFilterEditor field={field} values={values} onChange={onChange} />
      : <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />;
  }
  if (kind === "enum" || kind === "lookup" || kind === "reference") {
    return allowsAnyFilterOperator(field, ["in", "not_in"]) ? (
      <OptionFilterEditor
        field={field}
        fieldOptionsApiHrefBase={fieldOptionsApiHrefBase}
        values={values}
        onChange={onChange}
      />
    ) : <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />;
  }
  if (kind === "json" || kind === "presence") {
    return <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />;
  }
  return allowsAnyFilterOperator(field, ["contains", "eq"])
    ? <TextFilterEditor field={field} values={values} onChange={onChange} />
    : <PresenceOnlyFilterEditor field={field} values={values} onChange={onChange} />;
}

const STATUS_FALLBACK_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Pending" },
  { value: "closed", label: "Closed" },
];

function localFilterOptions(field: RuntimeField): RuntimeFilterOption[] {
  const staticSource = field.filter?.optionSource?.kind === "static"
    ? field.filter.optionSource.options
    : [];
  const options = staticSource.length > 0 ? staticSource : field.options ?? [];
  if (options.length > 0) return options;
  return isStatusFilterField(field) ? STATUS_FALLBACK_OPTIONS : [];
}

function filterRuntimeOptions(options: RuntimeFilterOption[], query: string): RuntimeFilterOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options;
  return options.filter((option) => (
    option.value.toLowerCase().includes(q) ||
    option.label.toLowerCase().includes(q) ||
    option.description?.toLowerCase().includes(q)
  ));
}

function parseOptionSelection(values: string[], field: RuntimeField): { mode: "in" | "not_in"; values: string[] } {
  const defaultMode: "in" | "not_in" = allowsFilterOperator(field, "in")
    ? "in"
    : allowsFilterOperator(field, "not_in")
      ? "not_in"
      : "in";
  const semanticValues = values.filter((value) => !isNullPresenceValue(value));
  const first = semanticValues[0] ?? "";
  if (first.startsWith("not_in:")) {
    return {
      mode: allowsFilterOperator(field, "not_in") ? "not_in" : defaultMode,
      values: splitOptionList(first.slice("not_in:".length)),
    };
  }
  if (first.startsWith("in:")) {
    return {
      mode: allowsFilterOperator(field, "in") ? "in" : defaultMode,
      values: splitOptionList(first.slice("in:".length)),
    };
  }
  return { mode: defaultMode, values: semanticValues };
}

function formatOptionSelection(values: string[], mode: "in" | "not_in"): string[] {
  const clean = Array.from(new Set(values.map(sanitizeFilterValue).filter(Boolean)));
  if (clean.length === 0) return [];
  if (mode === "not_in") return [`not_in:${clean.join(",")}`];
  return clean;
}

function splitOptionList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

function readRuntimeOptions(value: unknown): RuntimeFilterOption[] {
  if (!isRecord(value) || !Array.isArray(value["options"])) return [];
  return value["options"]
    .filter(isRecord)
    .map((option): RuntimeFilterOption | null => {
      const optionValue = readOptionString(option["value"]);
      const label = readOptionString(option["label"]) ?? optionValue;
      if (!optionValue || !label) return null;
      return {
        value: optionValue,
        label,
        description: readOptionString(option["description"]),
        disabled: typeof option["disabled"] === "boolean" ? option["disabled"] : undefined,
      };
    })
    .filter((option): option is RuntimeFilterOption => Boolean(option));
}

function readResponseMessage(value: unknown): string | undefined {
  return isRecord(value) && typeof value["message"] === "string" ? value["message"] : undefined;
}

function readOptionString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function NumericFilterEditor({
  field,
  values,
  onChange,
}: {
  field:    RuntimeField;
  values:   string[];
  onChange: (values: string[]) => void;
}) {
  const value = values[0] ?? "";
  const range = numericRangeFromFilterValue(value);
  const [min, setMin] = useState(range.min);
  const [max, setMax] = useState(range.max);

  useEffect(() => {
    setMin(range.min);
    setMax(range.max);
  }, [range.min, range.max]);

  const commit = (nextMin: string, nextMax: string) => {
    onChange(numericBoundaryFilterValue(field, nextMin, nextMax));
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={min}
        onChange={(event) => setMin(event.currentTarget.value)}
        onBlur={() => commit(min, max)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(min, max);
        }}
        placeholder="Min"
        className={FILTER_INPUT_WITH_CLEAR_CLASS}
      />
      <span className="shrink-0 text-sm text-muted-foreground">-</span>
      <input
        type="number"
        value={max}
        onChange={(event) => setMax(event.currentTarget.value)}
        onBlur={() => commit(min, max)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(min, max);
        }}
        placeholder="Max"
        className={FILTER_INPUT_WITH_CLEAR_CLASS}
      />
    </div>
  );
}

function OptionFilterEditor({
  field,
  fieldOptionsApiHrefBase,
  values,
  onChange,
}: {
  field: RuntimeField;
  fieldOptionsApiHrefBase?: string | null;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const localOptions = localFilterOptions(field);
  if (localOptions.length > 0) {
    return (
      <StaticOptionFilterEditor
        field={field}
        options={localOptions}
        values={values}
        onChange={onChange}
      />
    );
  }

  const source = field.filter?.optionSource;
  if ((source?.kind === "lookup" || source?.kind === "reference") && fieldOptionsApiHrefBase) {
    return (
      <AsyncOptionFilterEditor
        field={field}
        fieldOptionsApiHrefBase={fieldOptionsApiHrefBase}
        values={values}
        onChange={onChange}
      />
    );
  }

  return <TextFilterEditor field={field} values={values} onChange={onChange} />;
}

function StaticOptionFilterEditor({
  field,
  options,
  values,
  onChange,
}: {
  field: RuntimeField;
  options: RuntimeFilterOption[];
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const visibleOptions = filterRuntimeOptions(options, query);

  return (
    <div className="space-y-2">
      {options.length > 8 && (
        <OptionSearchInput
          value={query}
          onChange={setQuery}
          placeholder={`Search ${field.label.toLowerCase()}...`}
        />
      )}
      <OptionChecklist
        field={field}
        options={visibleOptions}
        values={values}
        valueLabelMap={field.filter?.valueLabelMap}
        onChange={onChange}
      />
    </div>
  );
}

function AsyncOptionFilterEditor({
  field,
  fieldOptionsApiHrefBase,
  values,
  onChange,
}: {
  field: RuntimeField;
  fieldOptionsApiHrefBase: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RuntimeFilterOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const selected = parseOptionSelection(values, field);
  const currentValue = selected.values[0] ?? "";

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
    if (currentValue) params.set("value", currentValue);

    setLoading(true);
    setMessage("");
    fetch(`${trimTrailingSlash(fieldOptionsApiHrefBase)}/${encodeURIComponent(field.name)}?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await readJson(response);
        if (!response.ok) {
          throw new Error(readResponseMessage(body) ?? `Options returned ${response.status}`);
        }
        return readRuntimeOptions(body);
      })
      .then((nextOptions) => {
        setOptions(nextOptions);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setOptions([]);
        setMessage(error instanceof Error ? error.message : "Options unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [currentValue, debouncedQuery, field.name, fieldOptionsApiHrefBase]);

  return (
    <div className="space-y-2">
      <OptionSearchInput
        value={query}
        onChange={setQuery}
        placeholder={`Search ${field.label.toLowerCase()}...`}
        loading={loading}
      />
      <OptionChecklist
        field={field}
        options={options}
        values={values}
        valueLabelMap={field.filter?.valueLabelMap}
        onChange={onChange}
      />
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

function OptionSearchInput({
  value,
  onChange,
  placeholder,
  loading,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={placeholder}
        className={`${FILTER_INPUT_WITH_CLEAR_CLASS} pl-8 pr-8`}
      />
      {loading ? (
        <Loader2 aria-hidden="true" className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : value ? (
        <button
          type="button"
          aria-label="Clear option search"
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

function OptionChecklist({
  field,
  options,
  values,
  valueLabelMap,
  onChange,
}: {
  field: RuntimeField;
  options: RuntimeFilterOption[];
  values: string[];
  valueLabelMap?: Record<string, string>;
  onChange: (values: string[]) => void;
}) {
  const selection = parseOptionSelection(values, field);
  const selectedSet = new Set(selection.values);
  const optionMap = new Map(options.map((option) => [option.value, option]));
  const selectedOptions = selection.values.map((value) => ({
    value,
    label: valueLabelMap?.[value] ?? optionMap.get(value)?.label ?? value,
  }));

  const setSelected = (nextValues: string[]) => {
    onChange(formatOptionSelection(nextValues, selection.mode));
  };

  const toggleValue = (value: string) => {
    const next = selectedSet.has(value)
      ? selection.values.filter((item) => item !== value)
      : [...selection.values, value];
    setSelected(next);
  };

  return (
    <div className="space-y-2">
      {selectedOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedOptions.map((option) => (
            <span
              key={option.value}
              className="inline-flex min-h-7 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium"
            >
              {option.label}
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                onClick={() => toggleValue(option.value)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X aria-hidden="true" className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {selectedOptions.length > 0 && allowsFilterOperator(field, "not_in") && (
        <button
          type="button"
          onClick={() => onChange(formatOptionSelection(selection.values, selection.mode === "not_in" ? "in" : "not_in"))}
          className={filterPillClass(selection.mode === "not_in")}
        >
          {selection.mode === "not_in" ? "Excluding" : "Hide these"}
        </button>
      )}

      <div className="grid max-h-48 gap-1 overflow-auto rounded-md border p-1">
        {options.length === 0 ? (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">No values available</p>
        ) : (
          options.map((option) => {
            const checked = selectedSet.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => toggleValue(option.value)}
                className="flex min-h-8 items-center gap-2 rounded px-2 text-left text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className={[
                  "inline-flex size-4 shrink-0 items-center justify-center rounded border",
                  checked ? "border-foreground bg-foreground text-background" : "border-input",
                ].join(" ")}
                >
                  {checked && <Check aria-hidden="true" className="size-3" />}
                </span>
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function PresenceOnlyFilterEditor({
  field,
  values,
  onChange,
}: {
  field: RuntimeField;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const value = values[0] ?? "";
  const options = presenceOptions(field);
  return (
    <div className="grid h-8 overflow-hidden rounded-md border" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map(([optionValue, label]) => {
        const selected = value === optionValue || (!optionValue && !value);
        return (
          <button
            key={optionValue || "any"}
            type="button"
            onClick={() => onChange(optionValue ? [optionValue] : [])}
            className={[
              "border-r text-xs font-medium last:border-r-0",
              selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function DateFilterEditor({
  field,
  values,
  onChange,
}: {
  field:    RuntimeField;
  values:   string[];
  onChange: (values: string[]) => void;
}) {
  const value = values[0] ?? "";
  const range = dateRangeFromFilterValue(value);
  const showShortcuts = allowsFilterOperator(field, "relative");
  const showRange = allowsAnyFilterOperator(field, ["between", "gte", "lte", "gt", "lt", "eq"]);

  return (
    <div className="space-y-2">
      {showShortcuts && (
      <div className="flex flex-wrap gap-0.5">
        {DATE_SHORTCUT_FILTERS.map(([token, label]) => {
          const selected = value === token;
          return (
            <button
              key={token}
              type="button"
              onClick={() => onChange(selected ? [] : [token])}
              className={filterPillClass(selected)}
            >
              {label}
            </button>
          );
        })}
      </div>
      )}

      {showRange && (
      <div className="space-y-1">
        <p className={ORGANIZE_SECTION_LABEL_CLASS}>Custom range</p>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-0.5">
          <DatePicker
            value={range.from || null}
            onChange={(nextValue) => onChange(dateBoundaryFilterValue(field, nextValue ?? "", range.to))}
            placeholder="dd/mm/yyyy"
            clearable={false}
            popoverAlign="center"
            className={ORGANIZE_COMPACT_DATE_INPUT_CLASS}
          />
          <span className="shrink-0 text-sm text-muted-foreground">-</span>
          <DatePicker
            value={range.to || null}
            onChange={(nextValue) => onChange(dateBoundaryFilterValue(field, range.from, nextValue ?? ""))}
            placeholder="dd/mm/yyyy"
            clearable={false}
            popoverAlign="center"
            className={ORGANIZE_COMPACT_DATE_INPUT_CLASS}
          />
        </div>
      </div>
      )}
    </div>
  );
}

function EmptyValueButtons({
  field,
  value,
  onChange,
}: {
  field:    RuntimeField;
  value:    string;
  onChange: (values: string[]) => void;
}) {
  const options = DATE_EMPTY_FILTERS.filter(([token]) => (
    token === "null"
      ? allowsFilterOperator(field, "empty")
      : allowsFilterOperator(field, "not_empty")
  ));
  if (options.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-end gap-0.5">
      {options.map(([token, label]) => {
        const selected = value === token;
        return (
          <button
            key={token}
            type="button"
            onClick={() => onChange(selected ? [] : [token])}
            className={filterPillClass(selected)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

const filterPillClass = filterValuePillClass;

function isNullPresenceValue(value: string): boolean {
  return value === "null" || value === "notnull";
}

function presenceOptions(field: RuntimeField): Array<readonly [string, string]> {
  return [
    ["", "Any"] as const,
    ...(allowsFilterOperator(field, "not_empty") ? [["notnull", "Has value"] as const] : []),
    ...(allowsFilterOperator(field, "empty") ? [["null", "Empty"] as const] : []),
  ];
}

function dateBoundaryFilterValue(field: RuntimeField, from: string, to: string): string[] {
  const cleanFrom = from.trim();
  const cleanTo = to.trim();
  if (cleanFrom && cleanTo && cleanFrom === cleanTo && allowsFilterOperator(field, "eq")) return [cleanFrom];
  if (cleanFrom && cleanTo) {
    if (allowsFilterOperator(field, "between")) return [`between:${cleanFrom},${cleanTo}`];
    return [
      ...(allowsFilterOperator(field, "gte") ? [`>=${cleanFrom}`] : allowsFilterOperator(field, "gt") ? [`>${cleanFrom}`] : []),
      ...(allowsFilterOperator(field, "lte") ? [`<=${cleanTo}`] : allowsFilterOperator(field, "lt") ? [`<${cleanTo}`] : []),
    ];
  }
  if (cleanFrom) return allowsFilterOperator(field, "gte") ? [`>=${cleanFrom}`] : allowsFilterOperator(field, "gt") ? [`>${cleanFrom}`] : [];
  if (cleanTo) return allowsFilterOperator(field, "lte") ? [`<=${cleanTo}`] : allowsFilterOperator(field, "lt") ? [`<${cleanTo}`] : [];
  return [];
}

function dateRangeFromFilterValue(value: string): { from: string; to: string } {
  if (value.startsWith("between:")) {
    const rest = value.slice("between:".length);
    const comma = rest.indexOf(",");
    if (comma > 0) {
      return { from: rest.slice(0, comma).trim(), to: rest.slice(comma + 1).trim() };
    }
  }
  if (value.startsWith(">=")) return { from: value.slice(2), to: "" };
  if (value.startsWith("<=")) return { from: "", to: value.slice(2) };
  if (value.startsWith(">")) return { from: value.slice(1), to: "" };
  if (value.startsWith("<")) return { from: "", to: value.slice(1) };
  return { from: "", to: "" };
}

function numericBoundaryFilterValue(field: RuntimeField, min: string, max: string): string[] {
  const cleanMin = min.trim();
  const cleanMax = max.trim();
  if (cleanMin && cleanMax && cleanMin === cleanMax && allowsFilterOperator(field, "eq")) return [cleanMin];
  if (cleanMin && cleanMax) {
    if (allowsFilterOperator(field, "between")) return [`between:${cleanMin},${cleanMax}`];
    return [
      ...(allowsFilterOperator(field, "gte") ? [`>=${cleanMin}`] : allowsFilterOperator(field, "gt") ? [`>${cleanMin}`] : []),
      ...(allowsFilterOperator(field, "lte") ? [`<=${cleanMax}`] : allowsFilterOperator(field, "lt") ? [`<${cleanMax}`] : []),
    ];
  }
  if (cleanMin) return allowsFilterOperator(field, "gte") ? [`>=${cleanMin}`] : allowsFilterOperator(field, "gt") ? [`>${cleanMin}`] : [];
  if (cleanMax) return allowsFilterOperator(field, "lte") ? [`<=${cleanMax}`] : allowsFilterOperator(field, "lt") ? [`<${cleanMax}`] : [];
  return [];
}

function numericRangeFromFilterValue(value: string): { min: string; max: string } {
  if (value.startsWith("between:")) {
    const rest = value.slice("between:".length);
    const comma = rest.indexOf(",");
    if (comma > 0) {
      return { min: rest.slice(0, comma).trim(), max: rest.slice(comma + 1).trim() };
    }
  }
  if (value.startsWith(">=")) return { min: value.slice(2), max: "" };
  if (value.startsWith("<=")) return { min: "", max: value.slice(2) };
  if (value.startsWith(">")) return { min: value.slice(1), max: "" };
  if (value.startsWith("<")) return { min: "", max: value.slice(1) };
  if (isNullPresenceValue(value) || value.startsWith("@") || value.startsWith("~")) return { min: "", max: "" };
  return value ? { min: value, max: value } : { min: "", max: "" };
}

function BooleanFilterEditor({
  values,
  onChange,
}: {
  values:   string[];
  onChange: (values: string[]) => void;
}) {
  const value = values[0] ?? "";
  const options = [
    ["", "Any"],
    ["true", "Yes"],
    ["false", "No"],
  ] as const;

  return (
    <div className="grid h-8 grid-cols-3 overflow-hidden rounded-md border">
      {options.map(([optionValue, label]) => {
        const selected = value === optionValue;
        return (
          <button
            key={optionValue || "any"}
            type="button"
            onClick={() => onChange(optionValue ? [optionValue] : [])}
            className={[
              "border-r text-xs font-medium last:border-r-0",
              selected ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function filterDraftsEqual(
  left:  Record<string, string[]>,
  right: Record<string, string[]>,
  fields:RuntimeField[],
): boolean {
  for (const field of fields) {
    const leftValues = normalizeFilterValues(left[field.name] ?? []);
    const rightValues = normalizeFilterValues(right[field.name] ?? []);
    if (leftValues.length !== rightValues.length) return false;
    if (leftValues.some((value, index) => value !== rightValues[index])) return false;
  }
  return true;
}

function normalizeFilterValues(values: string[]): string[] {
  return Array.from(new Set(values.map(sanitizeFilterValue).filter(Boolean))).sort();
}

function TextFilterEditor({
  field,
  values,
  onChange,
}: {
  field:    RuntimeField;
  values:   string[];
  onChange: (values: string[]) => void;
}) {
  const rawValue = values[0] ?? "";
  const mode: "contains" | "eq" = allowsFilterOperator(field, "contains") ? "contains" : "eq";
  const value = isNullPresenceValue(rawValue) ? "" : rawValue.startsWith("~") ? rawValue.slice(1) : rawValue;
  return (
    <label className="block">
      <div className="relative">
        <input
          type="text"
          value={value}
          placeholder={field.filter?.placeholder ?? (mode === "contains" ? "contains..." : "equals...")}
          onChange={(event) => {
            const next = sanitizeFilterValue(event.currentTarget.value);
            onChange(next ? [mode === "contains" ? `~${next}` : next] : []);
          }}
          className={FILTER_INPUT_WITH_CLEAR_CLASS}
        />
        {value && (
          <button
            type="button"
            aria-label={`Clear ${field.label} filter`}
            onClick={() => onChange([])}
            className="absolute right-1 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-3.5" />
          </button>
        )}
      </div>
    </label>
  );
}
