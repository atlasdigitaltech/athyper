"use client";

/**
 * EntityPicker — Layer-2 entity-aware search picker.
 *
 * Two modes:
 *   Standard  — pass `entityCode`. Fetches from relay automatically.
 *               Uses GET /api/relay/api/records/{entityCode}?q=...
 *   Custom    — pass `search` callback. Caller owns fetch/debounce logic.
 *
 * Renders AsyncCombobox from @athyper/ui/composites.
 * Layer boundary: this is Layer 2 (runtime-shared). Do NOT import from
 * Layer 3 (entity-runtime) or Layer 4 (document-runtime).
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AdvancedEntityCombobox,
  AsyncCombobox,
  type AdvancedEntityChooserBadge,
  type AdvancedEntityChooserControl,
  type AdvancedEntityChooserDensity,
  type AdvancedEntityChooserMetaConfig,
  type AdvancedEntityChooserOption,
  type AdvancedEntityChooserSection,
} from "@athyper/ui/composites";
import { getCsrfToken } from "../client/csrf";
import { useEntitySearch } from "./useEntitySearch";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface EntityPickerOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
  /** URL-safe record identifier when it differs from the stored reference value. */
  recordId?: string;
  /** Original relay row, used by advanced metadata for sections, badges, and filters. */
  raw?: Record<string, unknown>;
}

export interface EntityPickerControlConfig extends AdvancedEntityChooserControl {
  field?: string;
  matchValue?: string;
  searchParam?: string;
}

export interface EntityPickerSectionConfig extends AdvancedEntityChooserSection {
  field?: string;
  matchValue?: string;
}

export interface EntityPickerBadgeConfig {
  label?: string;
  field?: string;
  tone?: AdvancedEntityChooserBadge["tone"];
  labelMap?: Record<string, string>;
  toneMap?: Record<string, AdvancedEntityChooserBadge["tone"]>;
}

export interface EntityPickerTreeConfig {
  enabled?: boolean;
  defaultEnabled?: boolean;
  parentField?: string;
  valueField?: string;
  levelField?: string;
  sortField?: string;
  minRecords?: number;
}

export interface EntityPickerOptionConfig {
  labelField?: string | null;
  labelTemplate?: string | null;
  codeField?: string | null;
  descriptionField?: string | null;
  recordIdField?: string | null;
  showCode?: boolean;
  showDescription?: boolean;
  showViewAction?: boolean;
  variant?: "standard" | "advanced";
  density?: AdvancedEntityChooserDensity;
  width?: number | string;
  maxListHeight?: number | string;
  showKeyboardHints?: boolean;
  showRecentlyUsed?: boolean;
  recentLimit?: number;
  /** Number of records fetched per advanced-picker request and per Load more action. */
  pageSize?: number;
  /** Initial search mode for advanced pickers. Defaults to server search. */
  defaultSearchMode?: "server" | "instant";
  optionActionLabel?: string;
  resultLabel?: string;
  /** ID of the control tab that should be active on first open. Defaults to the first control. */
  defaultControl?: string;
  controls?: EntityPickerControlConfig[];
  sections?: EntityPickerSectionConfig[];
  badges?: EntityPickerBadgeConfig[];
  tree?: EntityPickerTreeConfig;
}

export interface EntityPickerSearchContext {
  activeControl?: EntityPickerControlConfig | null;
  searchParams?: Record<string, string>;
  limit?: number;
  pageSize?: number;
  page?: number;
  treeEnabled?: boolean;
}

export interface EntityPickerSearchResult {
  options: EntityPickerOption[];
  totalCount?: number;
}

export type EntityPickerSearchResponse = EntityPickerOption[] | EntityPickerSearchResult;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function boolConfig(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function numberConfig(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function positiveIntegerConfig(value: unknown): number | undefined {
  const numeric = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) && numeric > 0
    ? Math.floor(numeric)
    : undefined;
}

function searchModeConfig(value: unknown): "server" | "instant" | undefined {
  const mode = textConfig(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!mode) return undefined;
  if (mode === "server" || mode === "server_search" || mode === "remote" || mode === "all") return "server";
  if (mode === "instant" || mode === "instant_search" || mode === "in_view" || mode === "local") return "instant";
  return undefined;
}

function widthConfig(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function lengthConfig(value: unknown): number | string | undefined {
  return widthConfig(value);
}

function densityConfig(value: unknown): AdvancedEntityChooserDensity | undefined {
  return value === "mini" || value === "compact" || value === "comfortable" || value === "mobile"
    ? value
    : undefined;
}

function variantConfig(value: unknown): "standard" | "advanced" | undefined {
  return value === "standard" || value === "advanced" ? value : undefined;
}

function stringMapConfig(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const entries = Object.entries(record)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function toneMapConfig(value: unknown): Record<string, AdvancedEntityChooserBadge["tone"]> | undefined {
  const record = asRecord(value);
  if (!record) return undefined;
  const entries = Object.entries(record).filter((entry): entry is [string, AdvancedEntityChooserBadge["tone"]] => (
    entry[1] === "default" ||
    entry[1] === "muted" ||
    entry[1] === "success" ||
    entry[1] === "warning" ||
    entry[1] === "destructive" ||
    entry[1] === "info"
  ));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function controlsConfig(value: unknown): EntityPickerControlConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const controls = value.flatMap((item, index): EntityPickerControlConfig[] => {
    const control = asRecord(item);
    if (!control) return [];
    const label = textConfig(control["label"]);
    const rawValue = textConfig(control["value"]) ?? textConfig(control["match_value"]) ?? textConfig(control["id"]);
    if (!label || !rawValue) return [];
    return [{
      id: textConfig(control["id"]) ?? `${rawValue}-${index}`,
      label,
      value: rawValue,
      count: numberConfig(control["count"]),
      disabled: boolConfig(control["disabled"]),
      field: textConfig(control["field"]),
      matchValue: textConfig(control["match_value"]) ?? rawValue,
      searchParam: textConfig(control["search_param"] ?? control["searchParam"]),
    }];
  });
  return controls.length > 0 ? controls : undefined;
}

function sectionsConfig(value: unknown): EntityPickerSectionConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const sections = value.flatMap((item, index): EntityPickerSectionConfig[] => {
    const section = asRecord(item);
    if (!section) return [];
    const label = textConfig(section["label"]);
    const id = textConfig(section["id"]) ?? textConfig(section["value"]);
    if (!label || !id) return [];
    return [{
      id,
      label,
      field: textConfig(section["field"]),
      matchValue: textConfig(section["match_value"]) ?? textConfig(section["value"]),
    }];
  });
  return sections.length > 0 ? sections : undefined;
}

function badgesConfig(value: unknown): EntityPickerBadgeConfig[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const badges = value.flatMap((item): EntityPickerBadgeConfig[] => {
    const badge = asRecord(item);
    if (!badge) return [];
    const label = textConfig(badge["label"]);
    const field = textConfig(badge["field"]);
    if (!label && !field) return [];
    return [{
      label,
      field,
      tone: toneMapConfig({ value: badge["tone"] })?.value ?? (
        badge["tone"] === "default" ||
        badge["tone"] === "muted" ||
        badge["tone"] === "success" ||
        badge["tone"] === "warning" ||
        badge["tone"] === "destructive" ||
        badge["tone"] === "info"
          ? badge["tone"]
          : undefined
      ),
      labelMap: stringMapConfig(badge["label_map"] ?? badge["labelMap"]),
      toneMap: toneMapConfig(badge["tone_map"] ?? badge["toneMap"]),
    }];
  });
  return badges.length > 0 ? badges : undefined;
}

function treeConfig(value: unknown): EntityPickerTreeConfig | undefined {
  const tree = asRecord(value);
  if (!tree) return undefined;
  const parentField = textConfig(
    tree["parent_field"]
      ?? tree["parentField"]
      ?? tree["field"]
      ?? tree["parent"],
  );
  if (!parentField) return undefined;
  return {
    enabled: boolConfig(tree["enabled"]) ?? true,
    defaultEnabled: boolConfig(
      tree["default_enabled"]
        ?? tree["defaultEnabled"]
        ?? tree["default"]
        ?? tree["initially_enabled"]
        ?? tree["initiallyEnabled"],
    ) ?? false,
    parentField,
    valueField: textConfig(tree["value_field"] ?? tree["valueField"]),
    levelField: textConfig(tree["level_field"] ?? tree["levelField"]),
    sortField: textConfig(tree["sort_field"] ?? tree["sortField"] ?? tree["order_field"] ?? tree["orderField"]),
    minRecords: positiveIntegerConfig(
      tree["min_records"]
        ?? tree["minRecords"]
        ?? tree["minimum_records"]
        ?? tree["minimumRecords"]
        ?? tree["page_size"]
        ?? tree["pageSize"],
    ),
  };
}

export function resolveEntityPickerOptionConfig(referenceConfig: unknown): EntityPickerOptionConfig | undefined {
  const config = asRecord(referenceConfig);
  if (!config) return undefined;
  const picker = asRecord(config["picker"]);

  return {
    labelField:       textConfig(picker?.["label_field"] ?? config["label_field"] ?? config["display_field"]),
    labelTemplate:    textConfig(picker?.["label_template"] ?? config["label_template"]),
    codeField:        textConfig(picker?.["code_field"] ?? config["code_field"]),
    descriptionField: textConfig(picker?.["description_field"] ?? config["description_field"]),
    recordIdField:    textConfig(
      picker?.["navigation_field"]
        ?? picker?.["record_id_field"]
        ?? config["navigation_field"]
        ?? config["record_id_field"],
    ),
    showCode:         boolConfig(picker?.["show_code"] ?? config["show_code"]),
    showDescription:  boolConfig(picker?.["show_description"] ?? config["show_description"]),
    showViewAction:   boolConfig(picker?.["show_view_action"] ?? config["show_view_action"]),
    variant:          variantConfig(picker?.["variant"] ?? picker?.["display"]),
    density:          densityConfig(picker?.["density"]),
    width:            widthConfig(picker?.["width"]),
    maxListHeight:    lengthConfig(picker?.["max_list_height"] ?? picker?.["maxListHeight"]),
    showKeyboardHints: boolConfig(picker?.["show_keyboard_hints"] ?? picker?.["showKeyboardHints"]),
    showRecentlyUsed: boolConfig(picker?.["show_recently_used"] ?? picker?.["showRecentlyUsed"]),
    recentLimit:      numberConfig(picker?.["recent_limit"] ?? picker?.["recentLimit"]),
    pageSize:         positiveIntegerConfig(
      picker?.["page_size"]
        ?? picker?.["pageSize"]
        ?? picker?.["result_limit"]
        ?? picker?.["resultLimit"]
        ?? picker?.["row_count"]
        ?? picker?.["rowCount"],
    ),
    defaultSearchMode: searchModeConfig(
      picker?.["default_search_mode"]
        ?? picker?.["defaultSearchMode"]
        ?? picker?.["search_mode"]
        ?? picker?.["searchMode"],
    ),
    optionActionLabel: textConfig(picker?.["option_action_label"] ?? picker?.["optionActionLabel"]),
    resultLabel:      textConfig(picker?.["result_label"] ?? picker?.["resultLabel"]),
    defaultControl:   textConfig(picker?.["default_control"] ?? picker?.["defaultControl"] ?? config["default_control"]),
    controls:         controlsConfig(picker?.["controls"]),
    sections:         sectionsConfig(picker?.["sections"]),
    badges:           badgesConfig(picker?.["badges"]),
    tree:             treeConfig(picker?.["tree"] ?? picker?.["hierarchy"] ?? config["tree"] ?? config["hierarchy"]),
  };
}

function rawValue(option: EntityPickerOption, field: string | undefined): unknown {
  if (!field) return undefined;
  if (field === "value") return option.value;
  if (field === "id") return option.raw?.["id"] ?? option.recordId ?? option.value;
  if (field === "label") return option.label;
  if (field === "code") return option.code;
  if (field === "description") return option.description;
  if (field === "recordId") return option.recordId;
  return option.raw?.[field];
}

function rawText(option: EntityPickerOption, field: string | undefined): string | undefined {
  const value = rawValue(option, field);
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  return undefined;
}

function matchesConfig(option: EntityPickerOption, field: string | undefined, matchValue: string | undefined): boolean {
  if (!field || !matchValue || matchValue === "all") return true;
  return rawText(option, field)?.toLowerCase() === matchValue.toLowerCase();
}

function matchesControlForDisplay(option: EntityPickerOption, control: EntityPickerControlConfig | null | undefined): boolean {
  const matchValue = controlFilterValue(control);
  if (!control?.field || !matchValue) return true;
  const value = rawText(option, control.field);
  return value ? value.toLowerCase() === matchValue.toLowerCase() : true;
}

function controlFilterValue(control: EntityPickerControlConfig | null | undefined): string | undefined {
  const value = control?.matchValue ?? control?.value;
  return value && value !== "all" ? value : undefined;
}

function searchParamsWithControl(
  base: Record<string, string> | undefined,
  control: EntityPickerControlConfig | null | undefined,
): Record<string, string> | undefined {
  const params: Record<string, string> = base ? { ...base } : {};
  const value = controlFilterValue(control);
  if (value) {
    if (control?.searchParam) {
      params[control.searchParam] = value;
    } else if (control?.field) {
      params[`filter.${control.field}`] = value;
    }
  }
  return Object.keys(params).length > 0 ? params : undefined;
}

function resolveAdvancedSection(
  option: EntityPickerOption,
  sections: EntityPickerSectionConfig[] | undefined,
): string | undefined {
  if (!sections || sections.length === 0) return undefined;
  const matched = sections.find((section) => (
    section.field && matchesConfig(option, section.field, section.matchValue ?? section.id)
  ));
  if (matched) return matched.id;
  return sections.find((section) => !section.field)?.id ?? "matches";
}

function resolveAdvancedBadges(
  option: EntityPickerOption,
  badges: EntityPickerBadgeConfig[] | undefined,
): AdvancedEntityChooserBadge[] | undefined {
  if (!badges || badges.length === 0) return undefined;
  const resolved = badges.flatMap((badge): AdvancedEntityChooserBadge[] => {
    const rawValue = badge.field ? rawText(option, badge.field) : badge.label;
    if (!rawValue) return [];
    return [{
      label: badge.labelMap?.[rawValue] ?? badge.label ?? rawValue,
      tone: badge.toneMap?.[rawValue] ?? badge.tone,
    }];
  });
  return resolved.length > 0 ? resolved : undefined;
}

function toAdvancedOption(
  option: EntityPickerOption,
  optionConfig: EntityPickerOptionConfig | undefined,
  getOptionHref?: (option: EntityPickerOption) => string | null | undefined,
  sectionOverride?: string,
): AdvancedEntityChooserOption {
  const tree = optionConfig?.tree?.enabled ? optionConfig.tree : undefined;
  const treeValue = rawText(option, tree?.valueField) ?? option.recordId ?? option.value;
  const treeLevelValue = rawValue(option, tree?.levelField);
  const treeSortValue = rawValue(option, tree?.sortField);
  return {
    value: option.value,
    label: option.label,
    code: option.code,
    description: option.description,
    href: getOptionHref?.(option) ?? undefined,
    disabled: false,
    section: sectionOverride ?? resolveAdvancedSection(option, optionConfig?.sections),
    badges: resolveAdvancedBadges(option, optionConfig?.badges),
    treeValue: tree ? treeValue : undefined,
    parentValue: tree ? rawText(option, tree.parentField) ?? null : undefined,
    treeLevel: typeof treeLevelValue === "number" ? treeLevelValue : (
      typeof treeLevelValue === "string" && treeLevelValue.trim() && Number.isFinite(Number(treeLevelValue))
        ? Number(treeLevelValue)
        : undefined
    ),
    treeSortValue: typeof treeSortValue === "number" || typeof treeSortValue === "string"
      ? treeSortValue
      : undefined,
  };
}

function normalizeSearchResponse(response: EntityPickerSearchResponse): EntityPickerSearchResult {
  return Array.isArray(response) ? { options: response } : response;
}

function appendUniqueOptions(
  current: EntityPickerOption[],
  next: EntityPickerOption[],
): EntityPickerOption[] {
  const seen = new Set(current.map((option) => option.value));
  return [
    ...current,
    ...next.filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    }),
  ];
}

function optionMatchesQuery(option: EntityPickerOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    option.value,
    option.label,
    option.code,
    option.description,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .some((value) => value.toLowerCase().includes(needle));
}

function recentLimitConfig(value: number | undefined): number {
  if (value === undefined) return 5;
  return Math.min(10, Math.max(0, Math.floor(value)));
}

function pageSizeConfig(value: number | undefined): number {
  if (value === undefined) return 20;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

function treeMinRecordsConfig(value: number | undefined): number {
  if (value === undefined) return 500;
  return Math.min(1000, Math.max(500, Math.floor(value)));
}

function rawRecordForRecent(raw: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const entries = Object.entries(raw).flatMap(([key, value]): Array<[string, unknown]> => {
    if (value === null || value === undefined) return [];
    if (typeof value === "string") return [[key, value.slice(0, 240)]];
    if (typeof value === "number" || typeof value === "boolean") return [[key, value]];
    return [];
  });
  return entries.length > 0 ? Object.fromEntries(entries.slice(0, 40)) : undefined;
}

function recentOptionPayload(option: EntityPickerOption): EntityPickerOption {
  return {
    value:       option.value,
    label:       option.label,
    code:        option.code,
    description: option.description,
    recordId:    option.recordId ?? textConfig(option.raw?.["id"]),
    raw:         rawRecordForRecent(option.raw),
  };
}

function defaultResultLabel(entityCode: string | null | undefined): string {
  return entityCode ? entityCode.replace(/[-_]/g, " ") : "records";
}

export interface EntityPickerProps {
  value?: string | null;
  /** Resolved display label for the current value (resolved by caller). */
  displayLabel?: string | null;
  onChange?: (value: string | null) => void;
  onOptionSelect?: (option: EntityPickerOption | null) => void;

  // ── Mode A: standard relay-backed search ──────────────────────────────────
  entityCode?: string | null;
  /** Extra query params appended to every search request (Mode A only). */
  searchParams?: Record<string, string>;
  /** Metadata-driven mapping for labels, code/description subtitles, and action visibility. */
  optionConfig?: EntityPickerOptionConfig;

  // ── Mode B: custom search override ───────────────────────────────────────
  /** Custom async search. When provided, entityCode/searchParams are ignored. */
  search?: (query: string, context?: EntityPickerSearchContext) => Promise<EntityPickerSearchResponse>;

  /** Load options immediately on open without waiting for user input. */
  loadOnOpen?: boolean;
  /** Optional per-option action link. Standard entity mode supplies one automatically. */
  getOptionHref?: (option: EntityPickerOption) => string | null | undefined;
  optionActionLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

// ── Component ──────────────────────────────────────────────────────────────────

export const EntityPicker = forwardRef<HTMLDivElement, EntityPickerProps>(
  (
    {
      value,
      displayLabel,
      onChange,
      onOptionSelect,
      entityCode,
      searchParams,
      optionConfig,
      search,
      loadOnOpen = false,
      getOptionHref,
      optionActionLabel,
      placeholder = "Search records…",
      disabled,
      clearable = true,
      error,
      className,
      id,
    },
    ref,
  ) => {
    const isCustomMode = typeof search === "function";
    const pageIncrement = pageSizeConfig(optionConfig?.pageSize);
    const treeSupported = !!optionConfig?.tree?.enabled && !!optionConfig.tree.parentField;
    const treeMinRecords = treeSupported ? treeMinRecordsConfig(optionConfig?.tree?.minRecords) : pageIncrement;
    const [treeEnabled, setTreeEnabled] = useState<boolean>(
      () => treeSupported && optionConfig?.tree?.defaultEnabled === true,
    );
    useEffect(() => {
      setTreeEnabled(treeSupported && optionConfig?.tree?.defaultEnabled === true);
    }, [optionConfig?.tree?.defaultEnabled, optionConfig?.tree?.parentField, treeSupported]);
    const activeTreeEnabled = treeSupported && treeEnabled;
    const resultLimit = activeTreeEnabled ? Math.max(pageIncrement, treeMinRecords) : pageIncrement;
    const [activeControlValue, setActiveControlValue] = useState<string | null>(
      optionConfig?.defaultControl ?? optionConfig?.controls?.[0]?.value ?? null,
    );
    const [advancedQuery, setAdvancedQuery] = useState("");
    const [controlSearchRevision, setControlSearchRevision] = useState(0);
    const lastControlSearchRevisionRef = useRef(0);
    const activeControl = useMemo(
      () => optionConfig?.controls?.find((control) => control.value === activeControlValue) ?? null,
      [activeControlValue, optionConfig?.controls],
    );
    const activeSearchParams = useMemo(() => {
      const params = searchParamsWithControl(searchParams, activeControl) ?? {};
      if (activeTreeEnabled) params.picker_tree = "1";
      return Object.keys(params).length > 0 ? params : undefined;
    }, [activeControl, activeTreeEnabled, searchParams]);
    const activeSearchContext = useMemo<EntityPickerSearchContext>(
      () => ({
        activeControl,
        searchParams: activeSearchParams,
        limit: resultLimit,
        pageSize: resultLimit,
        treeEnabled: activeTreeEnabled,
      }),
      [activeControl, activeSearchParams, activeTreeEnabled, resultLimit],
    );
    const recentLimit = recentLimitConfig(optionConfig?.recentLimit);
    const recentEnabled = optionConfig?.variant === "advanced"
      && optionConfig.showRecentlyUsed !== false
      && !!entityCode
      && recentLimit > 0;
    const [recentOptions, setRecentOptions] = useState<EntityPickerOption[]>([]);
    const recentAbortRef = useRef<AbortController | null>(null);

    const loadRecentOptions = useCallback(async () => {
      if (!recentEnabled || !entityCode) {
        setRecentOptions([]);
        return;
      }

      recentAbortRef.current?.abort();
      const controller = new AbortController();
      recentAbortRef.current = controller;

      try {
        const params = new URLSearchParams({ limit: String(recentLimit) });
        const res = await fetch(
          `/api/relay/api/activity/recent-picker/${encodeURIComponent(entityCode)}?${params}`,
          { signal: controller.signal },
        );
        if (!res.ok) return;
        const body = await res.json() as { data?: EntityPickerOption[] };
        if (!controller.signal.aborted) {
          setRecentOptions((body.data ?? []).slice(0, recentLimit));
        }
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          setRecentOptions([]);
        }
      }
    }, [entityCode, recentEnabled, recentLimit]);

    useEffect(() => {
      if (!recentEnabled) setRecentOptions([]);
    }, [recentEnabled]);

    // ── Standard mode (entityCode) ─────────────────────────────────────────
    const {
      options: relayOptions,
      totalCount: relayTotalCount,
      loading: relayLoading,
      onQueryChange: relayQueryChange,
      onOpen: relayOnOpen,
      runSearch: relayRunSearch,
    } = useEntitySearch({
      entityCode: isCustomMode ? null : (entityCode ?? null),
      searchParams: activeSearchParams,
      optionConfig,
      limit: resultLimit,
    });

    // ── Custom mode (search callback) ──────────────────────────────────────
    const [customOptions, setCustomOptions] = useState<EntityPickerOption[]>([]);
    const [customTotalCount, setCustomTotalCount] = useState<number | undefined>(undefined);
    const [customLoading, setCustomLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const abortRef = useRef<AbortController | null>(null);

    const runCustomSearch = useCallback(
      (query: string, immediate = false, contextOverride?: EntityPickerSearchContext, append = false) => {
        if (!search) return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setCustomLoading(true);
        const delay = immediate ? 0 : 300;
        debounceRef.current = setTimeout(async () => {
          abortRef.current?.abort();
          const controller = new AbortController();
          abortRef.current = controller;
          try {
            const result = normalizeSearchResponse(await search(query, contextOverride ?? activeSearchContext));
            if (!controller.signal.aborted) {
              setCustomOptions((current) => append ? appendUniqueOptions(current, result.options) : result.options);
              setCustomTotalCount(result.totalCount);
            }
          } catch (err) {
            if (!(err instanceof DOMException && err.name === "AbortError")) {
              setCustomOptions([]);
              setCustomTotalCount(undefined);
            }
          } finally {
            if (!controller.signal.aborted) setCustomLoading(false);
          }
        }, delay);
      },
      [activeSearchContext, search],
    );

    const customQueryChange = useCallback(
      (query: string) => {
        if (!query && optionConfig?.variant !== "advanced") {
          setCustomOptions([]);
          setCustomTotalCount(undefined);
          setCustomLoading(false);
          return;
        }
        runCustomSearch(query);
      },
      [optionConfig?.variant, runCustomSearch],
    );

    const customOnOpen = useCallback(
      () => runCustomSearch("", true),
      [runCustomSearch],
    );

    // ── Unified handlers ───────────────────────────────────────────────────
    const options = isCustomMode ? customOptions : relayOptions;
    const totalCount = isCustomMode ? customTotalCount : relayTotalCount;
    const loading = isCustomMode ? customLoading : relayLoading;
    const modeQueryChange = isCustomMode ? customQueryChange : relayQueryChange;
    const handleOpen = useCallback(() => {
      if (recentEnabled) void loadRecentOptions();
      if (isCustomMode) customOnOpen();
      else relayOnOpen();
    }, [customOnOpen, isCustomMode, loadRecentOptions, recentEnabled, relayOnOpen]);
    const rememberRecentOption = useCallback(
      (selectedValue: string): EntityPickerOption | null => {
        const selected = options.find((option) => option.value === selectedValue)
          ?? recentOptions.find((option) => option.value === selectedValue)
          ?? null;
        if (!selected || !recentEnabled || !entityCode) return selected;

        const payload = recentOptionPayload(selected);
        setRecentOptions((current) => appendUniqueOptions([payload], current).slice(0, recentLimit));
        void fetch(`/api/relay/api/activity/recent-picker/${encodeURIComponent(entityCode)}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
          body:    JSON.stringify({ option: payload }),
        }).catch(() => undefined);

        return selected;
      },
      [entityCode, options, recentEnabled, recentLimit, recentOptions],
    );
    const handleValueChange = useCallback(
      (next: string | null) => {
        const selected = next ? rememberRecentOption(next) : null;
        onOptionSelect?.(selected);
        onChange?.(next);
      },
      [onChange, onOptionSelect, rememberRecentOption],
    );
    const handleQueryChange = useCallback(
      (query: string) => {
        if (optionConfig?.variant === "advanced") setAdvancedQuery(query);
        if (!query && optionConfig?.variant === "advanced" && !isCustomMode) {
          relayRunSearch(query);
          return;
        }
        modeQueryChange(query);
      },
      [isCustomMode, modeQueryChange, optionConfig?.variant, relayRunSearch],
    );
    const handleAdvancedControlChange = useCallback(
      (control: AdvancedEntityChooserControl, query: string) => {
        setAdvancedQuery(query);
        setActiveControlValue(control.value);
        setControlSearchRevision((revision) => revision + 1);
      },
      [],
    );
    const handleTreeEnabledChange = useCallback((enabled: boolean) => {
      if (!treeSupported) return;
      setTreeEnabled(enabled);
      setControlSearchRevision((revision) => revision + 1);
    }, [treeSupported]);
    const handleLoadMore = useCallback(() => {
      const nextPage = Math.floor(options.length / resultLimit) + 1;
      const nextContext: EntityPickerSearchContext = {
        ...activeSearchContext,
        limit: resultLimit,
        pageSize: resultLimit,
        page: nextPage,
      };
      if (isCustomMode) {
        runCustomSearch(advancedQuery, true, nextContext, true);
      } else {
        relayRunSearch(advancedQuery, true, resultLimit, nextPage, true);
      }
    }, [
      activeSearchContext,
      advancedQuery,
      isCustomMode,
      options.length,
      relayRunSearch,
      resultLimit,
      runCustomSearch,
    ]);
    useEffect(() => {
      if (controlSearchRevision === 0 || optionConfig?.variant !== "advanced") return;
      if (lastControlSearchRevisionRef.current === controlSearchRevision) return;
      lastControlSearchRevisionRef.current = controlSearchRevision;
      if (isCustomMode) {
        runCustomSearch(advancedQuery, true);
      } else {
        relayRunSearch(advancedQuery, true);
      }
    }, [
      advancedQuery,
      controlSearchRevision,
      isCustomMode,
      optionConfig?.variant,
      relayRunSearch,
      runCustomSearch,
    ]);
    const defaultOptionHref = !isCustomMode && entityCode && optionConfig?.showViewAction !== false
      ? (option: EntityPickerOption) => {
          const recordId = option.recordId ?? option.value;
          return `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`;
        }
      : undefined;
    const recentAdvancedOptions = useMemo(
      () => activeTreeEnabled ? [] : recentOptions
        .filter((option) => matchesControlForDisplay(option, activeControl))
        .filter((option) => optionMatchesQuery(option, advancedQuery))
        .map((option) => toAdvancedOption(option, optionConfig, getOptionHref ?? defaultOptionHref, "recent")),
      [
        activeControl,
        activeTreeEnabled,
        advancedQuery,
        defaultOptionHref,
        getOptionHref,
        optionConfig,
        recentOptions,
      ],
    );
    const advancedOptions = useMemo(() => {
      const recentValues = new Set(recentAdvancedOptions.map((option) => option.value));
      return [
        ...recentAdvancedOptions,
        ...options
          .filter((option) => !recentValues.has(option.value))
          .filter((option) => matchesControlForDisplay(option, activeControl))
          .map((option) => toAdvancedOption(option, optionConfig, getOptionHref ?? defaultOptionHref)),
      ];
    }, [
      activeControl,
      defaultOptionHref,
      getOptionHref,
      optionConfig,
      options,
      recentAdvancedOptions,
    ]);
    const hasMoreAdvancedResults = typeof totalCount === "number" && options.length < totalCount;
    const advancedResultLabel = optionConfig?.resultLabel ?? defaultResultLabel(entityCode);
    const advancedSections = useMemo<AdvancedEntityChooserSection[] | undefined>(() => {
      const baseSections = optionConfig?.sections?.length
        ? optionConfig.sections
        : [{ id: "matches", label: "All matches" }];
      if (recentAdvancedOptions.length === 0) return baseSections;
      return [
        { id: "recent", label: "Recently used" },
        ...baseSections.filter((section) => section.id !== "recent"),
      ];
    }, [optionConfig?.sections, recentAdvancedOptions.length]);
    const advancedMeta = useMemo<AdvancedEntityChooserMetaConfig | undefined>(() => {
      if (optionConfig?.variant !== "advanced") return undefined;
      return {
        density: optionConfig.density ?? "compact",
        width: optionConfig.width,
        maxListHeight: optionConfig.maxListHeight,
        placeholder,
        controls: optionConfig.controls,
        sections: advancedSections,
        tree: treeSupported ? {
          enabled: true,
          parentField: optionConfig.tree?.parentField,
          valueField: optionConfig.tree?.valueField,
          levelField: optionConfig.tree?.levelField,
          sortField: optionConfig.tree?.sortField,
          minRecords: treeMinRecords,
        } : undefined,
        showKeyboardHints: optionConfig.showKeyboardHints,
      };
    }, [advancedSections, optionConfig, placeholder, treeMinRecords, treeSupported]);

    if (optionConfig?.variant === "advanced") {
      return (
        <AdvancedEntityCombobox
          ref={ref}
          id={id}
          value={value}
          displayLabel={displayLabel}
          onChange={handleValueChange}
          options={advancedOptions}
          loading={loading}
          onQueryChange={handleQueryChange}
          onOpen={loadOnOpen ? handleOpen : undefined}
          placeholder={placeholder}
          disabled={disabled}
          clearable={clearable}
          error={error}
          className={className}
          meta={advancedMeta}
          optionActionLabel={optionActionLabel ?? optionConfig.optionActionLabel ?? "View record"}
          loadedCount={options.length}
          totalCount={totalCount}
          resultLabel={advancedResultLabel}
          onLoadMore={hasMoreAdvancedResults ? handleLoadMore : undefined}
          loadMoreLoading={loading}
          treeEnabled={activeTreeEnabled}
          onTreeEnabledChange={treeSupported ? handleTreeEnabledChange : undefined}
          defaultSearchMode={optionConfig?.defaultSearchMode ?? "server"}
          activeControlValue={activeControlValue}
          onControlChange={handleAdvancedControlChange}
          storageKey={entityCode ?? undefined}
        />
      );
    }

    return (
      <AsyncCombobox
        ref={ref}
        id={id}
        value={value}
        displayLabel={displayLabel}
        onChange={handleValueChange}
        options={options}
        loading={loading}
        onQueryChange={handleQueryChange}
        onOpen={loadOnOpen ? handleOpen : undefined}
        getOptionHref={getOptionHref ?? defaultOptionHref}
        optionActionLabel={optionActionLabel ?? optionConfig?.optionActionLabel ?? "View record"}
        placeholder={placeholder}
        disabled={disabled}
        clearable={clearable}
        error={error}
        className={className}
      />
    );
  },
);

EntityPicker.displayName = "EntityPicker";
