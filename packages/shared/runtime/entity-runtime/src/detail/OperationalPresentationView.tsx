"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  MoreHorizontal,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@athyper/ui/primitives";
import { FilterPillBar } from "@athyper/ui/composites";
import type { EntityField } from "@athyper/api-contracts/metadata";
import type { MasterTab, SummaryCardsConfig } from "@athyper/metadata-client/compiled-reader";
import { useCompiledEntity } from "@athyper/query";
import { titleCase } from "@athyper/runtime-shared/core";
import {
  entityRowToPickerOption,
  resolveEntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import { resolveRuntimeStatusColors, runtimeStatusBarClass } from "../list/listPresentation";

type ChildRecord = Record<string, unknown>;
type OperationalPresentationName = Exclude<NonNullable<SummaryCardsConfig["presentation"]>, "cards">;
type PresentationSettings = Record<string, unknown>;
type ReferenceValueVariant = "label" | "code" | "code-label";

interface PresentationFieldSpec {
  field: string;
  label: string;
  kind?: string;
  helperFields: string[];
  badgeFields: string[];
  meterField?: string;
}

export interface OperationalPresentationProps {
  records:       ChildRecord[];
  tab:           MasterTab;
  config:        SummaryCardsConfig;
  canAdd:        boolean;
  canEdit:       boolean;
  onAdd:         () => void;
  onView:        (rec: ChildRecord) => void;
  onEdit:        (rec: ChildRecord) => void;
  onDelete:      (rec: ChildRecord) => void;
  onMarkPrimary: (rec: ChildRecord) => void;
}

const OPERATIONAL_PRESENTATIONS = new Set<OperationalPresentationName>([
  "scorecard",
  "timeline",
  "profile_cards",
  "policy_matrix",
  "ability_cards",
  "temporal_rules",
]);

const OP_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const OP_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const OP_FIELD_HELPER_CLASS = "text-sm text-muted-foreground";
const OP_ITEM_TITLE_CLASS = "text-sm font-semibold leading-snug text-foreground";
const OP_KPI_VALUE_CLASS = "text-xl font-semibold leading-none text-foreground";

const DisplayMetadataContext = createContext<{
  entityCode: string;
  fieldMap: Map<string, EntityField>;
  settings: PresentationSettings;
}>({
  entityCode: "",
  fieldMap: new Map<string, EntityField>(),
  settings: {},
});

export function supportsOperationalPresentation(
  value: SummaryCardsConfig["presentation"],
): value is OperationalPresentationName {
  return Boolean(value && OPERATIONAL_PRESENTATIONS.has(value as OperationalPresentationName));
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function presentationSettings(config: SummaryCardsConfig): PresentationSettings {
  return asPlainRecord(config.presentation_config) ?? {};
}

function stringSetting(settings: PresentationSettings, key: string, fallback = ""): string {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function stringArraySetting(settings: PresentationSettings, key: string, fallback: string[] = []): string[] {
  const value = settings[key];
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function referenceConfigForField(settings: PresentationSettings, field: string): Record<string, unknown> | null {
  const references =
    asPlainRecord(settings.references) ??
    asPlainRecord(settings.reference_fields) ??
    asPlainRecord(settings.reference_config);
  const raw = references?.[field];
  if (typeof raw === "string" && raw.trim()) return { target_entity: raw };
  return asPlainRecord(raw);
}

function labelsSetting(settings: PresentationSettings): Record<string, string> {
  const raw = asPlainRecord(settings.labels);
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function labelForField(settings: PresentationSettings, field: string, fallback?: string): string {
  return labelsSetting(settings)[field] ?? fallback ?? titleCase(field.replace(/_id$/, ""));
}

function normalizeFieldSpec(value: unknown, settings: PresentationSettings): PresentationFieldSpec | null {
  if (typeof value === "string" && value.trim()) {
    return {
      field: value,
      label: labelForField(settings, value),
      helperFields: [],
      badgeFields: [],
    };
  }

  const rec = asPlainRecord(value);
  if (!rec) return null;
  const field = typeof rec.field === "string" ? rec.field : "";
  if (!field) return null;

  return {
    field,
    label: typeof rec.label === "string" ? rec.label : labelForField(settings, field),
    kind: typeof rec.kind === "string" ? rec.kind : undefined,
    helperFields: Array.isArray(rec.helper_fields)
      ? rec.helper_fields.filter((item): item is string => typeof item === "string")
      : [],
    badgeFields: Array.isArray(rec.badge_fields)
      ? rec.badge_fields.filter((item): item is string => typeof item === "string")
      : [],
    meterField: typeof rec.meter_field === "string" ? rec.meter_field : undefined,
  };
}

function fieldSpecs(
  settings: PresentationSettings,
  key: string,
  fallbackFields: string[] = [],
): PresentationFieldSpec[] {
  const raw = settings[key];
  const specs = Array.isArray(raw)
    ? raw.map((item) => normalizeFieldSpec(item, settings)).filter((item): item is PresentationFieldSpec => item !== null)
    : [];

  if (specs.length > 0) return specs;
  return fallbackFields.map((field) => ({
    field,
    label: labelForField(settings, field),
    helperFields: [],
    badgeFields: [],
  }));
}

function formatDate(val: unknown): string {
  if (!val) return "-";
  const date = new Date(String(val));
  if (Number.isNaN(date.getTime())) return String(val);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateMs(val: unknown): number | null {
  if (!val) return null;
  const ms = new Date(String(val)).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function maskIfNumeric(str: string): string {
  if (str.length > 8 && /^\d+$/.test(str.replace(/[\s-]/g, ""))) {
    return "****" + str.slice(-4);
  }
  return str;
}

function humanizeIfCode(str: string): string {
  if (/^[a-z][a-z0-9_-]*$/.test(str)) {
    return str.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return str;
}

function preferredDisplayValue(rec: ChildRecord, field: string): unknown {
  return rec[field];
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getReferenceEntityCode(field: EntityField | undefined, overrideConfig: Record<string, unknown> | null): string | null {
  const referenceConfig = overrideConfig ?? field?.reference_config ?? null;
  if (referenceConfig && typeof referenceConfig.target_entity === "string" && referenceConfig.target_entity.trim()) {
    return referenceConfig.target_entity;
  }
  const validation = field?.validation_rules;
  if (validation && typeof validation.ref_entity === "string" && validation.ref_entity.trim()) {
    return validation.ref_entity;
  }
  return null;
}

function referenceOptionConfig(field: EntityField | undefined, overrideConfig: Record<string, unknown> | null) {
  return resolveEntityPickerOptionConfig(overrideConfig ?? field?.reference_config);
}

function referenceTextFromRecord(
  row: Record<string, unknown>,
  entityCode: string,
  optionConfig: ReturnType<typeof resolveEntityPickerOptionConfig>,
  variant: ReferenceValueVariant,
): string | null {
  const option = entityRowToPickerOption(row, entityCode, optionConfig);
  if (variant === "code") return option.code ?? option.label ?? null;
  if (variant === "code-label") {
    if (option.code && option.label && option.code !== option.label) return `${option.code} - ${option.label}`;
    return option.label || option.code || null;
  }
  return option.label || option.code || null;
}

function formatOperationalValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return formatDate(raw);
  if (isUuidLike(raw)) return `${raw.slice(0, 8)}...`;
  return humanizeIfCode(maskIfNumeric(raw));
}

function displayFieldValue(rec: ChildRecord, field: string): string {
  return formatOperationalValue(preferredDisplayValue(rec, field));
}

function roleAppHref(rec: ChildRecord, settings: PresentationSettings): string | null {
  const entityField = stringSetting(settings, "link_entity_field", "");
  const recordField = stringSetting(settings, "link_record_field", "");
  const entityCode = entityField && typeof rec[entityField] === "string" ? rec[entityField].trim() : "";
  const recordId = recordField && typeof rec[recordField] === "string" ? rec[recordField].trim() : "";
  if (!entityCode || !recordId) return null;
  return `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`;
}

export function OperationalFieldLabel({
  field,
  fallback,
}: {
  field: string;
  fallback?: string;
}) {
  const context = useContext(DisplayMetadataContext);
  const fieldMeta = context.fieldMap.get(field);
  return <>{labelForField(context.settings, field, fieldMeta?.label ?? fallback)}</>;
}

export function OperationalFieldValue({
  rec,
  field,
  value,
  entityCode,
  config,
  variant = "label",
  className,
}: {
  rec?: ChildRecord;
  field: string;
  value?: unknown;
  entityCode?: string;
  config?: SummaryCardsConfig;
  variant?: ReferenceValueVariant;
  className?: string;
}) {
  const context = useContext(DisplayMetadataContext);
  const effectiveEntityCode = entityCode ?? context.entityCode;
  const settings = config ? presentationSettings(config) : context.settings;
  const contextField = context.entityCode === effectiveEntityCode ? context.fieldMap.get(field) : undefined;
  const fieldMeta = contextField;
  const overrideConfig = referenceConfigForField(settings, field);
  const refEntityCode = getReferenceEntityCode(fieldMeta, overrideConfig);
  const rawValue = value ?? (rec ? preferredDisplayValue(rec, field) : undefined);
  const uuid = typeof rawValue === "string" && isUuidLike(rawValue) ? rawValue : null;
  const optionConfig = referenceOptionConfig(fieldMeta, overrideConfig);

  const { data: refRecord, isLoading } = useQuery<{ data: Record<string, unknown> } | null>({
    queryKey: ["operational-ref", refEntityCode ?? "", uuid ?? "", variant],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(refEntityCode!)}/${encodeURIComponent(uuid!)}`,
        { signal },
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ data: Record<string, unknown> }>;
    },
    enabled: !!refEntityCode && !!uuid,
    staleTime: 5 * 60 * 1000,
  });

  const resolvedLabel = refRecord?.data
    ? referenceTextFromRecord(refRecord.data, refEntityCode ?? "", optionConfig, variant)
    : null;

  if (resolvedLabel) {
    return <span className={className}>{resolvedLabel}</span>;
  }

  if (uuid && refEntityCode) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)} title={uuid}>
        {isLoading ? "Loading..." : `${uuid.slice(0, 8)}...`}
      </span>
    );
  }

  return <span className={className}>{formatOperationalValue(rawValue)}</span>;
}

export function OperationalDisplayMetadataProvider({
  entityCode,
  config,
  children,
}: {
  entityCode: string;
  config: SummaryCardsConfig;
  children: ReactNode;
}) {
  const { data: entity } = useCompiledEntity(entityCode);
  const settings = useMemo(() => presentationSettings(config), [config]);
  const fieldMap = useMemo(() => {
    const map = new Map<string, EntityField>();
    for (const field of entity?.fields ?? []) {
      map.set(field.name, field);
    }
    return map;
  }, [entity]);

  return (
    <DisplayMetadataContext.Provider value={{ entityCode, fieldMap, settings }}>
      {children}
    </DisplayMetadataContext.Provider>
  );
}

function hasFieldValue(rec: ChildRecord, field: string): boolean {
  const value = preferredDisplayValue(rec, field);
  return value !== null && value !== undefined && value !== "";
}

function numericFieldValue(rec: ChildRecord, field: string): number | null {
  const raw = rec[field];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function percentFieldValue(rec: ChildRecord, field: string): number | null {
  const value = numericFieldValue(rec, field);
  if (value === null) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function statusColorValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "active" : "inactive";
  const normalized = String(value ?? "").trim();
  return normalized || "unknown";
}

function statusLabelForValue(value: unknown, fallback?: string): string {
  if (fallback && fallback !== "-") return fallback;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return humanizeIfCode(String(value ?? "Unknown"));
}

function StatusPill({ value, label }: { value: unknown; label?: string }) {
  const { settings } = useContext(DisplayMetadataContext);
  const resolverName = stringSetting(settings, "status_resolver", "") || undefined;
  const colors = resolveRuntimeStatusColors(statusColorValue(value), resolverName);
  return (
    <span className={cn("inline-flex h-5 items-center rounded-full border px-2 text-doc-badge font-medium leading-none", colors.subtleBadge)}>
      {statusLabelForValue(value, label)}
    </span>
  );
}

function statusBarClass(value: unknown, resolverName?: string): string {
  return runtimeStatusBarClass(statusColorValue(value), resolverName);
}

function activeLike(rec: ChildRecord, statusField: string, blockedField?: string): boolean {
  if (blockedField && rec[blockedField] === true) return false;
  if (!statusField) return false;
  const status = String(rec[statusField] ?? "").toLowerCase();
  return status === "" || ["active", "approved", "live", "current", "effective"].includes(status);
}

function blockedLike(rec: ChildRecord, statusField: string, blockedField?: string): boolean {
  if (blockedField && rec[blockedField] === true) return true;
  if (!statusField) return false;
  const status = String(rec[statusField] ?? "").toLowerCase();
  return status.includes("block") || status === "rejected" || status === "failed";
}

function recordRangeLabel(rec: ChildRecord, startField: string, endField: string): string {
  const start = displayFieldValue(rec, startField);
  const endRaw = rec[endField];
  const end = endRaw === null || endRaw === undefined || endRaw === "" ? "open ended" : displayFieldValue(rec, endField);
  return `${start} -> ${end}`;
}

function uniqueFieldValues(records: ChildRecord[], field: string): string[] {
  if (!field) return [];
  return [...new Set(records
    .map((rec) => rec[field])
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(String))]
    .sort((a, b) => a.localeCompare(b));
}

function ActionMenu({
  onEdit,
  onMarkPrimary,
  onDelete,
}: {
  onEdit?:        () => void;
  onMarkPrimary?: () => void;
  onDelete?:      () => void;
}) {
  if (!onEdit && !onMarkPrimary && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label="Record actions"
      >
        <MoreHorizontal className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {onEdit && (
          <DropdownMenuItem onSelect={onEdit}>
            <Edit2 className="mr-2 size-3.5" /> Edit
          </DropdownMenuItem>
        )}
        {onMarkPrimary && (
          <DropdownMenuItem onSelect={onMarkPrimary}>
            <Star className="mr-2 size-3.5" /> Mark as primary
          </DropdownMenuItem>
        )}
        {(onEdit || onMarkPrimary) && onDelete && <DropdownMenuSeparator />}
        {onDelete && (
          <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 size-3.5" /> Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function primaryAction(settings: PresentationSettings, rec: ChildRecord, canEdit: boolean, onMarkPrimary: (rec: ChildRecord) => void) {
  const primaryField = stringSetting(settings, "primary_field", "");
  return primaryField && rec[primaryField] !== true && canEdit
    ? () => onMarkPrimary(rec)
    : undefined;
}

function AddTile({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <Plus className="mb-2 size-5" />
      <span>{label}</span>
    </button>
  );
}

function ScorecardTile({ rec, spec }: { rec: ChildRecord; spec: PresentationFieldSpec }) {
  const meterField = spec.meterField ?? (spec.field.endsWith("_pct") ? spec.field : "");
  const pct = meterField ? percentFieldValue(rec, meterField) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={OP_FIELD_LABEL_CLASS}>{spec.label}</p>
          <p className={cn("mt-1 truncate", OP_FIELD_VALUE_CLASS)}>
            <OperationalFieldValue rec={rec} field={spec.field} />
          </p>
        </div>
        {pct !== null && (
          <div className="shrink-0 rounded-full border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground">
            {pct}%
          </div>
        )}
      </div>
      {pct !== null && (
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}
      {spec.badgeFields.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {spec.badgeFields.filter((field) => hasFieldValue(rec, field)).map((field) => (
            <StatusPill key={field} value={preferredDisplayValue(rec, field)} />
          ))}
        </div>
      )}
      {spec.helperFields.length > 0 && (
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {spec.helperFields.filter((field) => hasFieldValue(rec, field)).map((field) => (
            <p key={field} className="truncate">
              {labelForField({}, field)}: <OperationalFieldValue rec={rec} field={field} className="text-foreground" />
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ rec, spec }: { rec: ChildRecord; spec: PresentationFieldSpec }) {
  const pct = percentFieldValue(rec, spec.field);
  if (pct === null) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{spec.label}</span>
        <span className="font-medium text-foreground">{pct}/100</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScorecardPresentation(props: OperationalPresentationProps) {
  const { records, config, canEdit, onView, onEdit, onDelete, onMarkPrimary } = props;
  const settings = presentationSettings(config);
  const rec = records[0];
  if (!rec) return null;

  const tileFallback = [config.title, ...(config.facts ?? [])].filter(Boolean).slice(0, 4);
  const tiles = fieldSpecs(settings, "tiles", tileFallback);
  const scoreFields = fieldSpecs(settings, "score_fields");
  const statFields = fieldSpecs(settings, "stat_fields");
  const reviewFields = fieldSpecs(settings, "review_fields");

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onView(rec)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(rec); } }}
        className="group rounded-lg border border-border bg-card p-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {records.length} record{records.length !== 1 ? "s" : ""}
          </p>
          <div onClick={(e) => e.stopPropagation()}>
            <ActionMenu
              onEdit={canEdit ? () => onEdit(rec) : undefined}
              onDelete={canEdit ? () => onDelete(rec) : undefined}
              onMarkPrimary={primaryAction(settings, rec, canEdit, onMarkPrimary)}
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {tiles.map((spec) => <ScorecardTile key={spec.field} rec={rec} spec={spec} />)}
        </div>
      </div>

      {(scoreFields.length > 0 || statFields.length > 0 || reviewFields.length > 0) && (
        <div className="grid gap-3 xl:grid-cols-[1.3fr_1fr]">
          {scoreFields.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4">
              <h4 className={cn("mb-4", OP_ITEM_TITLE_CLASS)}>
                {stringSetting(settings, "score_title", "Performance")}
              </h4>
              <div className="grid gap-4 md:grid-cols-3">
                {scoreFields.map((spec) => <ScoreBar key={spec.field} rec={rec} spec={spec} />)}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {statFields.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-3">
                {statFields.map((spec) => (
                  <div key={spec.field} className="rounded-lg border border-border bg-card p-4">
                    <p className={OP_KPI_VALUE_CLASS}>
                      <OperationalFieldValue rec={rec} field={spec.field} />
                    </p>
                    <p className={cn("mt-1", OP_FIELD_LABEL_CLASS)}>{spec.label}</p>
                  </div>
                ))}
              </div>
            )}
            {reviewFields.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="grid gap-2 text-sm">
                  {reviewFields.map((spec) => (
                    <div key={spec.field} className="flex items-center justify-between gap-4">
                      <span className="text-muted-foreground">{spec.label}</span>
                      {typeof rec[spec.field] === "boolean" ? (
                        <StatusPill value={rec[spec.field]} label={displayFieldValue(rec, spec.field)} />
                      ) : (
                        <OperationalFieldValue rec={rec} field={spec.field} className="text-right font-medium text-foreground" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelinePresentation(props: OperationalPresentationProps) {
  const { records, tab, config, canAdd, canEdit, onAdd, onView, onEdit, onDelete, onMarkPrimary } = props;
  const settings = presentationSettings(config);
  const titleField = stringSetting(settings, "title_field", config.title);
  const descriptionField = stringSetting(settings, "description_field", config.facts?.[0] ?? "");
  const startField = stringSetting(settings, "start_field", "");
  const endField = stringSetting(settings, "end_field", "");
  const activeField = stringSetting(settings, "active_field", "");
  const statusField = stringSetting(settings, "status_field", "");
  const activeRecords = records.filter((rec) => {
    if (activeField) return rec[activeField] === true;
    if (endField && hasFieldValue(rec, endField)) return false;
    return activeLike(rec, statusField);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {records.length} record{records.length !== 1 ? "s" : ""} - {activeRecords.length} active
        </p>
        {canAdd && (
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={onAdd}>
            <Plus className="size-3 shrink-0" />
            {tab.add_label ?? "Add"}
          </Button>
        )}
      </div>

      {activeRecords.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <AlertCircle className="size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className={cn("truncate", OP_ITEM_TITLE_CLASS)}>
                {activeRecords.length} active {activeRecords.length === 1 ? "record" : "records"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                <OperationalFieldValue rec={activeRecords[0]!} field={titleField} />
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => onView(activeRecords[0]!)}>
            {stringSetting(settings, "active_action_label", "Review")}
          </Button>
        </div>
      )}

      <div className="relative space-y-3 pl-5 before:absolute before:left-2 before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-border">
        {records.map((rec) => {
          const isActive = activeRecords.includes(rec);
          return (
            <div key={String(rec.id ?? `${displayFieldValue(rec, titleField)}-${displayFieldValue(rec, startField)}`)} className="relative">
              <span className={cn(
                "absolute -left-[17px] top-4 size-2.5 rounded-full ring-4 ring-background",
                isActive ? "bg-destructive" : "bg-success",
              )} />
              <div
                role="button"
                tabIndex={0}
                onClick={() => onView(rec)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(rec); } }}
                className={cn(
                  "group rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  isActive ? "border-l-2 border-l-destructive" : "border-border",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-foreground">
                        <OperationalFieldValue rec={rec} field={titleField} />
                      </p>
                      <StatusPill value={isActive ? "active" : rec[statusField]} label={isActive ? "active" : displayFieldValue(rec, statusField)} />
                    </div>
                    {descriptionField && hasFieldValue(rec, descriptionField) && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        <OperationalFieldValue rec={rec} field={descriptionField} />
                      </p>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">
                      {endField ? recordRangeLabel(rec, startField, endField) : displayFieldValue(rec, startField)}
                    </p>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      onEdit={canEdit ? () => onEdit(rec) : undefined}
                      onDelete={canEdit ? () => onDelete(rec) : undefined}
                      onMarkPrimary={primaryAction(settings, rec, canEdit, onMarkPrimary)}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileCardsPresentation(props: OperationalPresentationProps) {
  const { records, tab, config, canAdd, canEdit, onAdd, onView, onEdit, onDelete, onMarkPrimary } = props;
  const router = useRouter();
  const settings = presentationSettings(config);
  const [filter, setFilter] = useState<string>("");
  const statusField = stringSetting(settings, "status_field", "");
  const blockedField = stringSetting(settings, "blocked_field", "");
  const codeField = stringSetting(settings, "code_field", config.title);
  const titleField = stringSetting(settings, "title_field", config.title);
  const primaryFields = fieldSpecs(settings, "primary_fields", config.facts ?? []);
  const secondaryFields = fieldSpecs(settings, "secondary_fields");
  const activeCount = records.filter((rec) => activeLike(rec, statusField, blockedField)).length;
  const blockedCount = records.filter((rec) => blockedLike(rec, statusField, blockedField)).length;
  const visible = records.filter((rec) => {
    if (filter === "active") return activeLike(rec, statusField, blockedField);
    if (filter === "blocked") return blockedLike(rec, statusField, blockedField);
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <FilterPillBar
          compact
          items={[
            { value: "active", label: "Active", count: activeCount },
            { value: "blocked", label: "Blocked", count: blockedCount },
          ]}
          value={filter}
          onChange={setFilter}
          allItem={{ label: `All (${records.length})` }}
        />
        {canAdd && (
          <Button variant="primary" size="sm" className="h-8 gap-1 text-xs" onClick={onAdd}>
            <Plus className="size-3 shrink-0" />
            {tab.add_label ?? "Add"}
          </Button>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {visible.map((rec) => {
          const isBlocked = blockedLike(rec, statusField, blockedField);
          const isActive = activeLike(rec, statusField, blockedField);
          const appHref = roleAppHref(rec, settings);
          const openRecord = () => {
            if (appHref) {
              router.push(appHref);
              return;
            }
            onView(rec);
          };
          return (
            <div
              key={String(rec.id ?? displayFieldValue(rec, codeField))}
              role="button"
              tabIndex={0}
              onClick={openRecord}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openRecord(); } }}
              className={cn(
                "group rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                isBlocked ? "border-l-2 border-l-destructive" : "border-border",
              )}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {codeField && (
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
                        <OperationalFieldValue rec={rec} field={codeField} variant="code" />
                      </span>
                    )}
                    <p className={cn("truncate", OP_ITEM_TITLE_CLASS)}>
                      <OperationalFieldValue rec={rec} field={titleField} />
                    </p>
                  </div>
                </div>
                <div
                  className="flex items-center gap-1.5"
                  onClick={appHref ? undefined : (e) => e.stopPropagation()}
                >
                  <StatusPill value={isBlocked ? "blocked" : (rec[statusField] ?? isActive)} label={isBlocked ? "blocked" : displayFieldValue(rec, statusField)} />
                  {!appHref && (
                    <ActionMenu
                      onEdit={canEdit ? () => onEdit(rec) : undefined}
                      onDelete={canEdit ? () => onDelete(rec) : undefined}
                      onMarkPrimary={primaryAction(settings, rec, canEdit, onMarkPrimary)}
                    />
                  )}
                </div>
              </div>

              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {primaryFields.filter((spec) => hasFieldValue(rec, spec.field)).map((spec) => (
                  <div key={spec.field}>
                    <p className={OP_FIELD_LABEL_CLASS}>{spec.label}</p>
                    <p className={cn("mt-1 truncate", OP_FIELD_VALUE_CLASS)}>
                      <OperationalFieldValue rec={rec} field={spec.field} />
                    </p>
                  </div>
                ))}
              </div>

              {secondaryFields.filter((spec) => hasFieldValue(rec, spec.field)).length > 0 && (
                <div className="mt-4 grid gap-x-6 gap-y-4 border-t border-border pt-3 sm:grid-cols-2">
                  {secondaryFields.filter((spec) => hasFieldValue(rec, spec.field)).map((spec) => (
                    <div key={spec.field}>
                      <p className={OP_FIELD_LABEL_CLASS}>{spec.label}</p>
                      <p className={cn("mt-1 truncate", OP_FIELD_VALUE_CLASS)}>
                        <OperationalFieldValue rec={rec} field={spec.field} />
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {canAdd && <AddTile label={tab.add_label ?? "Add"} onAdd={onAdd} />}
      </div>
    </div>
  );
}

function PolicyMatrixPresentation(props: OperationalPresentationProps) {
  const { records, tab, config, canAdd, canEdit, onAdd, onView, onEdit, onDelete, onMarkPrimary } = props;
  const settings = presentationSettings(config);
  const [filter, setFilter] = useState<string>("");
  const filterField = stringSetting(settings, "filter_field", "");
  const columns = fieldSpecs(settings, "columns", [config.title, ...(config.facts ?? [])]);
  const filterValues = uniqueFieldValues(records, filterField);
  const visible = filter && filterField ? records.filter((rec) => String(rec[filterField]) === filter) : records;

  return (
    <div className="space-y-4">
      <ListToolbar
        records={records}
        filterField={filterField}
        filterValues={filterValues}
        filter={filter}
        setFilter={setFilter}
        canAdd={canAdd}
        addLabel={tab.add_label ?? "Add"}
        onAdd={onAdd}
      />
      <DataTable
        records={visible}
        columns={columns}
        canEdit={canEdit}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
        onMarkPrimary={onMarkPrimary}
      />
    </div>
  );
}

function CapabilityCell({ spec, rec }: { spec: PresentationFieldSpec; rec: ChildRecord }) {
  const allowed = rec[spec.field] === true;
  return (
    <div className={cn(
      "rounded-md border px-3 py-3 text-center text-xs",
      allowed
        ? "border-success/20 bg-success/10 text-success"
        : "border-border bg-muted/30 text-muted-foreground",
    )}
    >
      <CheckCircle2 className={cn("mx-auto mb-1 size-4", !allowed && "opacity-0")} />
      <span className="text-foreground">{spec.label}</span>
    </div>
  );
}

function AbilityCardsPresentation(props: OperationalPresentationProps) {
  const { records, tab, config, canAdd, canEdit, onAdd, onView, onEdit, onDelete, onMarkPrimary } = props;
  const settings = presentationSettings(config);
  const [filter, setFilter] = useState<string>("");
  const filterField = stringSetting(settings, "filter_field", "");
  const modeField = stringSetting(settings, "mode_field", "");
  const defaultField = stringSetting(settings, "default_field", "");
  const descriptionField = stringSetting(settings, "description_field", "");
  const titleField = stringSetting(settings, "title_field", config.title);
  const capabilityFields = fieldSpecs(settings, "capability_fields");
  const filterValues = uniqueFieldValues(records, filterField);
  const visible = filter && filterField ? records.filter((rec) => String(rec[filterField]) === filter) : records;

  return (
    <div className="space-y-4">
      <ListToolbar
        records={records}
        filterField={filterField}
        filterValues={filterValues}
        filter={filter}
        setFilter={setFilter}
        canAdd={canAdd}
        addLabel={tab.add_label ?? "Add"}
        onAdd={onAdd}
        primaryAdd
      />

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {visible.map((rec) => (
          <div
            key={String(rec.id ?? displayFieldValue(rec, titleField))}
            role="button"
            tabIndex={0}
            onClick={() => onView(rec)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(rec); } }}
            className="group rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className={cn("truncate", OP_ITEM_TITLE_CLASS)}>
                    <OperationalFieldValue rec={rec} field={titleField} />
                  </p>
                  {rec[defaultField] === true && <StatusPill value="default" label={stringSetting(settings, "default_label", "default")} />}
                  {hasFieldValue(rec, modeField) && <StatusPill value={rec[modeField]} label={displayFieldValue(rec, modeField)} />}
                </div>
                {descriptionField && hasFieldValue(rec, descriptionField) && (
                  <p className={cn("mt-2", OP_FIELD_HELPER_CLASS)}>
                    <OperationalFieldValue rec={rec} field={descriptionField} />
                  </p>
                )}
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  onEdit={canEdit ? () => onEdit(rec) : undefined}
                  onDelete={canEdit ? () => onDelete(rec) : undefined}
                  onMarkPrimary={primaryAction(settings, rec, canEdit, onMarkPrimary)}
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {capabilityFields.map((spec) => <CapabilityCell key={spec.field} spec={spec} rec={rec} />)}
            </div>
          </div>
        ))}
        {canAdd && <AddTile label={tab.add_label ?? "Add"} onAdd={onAdd} />}
      </div>
    </div>
  );
}

function temporalBounds(records: ChildRecord[], startField: string, endField: string): { min: number; max: number } {
  const dates = records.flatMap((rec) => {
    const start = dateMs(rec[startField]);
    const end = endField ? dateMs(rec[endField]) : null;
    return [start, end].filter((value): value is number => value !== null);
  });
  const now = Date.now();
  const min = Math.min(...dates, now);
  const max = Math.max(...dates, now + 86_400_000);
  return min === max ? { min: min - 86_400_000, max: max + 86_400_000 } : { min, max };
}

function TemporalRulesPresentation(props: OperationalPresentationProps) {
  const { records, tab, config, canAdd, canEdit, onAdd, onView, onEdit, onDelete, onMarkPrimary } = props;
  const settings = presentationSettings(config);
  const [filter, setFilter] = useState<string>("");
  const filterField = stringSetting(settings, "filter_field", "");
  const roleField = stringSetting(settings, "role_field", config.title);
  const targetField = stringSetting(settings, "target_field", config.facts?.[0] ?? "");
  const startField = stringSetting(settings, "start_field", "");
  const endField = stringSetting(settings, "end_field", "");
  const statusField = stringSetting(settings, "status_field", "");
  const statusResolverName = stringSetting(settings, "status_resolver", "") || undefined;
  const columns = fieldSpecs(
    settings,
    "columns",
    [roleField, targetField, filterField, startField, endField, statusField].filter(Boolean),
  );
  const filterValues = uniqueFieldValues(records, filterField);
  const visible = filter && filterField ? records.filter((rec) => String(rec[filterField]) === filter) : records;
  const bounds = useMemo(() => temporalBounds(visible, startField, endField), [visible, startField, endField]);

  return (
    <div className="space-y-4">
      <ListToolbar
        records={records}
        filterField={filterField}
        filterValues={filterValues}
        filter={filter}
        setFilter={setFilter}
        canAdd={canAdd}
        addLabel={tab.add_label ?? "Add"}
        onAdd={onAdd}
      />

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h4 className={OP_ITEM_TITLE_CLASS}>
            {stringSetting(settings, "timeline_title", "Effective ranges")}
          </h4>
          <span className="text-xs text-muted-foreground">today: {formatDate(new Date().toISOString())}</span>
        </div>
        <div className="space-y-3">
          {visible.map((rec) => {
            const start = dateMs(rec[startField]) ?? bounds.min;
            const end = (endField ? dateMs(rec[endField]) : null) ?? bounds.max;
            const left = Math.max(0, Math.min(100, ((start - bounds.min) / (bounds.max - bounds.min)) * 100));
            const width = Math.max(6, Math.min(100 - left, ((end - start) / (bounds.max - bounds.min)) * 100));
            return (
              <button
                key={String(rec.id ?? `${displayFieldValue(rec, roleField)}-${displayFieldValue(rec, startField)}`)}
                type="button"
                onClick={() => onView(rec)}
                className="grid w-full grid-cols-[minmax(7rem,10rem)_1fr] items-center gap-3 text-left"
              >
                <span className={cn("truncate", OP_FIELD_LABEL_CLASS)}>
                  <OperationalFieldValue rec={rec} field={roleField} variant="code" />
                </span>
                <span className="relative h-7 rounded bg-muted/60">
                  <span
                    className={cn("absolute top-1.5 h-4 rounded", statusBarClass(rec[statusField], statusResolverName))}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                  <span
                    className="absolute top-1.5 truncate px-2 text-xs font-medium text-primary-foreground"
                    style={{ left: `${left}%`, width: `${width}%` }}
                  >
                    {displayFieldValue(rec, statusField)} - <OperationalFieldValue rec={rec} field={targetField} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <DataTable
        records={visible}
        columns={columns}
        statusField={statusField}
        canEdit={canEdit}
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
        onMarkPrimary={onMarkPrimary}
      />
    </div>
  );
}

function ListToolbar({
  records,
  filterField,
  filterValues,
  filter,
  setFilter,
  canAdd,
  addLabel,
  onAdd,
  primaryAdd = false,
}: {
  records: ChildRecord[];
  filterField: string;
  filterValues: string[];
  filter: string;
  setFilter: (filter: string) => void;
  canAdd: boolean;
  addLabel: string;
  onAdd: () => void;
  primaryAdd?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {filterField && filterValues.length > 0 ? (
        <FilterPillBar
          compact
          items={filterValues.map((value) => ({
            value,
            label: displayFieldValue({ [filterField]: value }, filterField),
            count: records.filter((rec) => String(rec[filterField]) === value).length,
          }))}
          value={filter}
          onChange={setFilter}
          allItem={{ label: "All" }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {records.length} record{records.length !== 1 ? "s" : ""}
        </p>
      )}
      {canAdd && (
        <Button variant={primaryAdd ? "primary" : "outline"} size="sm" className="h-8 gap-1 text-xs" onClick={onAdd}>
          <Plus className="size-3 shrink-0" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

function DataTable({
  records,
  columns,
  statusField,
  canEdit,
  onView,
  onEdit,
  onDelete,
  onMarkPrimary,
}: {
  records: ChildRecord[];
  columns: PresentationFieldSpec[];
  statusField?: string;
  canEdit: boolean;
  onView: (rec: ChildRecord) => void;
  onEdit: (rec: ChildRecord) => void;
  onDelete: (rec: ChildRecord) => void;
  onMarkPrimary: (rec: ChildRecord) => void;
}) {
  const context = useContext(DisplayMetadataContext);
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="min-w-full text-left text-sm">
        <thead className={cn("bg-muted/60", OP_FIELD_LABEL_CLASS)}>
          <tr>
            {columns.map((column) => (
              <th key={column.field} className="whitespace-nowrap px-4 py-3">{column.label}</th>
            ))}
            <th className="w-8 px-2 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {records.map((rec) => (
            <tr
              key={String(rec.id ?? columns.map((column) => displayFieldValue(rec, column.field)).join("|"))}
              className="group cursor-pointer transition-colors hover:bg-muted/30"
              onClick={() => onView(rec)}
            >
              {columns.map((column) => {
                const value = preferredDisplayValue(rec, column.field);
                const isStatus = column.field === statusField || column.kind === "status";
                return (
                  <td key={column.field} className="whitespace-nowrap px-4 py-3 align-top">
                    {isStatus ? (
                      <StatusPill value={value} />
                    ) : typeof rec[column.field] === "boolean" ? (
                      <StatusPill value={rec[column.field]} label={displayFieldValue(rec, column.field)} />
                    ) : (
                      <OperationalFieldValue
                        rec={rec}
                        field={column.field}
                        variant={column.kind === "code" ? "code" : "label"}
                        className={cn(column.kind === "code" && "text-foreground")}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-3" onClick={(e) => e.stopPropagation()}>
                <ActionMenu
                  onEdit={canEdit ? () => onEdit(rec) : undefined}
                  onDelete={canEdit ? () => onDelete(rec) : undefined}
                  onMarkPrimary={primaryAction(context.settings, rec, canEdit, onMarkPrimary)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OperationalPresentationView(props: OperationalPresentationProps) {
  const content = (() => {
    switch (props.config.presentation) {
      case "scorecard":
        return <ScorecardPresentation {...props} />;
      case "timeline":
        return <TimelinePresentation {...props} />;
      case "profile_cards":
        return <ProfileCardsPresentation {...props} />;
      case "policy_matrix":
        return <PolicyMatrixPresentation {...props} />;
      case "ability_cards":
        return <AbilityCardsPresentation {...props} />;
      case "temporal_rules":
        return <TemporalRulesPresentation {...props} />;
      default:
        return null;
    }
  })();

  return (
    <OperationalDisplayMetadataProvider entityCode={props.tab.entity_code ?? ""} config={props.config}>
      {content}
    </OperationalDisplayMetadataProvider>
  );
}
