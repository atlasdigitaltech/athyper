"use client";

import React from "react";
import { ArrowRight, CheckCircle2, FileUp, LockKeyhole, RotateCcw } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import type { FlowBundle, FlowFieldBinding } from "@athyper/api-contracts/documents";
import type { LookupValue } from "@athyper/api-contracts/metadata";

type JsonRecord = Record<string, unknown>;

export interface FlowPreflightDimensionConfig {
  field: string;
  label?: string;
  caption?: string;
  more_label?: string;
  advanced_tiers?: string[];
}

export interface FlowPreflightRule {
  when: Record<string, unknown>;
  reason?: string;
}

export interface FlowPreflightProfileRule {
  when: Record<string, unknown>;
  profile: string;
}

export interface FlowPreflightUploadConfig {
  enabled?: boolean;
  parameter_code?: string;
  parameter_namespace?: string;
  label?: string;
  helper?: string;
  accept?: string[];
}

export interface FlowPreflightConfig {
  enabled: boolean;
  suppress_alternate_flow_launcher?: boolean;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  dimensions: FlowPreflightDimensionConfig[];
  defaults?: Record<string, unknown>;
  disable_rules?: FlowPreflightRule[];
  profile_rules?: FlowPreflightProfileRule[];
  selection_summary_label?: string;
  profile_label?: string;
  recent_label?: string;
  use_recent_label?: string;
  more_label?: string;
  continue_label?: string;
  cancel_label?: string;
  upload?: FlowPreflightUploadConfig;
}

export interface FlowPreflightSelection {
  values: Record<string, string>;
  labels: Record<string, string>;
  lockedFields: string[];
  profile: string | null;
}

interface FlowPreflightChooserProps {
  bundle: FlowBundle;
  entityLabel?: string;
  onCancel?: () => void;
  onContinue: (selection: FlowPreflightSelection) => void;
}

interface FlowPreflightLockedSummaryProps {
  selection: FlowPreflightSelection;
  onRestart?: () => void;
  restartLabel?: string;
  showRestart?: boolean;
}

interface FlowPreflightRestartButtonProps {
  onRestart: () => void;
  restartLabel?: string;
}

type Option = {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  metadata: JsonRecord;
};

type RecentSelection = {
  values: Record<string, string>;
  labels: Record<string, string>;
  profile: string | null;
  count: number;
  lastUsedAt: string;
};

type ParameterSnapshot = {
  values?: Record<string, unknown>;
};

const headerContextChipClass =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium leading-none text-muted-foreground shadow-sm";

const headerSecondaryButtonClass =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-xs font-medium leading-none text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => stringValue(item)).filter((item): item is string => Boolean(item))
    : [];
}

function parseDimension(value: unknown): FlowPreflightDimensionConfig | null {
  if (!isRecord(value)) return null;
  const field = stringValue(value.field);
  if (!field) return null;
  return {
    field,
    label: stringValue(value.label),
    caption: stringValue(value.caption),
    more_label: stringValue(value.more_label),
    advanced_tiers: stringArray(value.advanced_tiers),
  };
}

function parseRule(value: unknown): FlowPreflightRule | null {
  if (!isRecord(value) || !isRecord(value.when)) return null;
  return {
    when: value.when,
    reason: stringValue(value.reason),
  };
}

function parseProfileRule(value: unknown): FlowPreflightProfileRule | null {
  if (!isRecord(value) || !isRecord(value.when)) return null;
  const profile = stringValue(value.profile);
  if (!profile) return null;
  return { when: value.when, profile };
}

function parseUpload(value: unknown): FlowPreflightUploadConfig | undefined {
  if (!isRecord(value)) return undefined;
  return {
    enabled: value.enabled === true,
    parameter_code: stringValue(value.parameter_code),
    parameter_namespace: stringValue(value.parameter_namespace),
    label: stringValue(value.label),
    helper: stringValue(value.helper),
    accept: stringArray(value.accept),
  };
}

export function getFlowPreflightConfig(bundle: FlowBundle | null | undefined): FlowPreflightConfig | null {
  if (!bundle) return null;
  const rawConfig = isRecord(bundle.config) ? bundle.config.preflight : null;
  if (!isRecord(rawConfig) || rawConfig.enabled !== true) return null;
  const dimensions = Array.isArray(rawConfig.dimensions)
    ? rawConfig.dimensions.map(parseDimension).filter((item): item is FlowPreflightDimensionConfig => Boolean(item))
    : [];
  if (dimensions.length === 0) return null;

  return {
    enabled: true,
    suppress_alternate_flow_launcher: rawConfig.suppress_alternate_flow_launcher === true,
    eyebrow: stringValue(rawConfig.eyebrow),
    title: stringValue(rawConfig.title),
    subtitle: stringValue(rawConfig.subtitle),
    dimensions,
    defaults: isRecord(rawConfig.defaults) ? rawConfig.defaults : undefined,
    disable_rules: Array.isArray(rawConfig.disable_rules)
      ? rawConfig.disable_rules.map(parseRule).filter((item): item is FlowPreflightRule => Boolean(item))
      : [],
    profile_rules: Array.isArray(rawConfig.profile_rules)
      ? rawConfig.profile_rules.map(parseProfileRule).filter((item): item is FlowPreflightProfileRule => Boolean(item))
      : [],
    selection_summary_label: stringValue(rawConfig.selection_summary_label),
    profile_label: stringValue(rawConfig.profile_label),
    recent_label: stringValue(rawConfig.recent_label),
    use_recent_label: stringValue(rawConfig.use_recent_label),
    more_label: stringValue(rawConfig.more_label),
    continue_label: stringValue(rawConfig.continue_label),
    cancel_label: stringValue(rawConfig.cancel_label),
    upload: parseUpload(rawConfig.upload),
  };
}

function allFields(bundle: FlowBundle): FlowFieldBinding[] {
  return bundle.steps.flatMap((step) => step.fields);
}

function findField(bundle: FlowBundle, fieldName: string): FlowFieldBinding | null {
  return allFields(bundle).find((field) => field.field_name === fieldName) ?? null;
}

function recentStorageKey(bundle: FlowBundle): string {
  return `athyper.flow-preflight.${bundle.flow_id}`;
}

function readRecents(bundle: FlowBundle): RecentSelection[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentStorageKey(bundle)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecord)
      .map((item) => ({
        values: isRecord(item.values) ? stringifyValues(item.values) : {},
        labels: isRecord(item.labels) ? stringifyValues(item.labels) : {},
        profile: stringValue(item.profile) ?? null,
        count: Number(item.count) || 1,
        lastUsedAt: stringValue(item.lastUsedAt) ?? new Date(0).toISOString(),
      }))
      .filter((item) => Object.keys(item.values).length > 0)
      .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
      .slice(0, 6);
  } catch {
    return [];
  }
}

function writeRecent(bundle: FlowBundle, selection: FlowPreflightSelection): void {
  if (typeof window === "undefined") return;
  const now = new Date().toISOString();
  const existing = readRecents(bundle);
  const key = selectionKey(selection.values);
  const withoutCurrent = existing.filter((item) => selectionKey(item.values) !== key);
  const previous = existing.find((item) => selectionKey(item.values) === key);
  const next: RecentSelection[] = [
    {
      values: selection.values,
      labels: selection.labels,
      profile: selection.profile,
      count: (previous?.count ?? 0) + 1,
      lastUsedAt: now,
    },
    ...withoutCurrent,
  ].slice(0, 6);
  window.localStorage.setItem(recentStorageKey(bundle), JSON.stringify(next));
}

function stringifyValues(values: JsonRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values)
      .map(([key, value]) => [key, String(value ?? "").trim()] as const)
      .filter(([, value]) => Boolean(value)),
  );
}

function selectionKey(values: Record<string, string>): string {
  return Object.entries(values)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

function labelForRecent(recent: RecentSelection, dimensions: FlowPreflightDimensionConfig[]): string {
  return dimensions
    .map((dimension) => recent.labels[dimension.field] ?? recent.values[dimension.field])
    .filter(Boolean)
    .join(" - ");
}

function matchesRule(ruleWhen: Record<string, unknown>, values: Record<string, string>): boolean {
  return Object.entries(ruleWhen).every(([field, expected]) => {
    const current = values[field];
    if (current === undefined) return false;
    if (Array.isArray(expected)) return expected.map(String).includes(current);
    return String(expected ?? "") === current;
  });
}

function disabledReason(
  values: Record<string, string>,
  rules: FlowPreflightRule[] | undefined,
): string | null {
  const matched = (rules ?? []).find((rule) => matchesRule(rule.when, values));
  return matched?.reason ?? null;
}

function resolveProfile(
  values: Record<string, string>,
  rules: FlowPreflightProfileRule[] | undefined,
): string | null {
  const matched = (rules ?? []).find((rule) => matchesRule(rule.when, values));
  return matched?.profile ?? null;
}

function fieldOptionsKey(dimensions: FlowPreflightDimensionConfig[]): string {
  return dimensions.map((dimension) => dimension.field).join("|");
}

function normalizeLookupValues(values: LookupValue[] | undefined): Option[] {
  return (values ?? [])
    .filter((value) => (value.status ?? "active") === "active")
    .map((value) => ({
      code: value.code,
      name: value.name,
      description: value.description,
      sort_order: value.sort_order,
      metadata: isRecord(value.metadata) ? value.metadata : {},
    }))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name));
}

function lookupDomainForField(field: FlowFieldBinding): string | null {
  const explicit = stringValue(field.enum_domain_code);
  if (explicit) return explicit;

  const defaultSource = stringValue(field.default_source);
  if (!defaultSource?.startsWith("lookup.")) return null;

  const lastDot = defaultSource.lastIndexOf(".");
  if (lastDot <= "lookup.".length) return null;

  const domainCode = defaultSource.slice("lookup.".length, lastDot).trim();
  return domainCode || null;
}

function useLookupOptions(bundle: FlowBundle, dimensions: FlowPreflightDimensionConfig[]) {
  const [options, setOptions] = React.useState<Record<string, Option[]>>({});
  const [loading, setLoading] = React.useState(false);
  const dimensionsKey = React.useMemo(() => fieldOptionsKey(dimensions), [dimensions]);

  React.useEffect(() => {
    const controller = new AbortController();
    const fields = dimensions
      .map((dimension) => {
        const field = findField(bundle, dimension.field);
        return { dimension, field, domainCode: field ? lookupDomainForField(field) : null };
      })
      .filter((item): item is { dimension: FlowPreflightDimensionConfig; field: FlowFieldBinding; domainCode: string } =>
        Boolean(item.field && item.domainCode),
      );

    if (fields.length === 0) {
      setOptions({});
      setLoading(false);
      return;
    }

    setLoading(true);
    void Promise.all(
      fields.map(async ({ dimension, domainCode }) => {
        const res = await fetch(
          `/api/relay/api/metadata/lookups/${encodeURIComponent(domainCode)}`,
          { signal: controller.signal },
        );
        if (!res.ok) return [dimension.field, []] as const;
        const body = await res.json() as { values?: LookupValue[] };
        return [dimension.field, normalizeLookupValues(body.values)] as const;
      }),
    )
      .then((rows) => {
        if (controller.signal.aborted) return;
        setOptions(Object.fromEntries(rows));
      })
      .catch(() => {
        if (!controller.signal.aborted) setOptions({});
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [bundle, dimensionsKey]);

  return { options, loading };
}

function parameterNamespace(parameterCode: string, explicit?: string): string {
  if (explicit) return explicit;
  const parts = parameterCode.split(".");
  return parts.length > 1 ? parts.slice(0, -1).join(".") : parameterCode;
}

function useBooleanParameter(parameterCode?: string, namespace?: string): boolean {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    if (!parameterCode) {
      setEnabled(false);
      return;
    }

    const controller = new AbortController();
    const ns = parameterNamespace(parameterCode, namespace);
    void fetch(`/api/iam/parameters/effective?namespace=${encodeURIComponent(ns)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() as Promise<ParameterSnapshot> : { values: {} }))
      .then((snapshot) => {
        if (controller.signal.aborted) return;
        setEnabled(snapshot.values?.[parameterCode] === true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEnabled(false);
      });

    return () => controller.abort();
  }, [parameterCode, namespace]);

  return enabled;
}

function defaultSelection(
  config: FlowPreflightConfig,
  options: Record<string, Option[]>,
): Record<string, string> {
  return Object.fromEntries(
    config.dimensions.map((dimension) => {
      const configured = stringValue(config.defaults?.[dimension.field]);
      const available = options[dimension.field] ?? [];
      const validConfigured = configured && available.some((option) => option.code === configured)
        ? configured
        : undefined;
      return [dimension.field, validConfigured ?? available[0]?.code ?? ""];
    }),
  );
}

function labelsForSelection(
  values: Record<string, string>,
  options: Record<string, Option[]>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => {
      const match = (options[field] ?? []).find((option) => option.code === value);
      return [field, match?.name ?? value];
    }),
  );
}

function selectedOption(
  field: string,
  values: Record<string, string>,
  options: Record<string, Option[]>,
): Option | null {
  return (options[field] ?? []).find((option) => option.code === values[field]) ?? null;
}

function optionDisplayTier(option: Option): string {
  return stringValue(option.metadata.display_tier) ?? "primary";
}

function optionPreflightMetadata(option: Option): JsonRecord {
  return isRecord(option.metadata.preflight) ? option.metadata.preflight : {};
}

function optionDescription(option: Option): string | null {
  const metadata = optionPreflightMetadata(option);
  return stringValue(metadata.description) ?? option.description ?? null;
}

function optionExamples(option: Option): string[] {
  return stringArray(optionPreflightMetadata(option).examples);
}

function optionExamplesLabel(option: Option): string {
  return stringValue(optionPreflightMetadata(option).examples_label) ?? "Examples";
}

function optionHelper(option: Option): string | null {
  return stringValue(optionPreflightMetadata(option).helper) ?? null;
}

function dimensionAdvancedTiers(dimension: FlowPreflightDimensionConfig): Set<string> {
  const tiers = dimension.advanced_tiers && dimension.advanced_tiers.length > 0
    ? dimension.advanced_tiers
    : ["advanced"];
  return new Set(tiers);
}

function splitOptions(dimension: FlowPreflightDimensionConfig, options: Option[], showMore: boolean) {
  const advanced = dimensionAdvancedTiers(dimension);
  const visible = showMore ? options : options.filter((option) => !advanced.has(optionDisplayTier(option)));
  const hiddenCount = options.length - visible.length;
  return { visible, hiddenCount };
}

export function FlowPreflightChooser({
  bundle,
  entityLabel,
  onCancel,
  onContinue,
}: FlowPreflightChooserProps) {
  const config = React.useMemo(() => getFlowPreflightConfig(bundle), [bundle]);
  const dimensions = config?.dimensions ?? [];
  const { options, loading } = useLookupOptions(bundle, dimensions);
  const [selection, setSelection] = React.useState<Record<string, string>>({});
  const [showMore, setShowMore] = React.useState<Record<string, boolean>>({});
  const [recents, setRecents] = React.useState<RecentSelection[]>([]);
  const uploadConfig = config?.upload;
  const uploadParameterEnabled = useBooleanParameter(
    uploadConfig?.enabled ? uploadConfig.parameter_code : undefined,
    uploadConfig?.parameter_namespace,
  );

  React.useEffect(() => {
    if (!config) return;
    setSelection((prev) => {
      const fallback = defaultSelection(config, options);
      const next = { ...fallback, ...prev };
      for (const dimension of config.dimensions) {
        const available = options[dimension.field] ?? [];
        if (!available.some((option) => option.code === next[dimension.field])) {
          next[dimension.field] = fallback[dimension.field] ?? "";
        }
      }
      return selectionKey(next) === selectionKey(prev) ? prev : next;
    });
  }, [config, options]);

  React.useEffect(() => {
    setRecents(readRecents(bundle));
  }, [bundle]);

  const labels = React.useMemo(() => labelsForSelection(selection, options), [selection, options]);
  const profile = React.useMemo(
    () => config ? resolveProfile(selection, config.profile_rules) : null,
    [config, selection],
  );
  const invalidReason = React.useMemo(
    () => config ? disabledReason(selection, config.disable_rules) : null,
    [config, selection],
  );
  const canContinue = Boolean(config) && !loading && !invalidReason && dimensions.every((dimension) => selection[dimension.field]);
  const uploadEnabled = Boolean(uploadConfig?.enabled && (!uploadConfig.parameter_code || uploadParameterEnabled));

  const acceptSelection = React.useCallback((values: Record<string, string>) => {
    if (!config) return;
    const valueLabels = labelsForSelection(values, options);
    const resolvedProfile = resolveProfile(values, config.profile_rules);
    const next: FlowPreflightSelection = {
      values,
      labels: valueLabels,
      lockedFields: config.dimensions.map((dimension) => dimension.field),
      profile: resolvedProfile,
    };
    writeRecent(bundle, next);
    onContinue(next);
  }, [bundle, config, onContinue, options]);

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("button,a,input,textarea,select")) return;
      const recent = recents[0];
      if (!recent || disabledReason(recent.values, config?.disable_rules)) return;
      event.preventDefault();
      acceptSelection(recent.values);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [acceptSelection, config?.disable_rules, recents]);

  if (!config) return null;

  function selectValue(field: string, value: string) {
    setSelection((prev) => ({ ...prev, [field]: value }));
  }

  const title = config.title ?? `Choose ${entityLabel ?? bundle.label}`;
  const subtitle = config.subtitle ?? bundle.description ?? undefined;
  const recentLabel = config.recent_label ?? "Recent";

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="text-center">
        {config.eyebrow && (
          <p className="text-xs font-mediumst text-muted-foreground">
            {config.eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-2xl font-medium text-foreground sm:text-3xl">
          {title}
        </h1>
        {subtitle && (
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className={cn("grid gap-4", dimensions.length >= 2 && "lg:grid-cols-2")}>
          {dimensions.map((dimension, index) => {
            const field = findField(bundle, dimension.field);
            const allOptions = options[dimension.field] ?? [];
            const { visible, hiddenCount } = splitOptions(dimension, allOptions, Boolean(showMore[dimension.field]));
            const selected = selectedOption(dimension.field, selection, options);
            const moreLabel = dimension.more_label ?? config.more_label ?? "More";

            return (
              <section key={dimension.field} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-xs font-medium text-background">
                      {index + 1}
                    </span>
                    <h2 className="text-base font-medium text-foreground">
                      {dimension.label ?? field?.field_label ?? dimension.field}
                    </h2>
                  </div>
                  {dimension.caption && (
                    <span className="text-xs text-muted-foreground">{dimension.caption}</span>
                  )}
                </div>

                <div className="flex flex-col gap-2">
                  {loading && allOptions.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                      Loading choices...
                    </div>
                  ) : allOptions.length === 0 ? (
                    <div className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
                      No choices configured for {dimension.label ?? field?.field_label ?? dimension.field}.
                    </div>
                  ) : (
                    visible.map((option) => {
                      const candidate = { ...selection, [dimension.field]: option.code };
                      const reason = disabledReason(candidate, config.disable_rules);
                      const checked = selected?.code === option.code;
                      const description = optionDescription(option);
                      const examples = optionExamples(option);
                      const helper = optionHelper(option);
                      return (
                        <button
                          key={option.code}
                          type="button"
                          onClick={() => !reason && selectValue(dimension.field, option.code)}
                          disabled={Boolean(reason)}
                          title={reason ?? description ?? undefined}
                          className={cn(
                            "flex min-h-[64px] items-start justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors",
                            checked
                              ? "border-primary bg-primary/5 text-foreground"
                              : "border-border bg-background hover:border-primary/50 hover:bg-muted/30",
                            reason && "cursor-not-allowed border-dashed bg-muted/20 text-muted-foreground opacity-60",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block text-sm font-medium">{option.name}</span>
                            {description && (
                              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                                {description}
                              </span>
                            )}
                            {examples.length > 0 && (
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {optionExamplesLabel(option)}: {examples.join(", ")}
                              </span>
                            )}
                            {helper && (
                              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                                {helper}
                              </span>
                            )}
                            {reason && (
                              <span className="mt-1 block text-xs text-muted-foreground">{reason}</span>
                            )}
                          </span>
                          <span className="shrink-0 pt-0.5">
                            {checked ? (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            ) : (
                              <span className="block h-5 w-5 rounded-full border border-border" />
                            )}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowMore((prev) => ({ ...prev, [dimension.field]: !prev[dimension.field] }))}
                    className="mt-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {showMore[dimension.field] ? `Hide ${moreLabel}` : `${moreLabel} (${hiddenCount})`}
                  </button>
                )}
              </section>
            );
          })}
        </div>
        <aside className="flex flex-col gap-4">
          {uploadEnabled && (
            <div className="flex min-h-28 items-start gap-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 px-4 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                <FileUp className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {uploadConfig?.label ?? "Drop file to auto-detect"}
                </p>
                {uploadConfig?.helper && (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {uploadConfig.helper}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-card px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {recentLabel}
              </span>
              {recents[0] && (
                <button
                  type="button"
                  onClick={() => acceptSelection(recents[0]!.values)}
                  disabled={Boolean(disabledReason(recents[0]!.values, config.disable_rules))}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {config.use_recent_label ?? "Use most recent"}
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {recents.length > 0 ? (
                recents.map((recent) => (
                  <button
                    key={selectionKey(recent.values)}
                    type="button"
                    onClick={() => acceptSelection(recent.values)}
                    disabled={Boolean(disabledReason(recent.values, config.disable_rules))}
                    className={cn(
                      "flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-xs font-medium text-foreground",
                      "hover:border-primary/50 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40",
                    )}
                  >
                    <span className="min-w-0 truncate">{labelForRecent(recent, dimensions)}</span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {recent.count}
                    </span>
                  </button>
                ))
              ) : (
                <span className="rounded-md border border-border bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                  None yet
                </span>
              )}
            </div>
          </div>
        </aside>
      </div>

      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              {config.selection_summary_label ?? "Selected"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dimensions.map((dimension) => (
                <span
                  key={dimension.field}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground"
                >
                  {labels[dimension.field] ?? selection[dimension.field] ?? dimension.field}
                </span>
              ))}
            </div>
            {invalidReason && (
              <p className="mt-2 text-xs text-destructive">{invalidReason}</p>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="rounded-md border border-border bg-background px-3 py-2 text-xs">
              <span className="block font-medium text-muted-foreground">
                {config.profile_label ?? "Profile"}
              </span>
              <span className="mt-1 block font-medium text-foreground">
                {profile ?? "--"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {config.cancel_label ?? "Exit"}
                </button>
              )}
              <button
                type="button"
                onClick={() => acceptSelection(selection)}
                disabled={!canContinue}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {config.continue_label ?? "Continue"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export function FlowPreflightLockedSummary({
  selection,
  onRestart,
  restartLabel = "Restart",
  showRestart = true,
}: FlowPreflightLockedSummaryProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {selection.lockedFields.map((field) => (
          <span
            key={field}
            className={headerContextChipClass}
          >
            <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-foreground">{selection.labels[field] ?? selection.values[field]}</span>
          </span>
        ))}
      </div>
      {showRestart && onRestart && (
        <FlowPreflightRestartButton onRestart={onRestart} restartLabel={restartLabel} />
      )}
    </div>
  );
}

export function FlowPreflightRestartButton({
  onRestart,
  restartLabel = "Restart",
}: FlowPreflightRestartButtonProps) {
  return (
    <button
      type="button"
      onClick={onRestart}
      className={headerSecondaryButtonClass}
    >
      <RotateCcw className="h-3.5 w-3.5" />
      {restartLabel}
    </button>
  );
}
