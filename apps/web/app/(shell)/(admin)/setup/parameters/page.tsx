"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Save, Search, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageFrame } from "@athyper/ui/layout";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

type ParameterDataType = "boolean" | "integer" | "number" | "string" | "enum" | "duration" | "json";
type ControlLevel = "system_controlled" | "tenant_configurable" | "tenant_owned";

interface ParameterRecord {
  code: string;
  namespace: string;
  displayName: string;
  description: string | null;
  ownerModel: "product" | "tenant";
  controlLevel: ControlLevel;
  tenantVisibility: "hidden" | "readonly" | "configurable";
  dataType: ParameterDataType;
  unit: string | null;
  defaultValue: unknown;
  productValue: unknown;
  tenantValue: unknown;
  overrideEnabled: boolean;
  effectiveValue: unknown;
  minValue: unknown;
  maxValue: unknown;
  allowedValues: unknown[];
  runtimeReload: "immediate" | "next_request" | "next_login" | "restart" | "external_provider";
  isSecuritySensitive: boolean;
  isRuntimeReloadable: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
}

interface ParameterListResponse {
  tenantId: string;
  count: number;
  parameters: ParameterRecord[];
}

interface DraftState {
  overrideEnabled: boolean;
  textValue: string;
  booleanValue: boolean;
  error?: string;
}

const TYPE_OPTIONS = [
  { value: "all", label: "All parameters" },
  { value: "system_controlled", label: "System product owned" },
  { value: "tenant_configurable", label: "Tenant configurable" },
  { value: "tenant_owned", label: "Tenant owned" },
];

const NAMESPACE_OPTIONS = [
  { value: "all", label: "All namespaces" },
  { value: "auth", label: "Auth" },
  { value: "auth.session", label: "Session" },
  { value: "auth.inactivity", label: "Inactivity" },
  { value: "auth.refresh", label: "Refresh" },
  { value: "auth.mfa", label: "MFA" },
  { value: "keycloak", label: "Keycloak" },
  { value: "runtime", label: "Runtime" },
];

export default function ManageParametersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("sess");
  const [activeSearch, setActiveSearch] = useState("sess");
  const [type, setType] = useState("all");
  const [namespace, setNamespace] = useState("all");
  const [showConfigurable, setShowConfigurable] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});

  const query = useQuery<ParameterListResponse>({
    queryKey: ["iam", "parameters", type, namespace, activeSearch, showConfigurable, showOverrides],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (type !== "all") params.set("type", type);
      if (namespace !== "all") params.set("namespace", namespace);
      if (activeSearch.trim()) params.set("q", activeSearch.trim());
      if (showConfigurable) params.set("configurable", "true");
      if (showOverrides) params.set("overrides", "true");
      const res = await fetch(`/api/iam/parameters?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load parameters");
      return res.json() as Promise<ParameterListResponse>;
    },
    staleTime: 15_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ parameter, draft }: { parameter: ParameterRecord; draft: DraftState }) => {
      const value = parseDraftValue(parameter, draft);
      if (value instanceof Error) throw value;

      const res = await fetch(`/api/iam/parameters/${encodeURIComponent(parameter.code)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrideEnabled: draft.overrideEnabled,
          value,
          reason: "Updated from Manage parameters",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        throw new Error(body.message ?? body.error ?? "Parameter update failed");
      }
      return res.json();
    },
    onSuccess: async (_data, variables) => {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[variables.parameter.code];
        return next;
      });
      await queryClient.invalidateQueries({ queryKey: ["iam", "parameters"] });
    },
  });

  const parameters = query.data?.parameters ?? [];
  const grouped = useMemo(() => {
    return parameters.reduce<Record<string, ParameterRecord[]>>((acc, parameter) => {
      (acc[parameter.namespace] ??= []).push(parameter);
      return acc;
    }, {});
  }, [parameters]);

  function getDraft(parameter: ParameterRecord): DraftState {
    return drafts[parameter.code] ?? createDraft(parameter);
  }

  function updateDraft(parameter: ParameterRecord, patch: Partial<DraftState>) {
    setDrafts((prev) => ({
      ...prev,
      [parameter.code]: { ...getDraft(parameter), ...patch },
    }));
  }

  function resetDraft(parameter: ParameterRecord) {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[parameter.code];
      return next;
    });
  }

  return (
    <PageFrame
      title="Manage parameters"
      description="Tenant-visible runtime settings for session, login, logout, inactivity, refresh, MFA, and Keycloak reference values"
    >
      <div className="space-y-5">
        <section className="rounded-lg border bg-background">
          <div className="border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">Filters</h2>
            </div>
          </div>
          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(14rem,20rem)_minmax(14rem,20rem)_1fr]">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Type</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Namespace</label>
              <Select value={namespace} onValueChange={setNamespace}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NAMESPACE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={showConfigurable} onCheckedChange={setShowConfigurable} />
                  Configurable only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={showOverrides} onCheckedChange={setShowOverrides} />
                  Overrides only
                </label>
              </div>
              <p className="text-xs text-muted-foreground">Tenant override switches are stored in the parameter table.</p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border bg-background">
          <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Parameters</h2>
              <p className="text-xs text-muted-foreground">
                {query.isLoading ? "Loading..." : `${query.data?.count ?? 0} result${query.data?.count === 1 ? "" : "s"}`}
              </p>
            </div>
            <div className="flex min-w-0 gap-2 md:w-80">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") setActiveSearch(search);
                  }}
                  className="h-9 pl-8"
                  placeholder="Search parameters"
                />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setActiveSearch(search)}>
                Search
              </Button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2 text-left font-medium" />
                  <th className="px-3 py-2 text-left font-medium">Name and ID</th>
                  <th className="w-40 px-3 py-2 text-left font-medium">Current value</th>
                  <th className="w-44 px-3 py-2 text-left font-medium">Tenant override</th>
                  <th className="w-64 px-3 py-2 text-left font-medium">New value</th>
                  <th className="w-32 px-3 py-2 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {query.isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Loading parameters...</td>
                  </tr>
                ) : query.isError ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-destructive">Unable to load parameters.</td>
                  </tr>
                ) : parameters.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No parameters match the current filters.</td>
                  </tr>
                ) : (
                  Object.entries(grouped).map(([group, rows]) => (
                    <ParameterGroup
                      key={group}
                      group={group}
                      rows={rows}
                      expanded={expanded}
                      getDraft={getDraft}
                      updateDraft={updateDraft}
                      resetDraft={resetDraft}
                      onExpand={setExpanded}
                      onSave={(parameter, draft) => saveMutation.mutate({ parameter, draft })}
                      savingCode={saveMutation.isPending ? saveMutation.variables?.parameter.code : null}
                      saveError={saveMutation.error instanceof Error ? saveMutation.error.message : null}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}

function ParameterGroup({
  group,
  rows,
  expanded,
  getDraft,
  updateDraft,
  resetDraft,
  onExpand,
  onSave,
  savingCode,
  saveError,
}: {
  group: string;
  rows: ParameterRecord[];
  expanded: string | null;
  getDraft: (parameter: ParameterRecord) => DraftState;
  updateDraft: (parameter: ParameterRecord, patch: Partial<DraftState>) => void;
  resetDraft: (parameter: ParameterRecord) => void;
  onExpand: (code: string | null) => void;
  onSave: (parameter: ParameterRecord, draft: DraftState) => void;
  savingCode: string | null;
  saveError: string | null;
}) {
  return (
    <>
      <tr className="border-t bg-muted/20">
        <td colSpan={6} className="px-3 py-2 text-xs font-semibold uppercase text-muted-foreground">{group}</td>
      </tr>
      {rows.map((parameter) => {
        const isExpanded = expanded === parameter.code;
        const draft = getDraft(parameter);
        const canOverride = parameter.tenantVisibility === "configurable";
        const dirty = isDraftDirty(parameter, draft);
        const saving = savingCode === parameter.code;

        return (
          <Fragment key={parameter.code}>
            <tr key={parameter.code} className={cn("border-t align-top", isExpanded && "bg-muted/10")}>
              <td className="px-3 py-3">
                <button
                  type="button"
                  aria-label={isExpanded ? "Collapse parameter" : "Expand parameter"}
                  onClick={() => onExpand(isExpanded ? null : parameter.code)}
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
                </button>
              </td>
              <td className="px-3 py-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{parameter.displayName}</span>
                    <ControlBadge parameter={parameter} />
                    {parameter.isSecuritySensitive ? (
                      <Badge variant="outline" className="gap-1 text-[11px]">
                        <ShieldCheck className="size-3" />
                        Security
                      </Badge>
                    ) : null}
                  </div>
                  <p className="font-mono text-xs text-muted-foreground">{parameter.code}</p>
                </div>
              </td>
              <td className="px-3 py-3 font-mono text-xs">{formatValue(parameter.effectiveValue)}</td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.overrideEnabled}
                    disabled={!canOverride}
                    onCheckedChange={(checked) => updateDraft(parameter, { overrideEnabled: checked })}
                  />
                  <span className={cn("text-xs", canOverride ? "text-foreground" : "text-muted-foreground")}>
                    {canOverride ? (draft.overrideEnabled ? "On" : "Off") : "View only"}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3">
                <ParameterValueInput
                  parameter={parameter}
                  draft={draft}
                  disabled={!canOverride || !draft.overrideEnabled}
                  onChange={(patch) => updateDraft(parameter, patch)}
                />
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-end gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={!dirty || saving}
                    title="Reset"
                    onClick={() => resetDraft(parameter)}
                  >
                    <RotateCcw className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    disabled={!dirty || saving || !canOverride}
                    title="Save"
                    onClick={() => onSave(parameter, draft)}
                  >
                    <Save className="size-4" />
                  </Button>
                </div>
              </td>
            </tr>
            {isExpanded ? (
              <tr key={`${parameter.code}:detail`} className="border-t bg-muted/10">
                <td />
                <td colSpan={5} className="px-3 py-4">
                  <div className="grid gap-4 md:grid-cols-4">
                    <Detail label="Description" value={parameter.description ?? "No description"} wide />
                    <Detail label="Default value" value={formatValue(parameter.defaultValue)} />
                    <Detail label="Product value" value={formatValue(parameter.productValue)} />
                    <Detail label="Tenant value" value={parameter.overrideEnabled ? formatValue(parameter.tenantValue) : "Override off"} />
                    <Detail label="Reload" value={parameter.runtimeReload.replace(/_/g, " ")} />
                    <Detail label="Range" value={formatRange(parameter)} />
                    <Detail label="Unit" value={parameter.unit ?? "-"} />
                    <Detail label="Source" value={String(parameter.metadata?.source ?? parameter.ownerModel)} />
                  </div>
                  {saveError && savingCode === parameter.code ? (
                    <p className="mt-3 text-xs text-destructive">{saveError}</p>
                  ) : null}
                </td>
              </tr>
            ) : null}
          </Fragment>
        );
      })}
    </>
  );
}

function ParameterValueInput({
  parameter,
  draft,
  disabled,
  onChange,
}: {
  parameter: ParameterRecord;
  draft: DraftState;
  disabled: boolean;
  onChange: (patch: Partial<DraftState>) => void;
}) {
  if (parameter.dataType === "boolean") {
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={draft.booleanValue}
          disabled={disabled}
          onCheckedChange={(checked) => onChange({ booleanValue: checked })}
        />
        <span className="text-xs text-muted-foreground">{draft.booleanValue ? "True" : "False"}</span>
      </div>
    );
  }

  if (parameter.dataType === "json") {
    return (
      <Textarea
        value={draft.textValue}
        disabled={disabled}
        onChange={(event) => onChange({ textValue: event.target.value })}
        className="min-h-20 font-mono text-xs"
      />
    );
  }

  if (parameter.dataType === "enum" && parameter.allowedValues.length > 0) {
    return (
      <Select
        value={draft.textValue}
        disabled={disabled}
        onValueChange={(value) => onChange({ textValue: value })}
      >
        <SelectTrigger className="h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {parameter.allowedValues.map((value) => (
            <SelectItem key={String(value)} value={String(value)}>{String(value)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      value={draft.textValue}
      disabled={disabled}
      type={parameter.dataType === "integer" || parameter.dataType === "number" || parameter.dataType === "duration" ? "number" : "text"}
      onChange={(event) => onChange({ textValue: event.target.value })}
      className="h-8 font-mono text-xs"
    />
  );
}

function ControlBadge({ parameter }: { parameter: ParameterRecord }) {
  if (parameter.controlLevel === "tenant_owned") {
    return <Badge variant="secondary" className="text-[11px]">Tenant owned</Badge>;
  }
  if (parameter.tenantVisibility === "configurable") {
    return <Badge variant="outline" className="border-primary/30 text-[11px] text-primary">Configurable</Badge>;
  }
  return <Badge variant="outline" className="text-[11px] text-muted-foreground">System view</Badge>;
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn(wide && "md:col-span-2")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm">{value}</p>
    </div>
  );
}

function createDraft(parameter: ParameterRecord): DraftState {
  const value = parameter.overrideEnabled ? parameter.tenantValue : parameter.effectiveValue;
  return {
    overrideEnabled: parameter.overrideEnabled,
    textValue: valueToInput(value),
    booleanValue: typeof value === "boolean" ? value : Boolean(value),
  };
}

function parseDraftValue(parameter: ParameterRecord, draft: DraftState): unknown | Error {
  if (!draft.overrideEnabled) return null;
  if (parameter.dataType === "boolean") return draft.booleanValue;
  if (parameter.dataType === "integer" || parameter.dataType === "duration") {
    const value = Number(draft.textValue);
    return Number.isInteger(value) ? value : new Error("Value must be a whole number.");
  }
  if (parameter.dataType === "number") {
    const value = Number(draft.textValue);
    return Number.isFinite(value) ? value : new Error("Value must be numeric.");
  }
  if (parameter.dataType === "json") {
    try {
      return JSON.parse(draft.textValue);
    } catch {
      return new Error("Value must be valid JSON.");
    }
  }
  return draft.textValue;
}

function isDraftDirty(parameter: ParameterRecord, draft: DraftState): boolean {
  const original = createDraft(parameter);
  return original.overrideEnabled !== draft.overrideEnabled ||
    original.booleanValue !== draft.booleanValue ||
    original.textValue !== draft.textValue;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function valueToInput(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function formatRange(parameter: ParameterRecord): string {
  const min = formatValue(parameter.minValue);
  const max = formatValue(parameter.maxValue);
  if (min === "-" && max === "-") return "-";
  return `${min} to ${max}`;
}
