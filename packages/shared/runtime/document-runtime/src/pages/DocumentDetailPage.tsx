"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ArrowLeftRight, CheckCircle2, Clock,
  FileClock, GitBranch, MessageSquare, Paperclip, Pencil, RotateCcw, Search, SlidersHorizontal, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Badge, Button, Card, CardContent,
  Skeleton, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@athyper/ui/primitives";
import type { RecordVersionSummary } from "@athyper/api-contracts/records";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import { queryKeys } from "@athyper/api-contracts/query-keys";
import { buildOrchestratorFromRecord } from "../orchestrator";
import { buildDocumentHeaderModel } from "../header";
import { AmountSummaryCard } from "../amounts";
import { FlowModal } from "../intake";
import { ValidationBanner } from "../validation";
import { EntityHeader, EntityProgressRow, useRailState } from "@athyper/entity-runtime/header";
import type { HeaderAction, PlatformPanelIcon } from "@athyper/entity-runtime/header";
import { resolveLinesRenderer } from "@athyper/runtime-shared/renderer-registry";
import {
  entityRowToPickerOption,
  resolveEntityPickerOptionConfig,
} from "@athyper/runtime-shared/entity-search";
import {
  fieldErrorsFromApiErrorBody,
  validateMetaFieldRules,
  validationFieldsAffectedByChange,
  validationSummaryMessage,
} from "@athyper/runtime-shared/validation";
import { normaliseCurrencyCode } from "@athyper/runtime-shared/core";
import { resolvePresentationConfig as resolveDisplayConfig } from "@athyper/entity-runtime/metadata";
import { useOperationDispatch } from "@athyper/entity-runtime/actions";
import { resolveDetailConfig, resolveTabs } from "@athyper/metadata-client/compiled-reader";
import type { CompiledEntity, EntityField, EntityOperation } from "@athyper/api-contracts/metadata";
import { resolveFieldRenderer } from "@athyper/entity-runtime/field-renderers";
import {
  TasksPanel,
  WatchersPanel,
  RulesPanel,
  IntegrationsPanel,
  QualityPanel,
  ReportsPanel,
  CommentsPanel,
  EventsPanel,
  ApprovalsPanel,
  WorkflowSummaryPanel,
  AttachmentsPanel,
  AuditMetaCard,
  EntityContextDrawer,
  DistributionsPanel,
} from "@athyper/entity-runtime/panels";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocumentDetailPageProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  /** Canonical business key from the URL [id] segment — used for sub-resource BFF calls */
  recordId:   string;
  editMode?:  boolean;
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function LinesPanel({
  entity, entityCode, recordId, recordUuid, companyCodeId, record,
  lines, distributions, isLoading, onRefresh, linesRenderer,
  hasAiClassification, hasLineComposer, editMode, currencyMinorUnits,
}: {
  entity: CompiledEntity;
  entityCode: string; recordId: string; recordUuid?: string;
  companyCodeId?: string; record?: Record<string, unknown>;
  lines: DocumentLine[];
  distributions: AccountingDistribution[];
  isLoading: boolean;
  onRefresh: () => void;
  linesRenderer: string;
  hasAiClassification?: boolean;
  hasLineComposer?: boolean;
  editMode?: boolean;
  currencyMinorUnits?: number | null;
}) {
  const RendererComponent = resolveLinesRenderer(linesRenderer);
  if (!RendererComponent) return null;

  const currencyCode =
    typeof record?.["transaction_currency"] === "string" ? record["transaction_currency"]
    : typeof record?.["currency_code"]       === "string" ? record["currency_code"]
    : "USD";

  return (
    <RendererComponent
      entity={entity}
      entityCode={entityCode}
      recordId={recordId}
      recordUuid={recordUuid}
      companyCodeId={companyCodeId}
      record={record}
      lines={lines}
      distributions={distributions}
      isLoading={isLoading}
      onRefresh={onRefresh}
      currencyCode={currencyCode}
      currencyMinorUnits={currencyMinorUnits}
      hasAiClassification={hasAiClassification}
      hasLineComposer={hasLineComposer}
      editMode={editMode}
    />
  );
}

// ── Versions panel ────────────────────────────────────────────────────────────

function resolveDocumentLinesRenderer(
  entityCode: string,
  configuredRenderer: string | null,
  hasLinesTab: boolean,
): string | null {
  const normalized = entityCode.replace(/-/g, "_");

  if (normalized === "journal_entry" && (!configuredRenderer || configuredRenderer === "generic")) {
    return "journal";
  }
  if (normalized === "payment_entry" && (!configuredRenderer || configuredRenderer === "generic")) {
    return "payment";
  }

  return configuredRenderer ?? (hasLinesTab ? "generic" : null);
}

interface VersionListResponse {
  data: RecordVersionSummary[];
  current_version_no: number;
}

interface CurrencyRefRow {
  code: string;
  minor_units: number | null;
}

function numberFromLineData(line: DocumentLine, key: string): number {
  const data = line.data as Record<string, unknown> | null | undefined ?? {};
  const n = Number(data[key]);
  return Number.isFinite(n) ? n : 0;
}

function journalTotalsFromLines(lines: DocumentLine[]): { totalDebit: number; totalCredit: number; lineCount: number } {
  return {
    totalDebit:  lines.reduce((sum, line) => sum + numberFromLineData(line, "transaction_debit"), 0),
    totalCredit: lines.reduce((sum, line) => sum + numberFromLineData(line, "transaction_credit"), 0),
    lineCount:   lines.length,
  };
}

function versionChangeTypeLabel(t: RecordVersionSummary["change_type"]): string {
  const map: Record<string, string> = {
    original: "Original", amendment: "Amendment",
    reversal: "Reversal", correction: "Correction",
  };
  return map[t] ?? t;
}

function versionStatusVariant(
  s: RecordVersionSummary["status"],
): "success" | "muted" | "destructive" | "secondary" {
  switch (s) {
    case "approved":   return "success";
    case "superseded": return "muted";
    case "cancelled":  return "destructive";
    default:           return "secondary";
  }
}

function VersionChangeTypeIcon({ type }: { type: RecordVersionSummary["change_type"] }) {
  switch (type) {
    case "amendment":  return <GitBranch    className="h-3.5 w-3.5" />;
    case "reversal":   return <RotateCcw    className="h-3.5 w-3.5" />;
    case "original":   return <CheckCircle2 className="h-3.5 w-3.5" />;
    default:           return <Clock        className="h-3.5 w-3.5" />;
  }
}

function VersionCard({
  version, isLast, pinnedVersion,
  onSelectCompare, onNavigateCompare, onAmend, isAmending,
}: {
  version:           RecordVersionSummary;
  isLast:            boolean;
  pinnedVersion:     number | null;
  onSelectCompare:   (vNo: number) => void;
  onNavigateCompare: (from: number, to: number) => void;
  onAmend:           () => void;
  isAmending:        boolean;
}) {
  const isCurrentAmendTarget = version.is_current && version.status === "approved";
  const isPinned     = pinnedVersion === version.version_no;
  const canCompareWith = pinnedVersion !== null && !isPinned;

  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold tabular-nums",
            version.is_current
              ? "border-primary bg-primary text-primary-foreground"
              : isPinned
              ? "border-info bg-info/10 text-info"
              : "border-border bg-background text-muted-foreground",
          )}
        >
          {version.version_no}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 bg-border" />}
      </div>

      <div
        className={cn(
          "mb-4 flex-1 rounded-lg border p-4",
          version.is_current
            ? "border-primary/30 bg-primary/5"
            : isPinned
            ? "border-info/30 bg-info/5"
            : "bg-card",
        )}
      >
        <div className="flex flex-wrap items-start gap-2">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-medium">
              <VersionChangeTypeIcon type={version.change_type} />
              {versionChangeTypeLabel(version.change_type)}
            </span>
            <Badge variant={versionStatusVariant(version.status)} className="capitalize text-doc-support">
              {version.status}
            </Badge>
            {version.is_current && <Badge variant="info" className="text-doc-support">Current</Badge>}
            {isPinned        && <Badge variant="secondary" className="text-doc-support">Selected</Badge>}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canCompareWith ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline" size="sm" className="h-7 gap-1 text-xs"
                      onClick={() => {
                        const from = Math.min(pinnedVersion!, version.version_no);
                        const to   = Math.max(pinnedVersion!, version.version_no);
                        onNavigateCompare(from, to);
                      }}
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      Compare ↔ v{pinnedVersion}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open diff: v{pinnedVersion} → v{version.version_no}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isPinned ? "secondary" : "ghost"} size="sm"
                      className="h-7 gap-1 text-xs text-muted-foreground"
                      onClick={() => onSelectCompare(version.version_no)}
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      {isPinned ? "Deselect" : "Select"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isPinned
                      ? "Deselect this version"
                      : `Select v${version.version_no} as compare baseline`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {isCurrentAmendTarget && (
              <Button
                variant="outline" size="sm" className="h-7 gap-1 text-xs"
                onClick={onAmend} disabled={isAmending}
              >
                <GitBranch className="h-3 w-3" />
                Amend
              </Button>
            )}
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {new Date(version.created_at).toLocaleString(undefined, {
              year: "numeric", month: "short", day: "numeric",
              hour: "2-digit", minute: "2-digit",
            })}
          </span>
          {version.created_by_name && <span>by {version.created_by_name}</span>}
          {version.change_reason   && <span className="italic">"{version.change_reason}"</span>}
        </div>
        <div className="mt-2 truncate font-mono text-doc-support text-muted-foreground/50">
          {version.data_hash}
        </div>
      </div>
    </div>
  );
}

function VersionsPanel({ entityCode, recordId }: { entityCode: string; recordId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [pinnedVersion, setPinnedVersion] = useState<number | null>(null);

  const { data, isLoading, isError } = useQuery<VersionListResponse>({
    queryKey: ["record-versions", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/versions`,
        { signal },
      );
      if (!res.ok) return { data: [], current_version_no: 0 };
      return res.json() as Promise<VersionListResponse>;
    },
    staleTime: 30_000,
  });

  const amendMutation = useMutation({
    mutationFn: () =>
      fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/amend`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      ).then((r) => { if (!r.ok) throw new Error("Amend failed"); return r.json(); }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["record-versions", entityCode, recordId] });
    },
  });

  const sorted = [...(data?.data ?? [])].sort((a, b) => a.version_no - b.version_no);

  return (
    <div className="space-y-1">
      {pinnedVersion !== null && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-info/20 bg-info/5 px-4 py-2.5">
          <span className="text-sm">
            <span className="font-medium">v{pinnedVersion} selected.</span>{" "}
            Click another version to open the diff view.
          </span>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setPinnedVersion(null)}>
            <XCircle className="mr-1 h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <Skeleton className="h-24 flex-1 rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">Failed to load version history.</p>
          <p className="mt-1 text-xs text-muted-foreground">Version control may not be enabled for this entity.</p>
        </div>
      )}

      {!isLoading && !isError && sorted.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-14 text-center">
          <FileClock className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No version history yet</p>
          <p className="text-xs text-muted-foreground/70">
            Versions appear here when this record is amended or reversed.
          </p>
        </div>
      )}

      {sorted.map((version, idx) => (
        <VersionCard
          key={version.version_no}
          version={version}
          isLast={idx === sorted.length - 1}
          pinnedVersion={pinnedVersion}
          onSelectCompare={(vNo) => setPinnedVersion((prev) => (prev === vNo ? null : vNo))}
          onNavigateCompare={(from, to) =>
            router.push(
              `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/compare?from=${from}&to=${to}`,
            )
          }
          onAmend={() => amendMutation.mutate()}
          isAmending={amendMutation.isPending}
        />
      ))}

      {amendMutation.isError && (
        <p className="mt-2 text-xs text-destructive">
          {amendMutation.error instanceof Error ? amendMutation.error.message : "Amend failed."}
        </p>
      )}
    </div>
  );
}

// ── Field-groups panel ────────────────────────────────────────────────────────

const FIELD_BANDS = [
  { key: "identity",     label: "Identity & Classification", min: 0,   max: 39  },
  { key: "counterparty", label: "Counterparty & Dates",      min: 40,  max: 69  },
  { key: "amounts",      label: "Currency & Amounts",         min: 70,  max: 119 },
  { key: "references",   label: "References & Terms",         min: 120, max: 149 },
  { key: "matching",     label: "Matching & Hold",            min: 150, max: 179 },
  { key: "dimensions",   label: "Dimensions & Fiscal",        min: 200, max: 999 },
] as const;

const HEADER_DISPLAY_FIELDS = new Set([
  "document_no", "status", "code", "name",
]);

const DOCUMENT_FIELD_GROUP_LABELS: Record<string, string> = {
  identity:       "Identity",
  posting:        "Posting",
  counterparty:   "Counterparty",
  dates:          "Dates",
  source:         "Source",
  currency:       "Currency",
  financial:      "Financial",
  amounts:        "Amounts",
  references:     "References",
  reference:      "References",
  narrative:      "Narrative",
  reversal:       "Reversal",
  controls:       "Controls",
  dimensions:     "Dimensions",
  matching:       "Matching",
  audit:          "Audit",
  metadata:       "Metadata",
  system:         "System",
};

const DOCUMENT_FIELD_GROUP_ORDER: Record<string, number> = {
  identity:     10,
  posting:      20,
  counterparty: 30,
  dates:        40,
  source:       50,
  currency:     60,
  financial:    70,
  amounts:      80,
  references:   90,
  reference:    90,
  narrative:    100,
  reversal:     110,
  controls:     120,
  dimensions:   130,
  matching:     140,
  audit:        900,
  metadata:     910,
  system:       920,
};

const DOCUMENT_EDIT_SKIP_FIELDS = new Set([
  "document_no", "status", "code", "name",
  "created_at", "created_by", "updated_at", "updated_by",
  "approved_at", "approved_by", "posted_at", "posted_by",
  "status_changed_at", "status_changed_by",
  "workflow_request_id", "ap_je_id",
]);

function normaliseStatusValue(value: unknown): string {
  return String(value ?? "draft").toLowerCase().replace(/[\s-]/g, "_");
}

function getDocumentStatus(entity: CompiledEntity, record: { data: Record<string, unknown>; status?: string }): string {
  const statusField = entity.display_config.document_header?.status_field ?? "status";
  return normaliseStatusValue(record.status ?? record.data[statusField]);
}

function isDocumentEditableField(field: EntityField): boolean {
  return (
    !field.is_readonly &&
    !field.is_computed &&
    field.origin !== "system" &&
    field.ui_type !== "hidden" &&
    field.data_type !== "lifecycle_state" &&
    !DOCUMENT_EDIT_SKIP_FIELDS.has(field.name)
  );
}

function isDocumentDisplayField(field: EntityField): boolean {
  return (
    !HEADER_DISPLAY_FIELDS.has(field.name) &&
    field.ui_type !== "hidden" &&
    field.data_type !== "lifecycle_state"
  );
}

function titleCaseGroupKey(groupKey: string): string {
  return groupKey
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getDocumentFieldGroupLabel(entity: CompiledEntity, groupKey: string): string {
  return (
    entity.field_groups.find((group) => group.group_key === groupKey)?.label ??
    DOCUMENT_FIELD_GROUP_LABELS[groupKey] ??
    titleCaseGroupKey(groupKey)
  );
}

function getDocumentFieldGroupOrder(groupKey: string, fields: EntityField[]): number {
  return DOCUMENT_FIELD_GROUP_ORDER[groupKey] ?? Math.min(...fields.map((field) => field.sort_order ?? 0));
}

function buildDocumentFieldGroups(
  entity: CompiledEntity,
  fields: EntityField[],
) {
  const byGroup = new Map<string, EntityField[]>();
  const ungrouped: EntityField[] = [];

  for (const field of fields) {
    const groupKey = field.group_key?.trim();
    if (!groupKey) {
      ungrouped.push(field);
      continue;
    }
    const groupFields = byGroup.get(groupKey) ?? [];
    groupFields.push(field);
    byGroup.set(groupKey, groupFields);
  }

  const grouped = [...byGroup.entries()].map(([key, groupFields]) => {
    const sortedFields = [...groupFields].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return {
      key,
      label: getDocumentFieldGroupLabel(entity, key),
      order: getDocumentFieldGroupOrder(key, sortedFields),
      fields: sortedFields,
    };
  });

  const fallbackGroups = FIELD_BANDS.map((band) => ({
    key:    band.key,
    label:  band.label,
    order:  band.min,
    fields: ungrouped
      .filter((field) => (field.sort_order ?? 0) >= band.min && (field.sort_order ?? 0) <= band.max)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  })).filter((group) => group.fields.length > 0);

  return [...grouped, ...fallbackGroups].sort((a, b) => a.order - b.order);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)__csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}

function fmtFieldValue(
  value: unknown,
  dataType: string,
  resolvedRefs: Map<string, string>,
): { text: string; kind: "text" | "bool"; boolOn?: boolean } {
  if (value === null || value === undefined || value === "") return { text: "—", kind: "text" };

  if (dataType === "boolean") {
    const on = value === true || value === "true" || value === 1;
    return { text: on ? "Yes" : "No", kind: "bool", boolOn: on };
  }
  if (dataType === "date") {
    try {
      return {
        text: new Intl.DateTimeFormat("en-GB", {
          day: "2-digit", month: "short", year: "numeric",
        }).format(new Date(String(value))),
        kind: "text",
      };
    } catch { return { text: String(value), kind: "text" }; }
  }
  if (dataType === "datetime" || dataType === "timestamptz") {
    try {
      return {
        text: new Intl.DateTimeFormat("en-GB", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit",
        }).format(new Date(String(value))),
        kind: "text",
      };
    } catch { return { text: String(value), kind: "text" }; }
  }
  if (dataType === "decimal" || dataType === "numeric") {
    const n = Number(value);
    if (!isNaN(n)) {
      return {
        text: new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        }).format(n),
        kind: "text",
      };
    }
  }
  if (dataType === "enum" || dataType === "lifecycle_state") {
    return {
      text: String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      kind: "text",
    };
  }
  if (dataType === "reference") {
    const str = String(value);
    const resolved = resolvedRefs.get(str);
    if (resolved) return { text: resolved, kind: "text" };
    if (/^[0-9a-f-]{36}$/i.test(str)) return { text: str.slice(0, 8) + "…", kind: "text" };
    return { text: str, kind: "text" };
  }
  return { text: String(value), kind: "text" };
}

function normaliseFieldValueForEdit(value: unknown, field: EntityField): unknown {
  if (!value || typeof value !== "string") return value;
  if (field.data_type === "date") return value.split("T")[0] ?? value;
  if (field.data_type === "datetime" || field.data_type === "timestamptz") return value.slice(0, 16);
  return value;
}

function documentHeaderActionKey(action: HeaderAction): string {
  if (action.id === "edit" || action.id === "update") return "edit";
  if (action.label.trim().toLowerCase() === "edit") return "edit";
  return action.id;
}

function dedupeDocumentHeaderActions(actions: HeaderAction[]): HeaderAction[] {
  const seen = new Set<string>();
  const deduped: HeaderAction[] = [];

  for (const action of actions) {
    const key = documentHeaderActionKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(action);
  }

  return deduped;
}

function DocumentFieldsPanel({
  entity,
  data,
  resolvedRefs,
}: {
  entity: CompiledEntity;
  data: Record<string, unknown>;
  resolvedRefs: Map<string, string>;
}) {
  const grouped = buildDocumentFieldGroups(
    entity,
    entity.fields.filter(isDocumentDisplayField),
  );

  if (grouped.length === 0) return null;

  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <Card key={group.key}>
          <CardContent className="pt-5">
            <h4 className="mb-3 text-xs font-medium text-muted-foreground">
              {group.label}
            </h4>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => {
                const raw = data[field.name] ?? data[field.column_name ?? ""];
                const { text } = fmtFieldValue(raw, field.data_type, resolvedRefs);
                return (
                  <div key={field.name}>
                    <dt className="text-xs font-medium text-muted-foreground leading-normal mb-1">
                      {field.label ?? field.name}
                    </dt>
                    <dd className="text-sm font-normal text-foreground leading-snug">
                      {text}
                    </dd>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Inline title editor ───────────────────────────────────────────────────────

function DocumentEditableFieldsPanel({
  entity,
  data,
  fieldErrors,
  onFieldChange,
}: {
  entity: CompiledEntity;
  data: Record<string, unknown>;
  fieldErrors: Record<string, string>;
  onFieldChange: (name: string, value: unknown) => void;
}) {
  const grouped = buildDocumentFieldGroups(
    entity,
    entity.fields.filter(isDocumentEditableField),
  );

  if (grouped.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-muted-foreground">No editable draft fields are configured.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <Card key={group.key}>
          <CardContent className="pt-5">
            <h4 className="mb-3 text-xs font-medium text-muted-foreground">
              {group.label}
            </h4>
            <div className="grid grid-cols-1 gap-x-4 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => {
                const Renderer = resolveFieldRenderer(field);
                const value = normaliseFieldValueForEdit(data[field.name] ?? data[field.column_name ?? ""], field);
                const error = fieldErrors[field.name];
                return (
                  <div key={field.name} className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground leading-normal">
                      {field.label ?? field.name}
                      {field.is_required && <span className="ml-1 text-destructive">*</span>}
                    </label>
                    <Renderer
                      value={value}
                      field={field}
                      mode="edit"
                      formData={data}
                      onChange={(v) => onFieldChange(field.name, v)}
                      error={error}
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function InlineTitleEdit({
  value, titleField, entityCode, recordId, onSaved,
}: {
  value: string; titleField: string; entityCode: string; recordId: string;
  onSaved: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(value);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  async function commit() {
    const trimmed = draft.trim();
    if (trimmed === value) { setEditing(false); return; }
    setSaving(true); setError(false);
    try {
      const r = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ [titleField]: trimmed || null }) },
      );
      if (r.ok) { setEditing(false); onSaved(trimmed); }
      else setError(true);
    } catch { setError(true); }
    finally { setSaving(false); }
  }

  function cancel() { setDraft(value); setEditing(false); setError(false); }

  if (editing) {
    return (
      <div className="space-y-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter")  { e.preventDefault(); void commit(); }
            if (e.key === "Escape") { cancel(); }
          }}
          maxLength={200}
          disabled={saving}
          placeholder="Add invoice name…"
          className={cn(
            "w-full text-xl font-semibold bg-transparent border-0 border-b-2 outline-none py-0.5",
            "placeholder:text-muted-foreground/30 text-foreground",
            error ? "border-destructive" : "border-primary",
            saving && "opacity-50",
          )}
          autoFocus
        />
        <div className="flex items-center gap-3">
          <span className="text-2xs text-muted-foreground/50">
            {saving ? "Saving…" : error ? "Save failed — retry" : "Enter to save · Esc to cancel"}
          </span>
          <span className="text-2xs text-muted-foreground/30 ml-auto">{draft.length}/200</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-start gap-2 text-left w-full rounded-md -mx-1 px-1 py-0.5 hover:bg-muted/30 transition-colors"
      title="Click to rename"
    >
      {value ? (
        <span className="text-xl font-semibold text-foreground leading-snug">{value}</span>
      ) : (
        <span className="text-base text-muted-foreground/35 italic font-normal">Add invoice name…</span>
      )}
      <Pencil className="h-3.5 w-3.5 mt-1 text-muted-foreground/25 group-hover:text-muted-foreground/60 transition-colors opacity-0 group-hover:opacity-100 shrink-0" />
    </button>
  );
}

// ── Panel labels ──────────────────────────────────────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────

export function DocumentDetailPage({
  entity,
  record,
  operations,
  recordId,
  editMode = false,
}: DocumentDetailPageProps) {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const data        = record.data;

  const detailConfig  = resolveDetailConfig(entity);
  const resolvedTabs  = resolveTabs(entity, null, []);

  const resolvedDisplayConfig = resolveDisplayConfig(entity.display_config as Record<string, unknown>);
  const linesRenderer = resolveDocumentLinesRenderer(
    entity.entity_code,
    resolvedDisplayConfig.lines_renderer,
    resolvedTabs.includes("lines"),
  );
  const hasLinesSection = linesRenderer !== null;

  const opDispatch = useOperationDispatch({
    entityCode: entity.entity_code,
    recordId,
    recordUuid: record.id,
  });

  const statusNorm = getDocumentStatus(entity, record);
  const subResourceRecordId = record.id;
  const isJournalEntry = entity.entity_code.replace(/-/g, "_") === "journal_entry";
  const isEditableDraftStatus = statusNorm === "draft" || statusNorm === "created";
  const canEditDraft = isEditableDraftStatus && (
    operations === undefined ||
    operations.some((op) =>
      op.is_enabled &&
      (op.surface === "DETAIL" || op.surface === "BOTH") &&
      ["edit", "update"].includes(op.permission_code),
    )
  );
  const effectiveEditMode = editMode && canEditDraft;

  const [editBaseline, setEditBaseline] = useState<Record<string, unknown>>(data);
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>(data);
  const [fieldErrors, setFieldErrors]   = useState<Record<string, string>>({});
  const [saveError, setSaveError]       = useState<string | null>(null);
  const [savingDraft, setSavingDraft]   = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);

  useEffect(() => {
    setEditBaseline(data);
    setEditFormData(data);
    setFieldErrors({});
    setSaveError(null);
  }, [data]);

  const editableFieldNames = useMemo(
    () => new Set(entity.fields.filter(isDocumentEditableField).map((field) => field.name)),
    [entity.fields],
  );

  const editPatch = useMemo(() => {
    const patch: Record<string, unknown> = {};
    for (const fieldName of editableFieldNames) {
      if (!valuesEqual(editFormData[fieldName], editBaseline[fieldName])) {
        patch[fieldName] = editFormData[fieldName] ?? null;
      }
    }
    return patch;
  }, [editFormData, editBaseline, editableFieldNames]);

  const isDirty = Object.keys(editPatch).length > 0;
  const displayData = effectiveEditMode ? { ...data, ...editFormData } : data;

  const linesQuery = useQuery<{ data: DocumentLine[] }>({
    queryKey: ["record-lines", entity.entity_code, subResourceRecordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(subResourceRecordId)}/lines`,
        { signal },
      );
      if (!res.ok) throw new Error(`lines ${res.status}`);
      return res.json() as Promise<{ data: DocumentLine[] }>;
    },
    enabled: hasLinesSection,
    staleTime: 60_000,
    retry: 3,
    retryDelay: 1000,
  });

  const headerDisplayData = useMemo(() => {
    if (!isJournalEntry || !linesQuery.data) return displayData;
    const totals = journalTotalsFromLines(linesQuery.data.data ?? []);
    return {
      ...displayData,
      total_debit:  totals.totalDebit,
      total_credit: totals.totalCredit,
      line_count:   totals.lineCount,
    };
  }, [displayData, isJournalEntry, linesQuery.data]);

  const headerCurrencyCode = useMemo(() => {
    const dh = entity.display_config.document_header;
    const candidates = [
      dh?.currency_field ? headerDisplayData[dh.currency_field] : undefined,
      headerDisplayData["transaction_currency"],
      headerDisplayData["currency_code"],
      headerDisplayData["base_currency"],
      headerDisplayData["base_currency_code"],
    ];
    return candidates.map(normaliseCurrencyCode).find(Boolean) ?? "";
  }, [entity.display_config.document_header, headerDisplayData]);

  const { data: currencyMeta } = useQuery<CurrencyRefRow | null>({
    queryKey: ["ref", "currencies", "selected", headerCurrencyCode],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ search: headerCurrencyCode, limit: "20", status: "active" });
      const res = await fetch(`/api/relay/api/platform/ref/currencies?${params.toString()}`, { signal });
      if (!res.ok) return null;
      const body = await res.json() as { data?: CurrencyRefRow[] };
      return (body.data ?? []).find((row) => normaliseCurrencyCode(row.code) === headerCurrencyCode) ?? null;
    },
    enabled: Boolean(headerCurrencyCode),
    staleTime: 60 * 60 * 1000,
  });
  const currencyMinorUnits = currencyMeta?.minor_units ?? null;

  const orchestrator = buildOrchestratorFromRecord(entity, headerDisplayData, operations ?? [], statusNorm);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const refFields = useMemo(() => {
    return entity.fields
      .filter(
        (f) =>
          f.data_type === "reference" &&
          f.reference_config?.target_entity &&
          UUID_RE.test(String(data[f.name] ?? data[f.column_name ?? ""] ?? "")),
      )
      .map((f) => ({
        name: f.name,
        targetEntity: f.reference_config!.target_entity,
        optionConfig: resolveEntityPickerOptionConfig(f.reference_config),
        value: String(data[f.name] ?? data[f.column_name ?? ""]),
      }));
  }, [entity.fields, data]);

  const refQueries = useQueries({
    queries: refFields.map(({ targetEntity, value }) => ({
      queryKey: ["entity-ref", targetEntity, value],
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const res = await fetch(
          `/api/relay/api/records/${encodeURIComponent(targetEntity)}/${encodeURIComponent(value)}`,
          { signal },
        );
        if (!res.ok) return null;
        return res.json() as Promise<{ data: Record<string, unknown> }>;
      },
      staleTime: 5 * 60 * 1000,
    })),
  });

  const titleField = entity.display_config.document_header?.title_field as string | undefined;
  const [liveTitle, setLiveTitle] = useState(() =>
    titleField ? String(data[titleField] ?? "") : "",
  );

  const partyIdField = entity.display_config.document_header?.party_id_field;
  const partyId = partyIdField ? String(data[partyIdField] ?? "") : "";

  const partyRefEntity = useMemo(() => {
    if (!partyIdField) return null;
    const field = entity.fields.find((f) => f.name === partyIdField);
    return field?.reference_config?.target_entity ?? null;
  }, [entity, partyIdField]);

  const { data: partyRecord } = useQuery<{ data: Record<string, unknown> } | null>({
    queryKey: ["entity-ref", partyRefEntity, partyId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(partyRefEntity!)}/${encodeURIComponent(partyId)}`,
        { signal },
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ data: Record<string, unknown> }>;
    },
    enabled: !!partyRefEntity && UUID_RE.test(partyId),
    staleTime: 5 * 60 * 1000,
  });

  const resolvedPartyName = useMemo<string | null>(() => {
    if (!partyRecord?.data) return null;
    const d = partyRecord.data;
    for (const key of ["name", "legal_name", "trade_name", "display_name"]) {
      const val = d[key];
      if (val && typeof val === "string" && val.trim()) return val.trim();
    }
    return null;
  }, [partyRecord]);

  const companyCodeId = String(data["company_code_id"] ?? "");
  const companyCodeRefEntity = useMemo(() => {
    const field = entity.fields.find((f) => f.name === "company_code_id");
    return field?.reference_config?.target_entity ?? null;
  }, [entity]);

  const { data: companyCodeRecord } = useQuery<{ data: Record<string, unknown> } | null>({
    queryKey: ["entity-ref", companyCodeRefEntity, companyCodeId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(companyCodeRefEntity!)}/${encodeURIComponent(companyCodeId)}`,
        { signal },
      );
      if (!res.ok) return null;
      return res.json() as Promise<{ data: Record<string, unknown> }>;
    },
    enabled: !!companyCodeRefEntity && UUID_RE.test(companyCodeId),
    staleTime: 5 * 60 * 1000,
  });

  const resolvedCompanyCode = useMemo<{ code: string; name: string } | null>(() => {
    if (!companyCodeRecord?.data) return null;
    const d = companyCodeRecord.data;
    const code = d["code"];
    const name = d["name"];
    if (!code || typeof code !== "string") return null;
    return {
      code: code.trim(),
      name: typeof name === "string" ? name.trim() : code.trim(),
    };
  }, [companyCodeRecord]);

  const partyCode = partyRecord?.data?.["code"];

  const resolvedRefs = useMemo(() => {
    const m = new Map<string, string>();
    refFields.forEach(({ value, targetEntity, optionConfig }, i) => {
      const result = refQueries[i]?.data;
      if (!result?.data) return;
      const label = entityRowToPickerOption(result.data, targetEntity, optionConfig).label || null;
      if (label) m.set(value, label);
    });
    if (partyId && resolvedPartyName) m.set(partyId, resolvedPartyName);
    if (companyCodeId && resolvedCompanyCode) {
      m.set(companyCodeId, `${resolvedCompanyCode.code} · ${resolvedCompanyCode.name}`);
    }
    return m;
  }, [refFields, refQueries, partyId, resolvedPartyName, companyCodeId, resolvedCompanyCode]);

  const hasAmountBreakdown = orchestrator.amountBreakdown.length > 0;
  const tabs = [
    { id: "__overview", label: "Overview" },
    ...(hasLinesSection                         ? [{ id: "__lines",         label: "Items" }]         : []),
    ...(resolvedTabs.includes("distributions") ? [{ id: "__distributions", label: "Accounting" }]    : []),
    ...(resolvedTabs.includes("workflow")      ? [{ id: "__workflow",      label: "Workflow" }]      : []),
    ...(resolvedTabs.includes("approvals")     ? [{ id: "__approvals",     label: "Approvals" }]     : []),
    ...(resolvedTabs.includes("versions")      ? [{ id: "__versions",      label: "Versions" }]      : []),
    ...(resolvedTabs.includes("tasks")         ? [{ id: "__tasks",         label: "Tasks" }]         : []),
    ...(resolvedTabs.includes("watchers")      ? [{ id: "__watchers",      label: "Watchers" }]      : []),
    ...(resolvedTabs.includes("rules")         ? [{ id: "__rules",         label: "Rules" }]         : []),
    ...(resolvedTabs.includes("integrations")  ? [{ id: "__integrations",  label: "Integrations" }]  : []),
    ...(resolvedTabs.includes("quality")       ? [{ id: "__quality",       label: "Quality" }]       : []),
    ...(resolvedTabs.includes("reports")       ? [{ id: "__reports",       label: "Reports" }]       : []),
  ];

  const headerModelBase = buildDocumentHeaderModel(entity, headerDisplayData, {
    statusDimensions:    orchestrator.statusDimensions ?? [],
    actionBundle:        orchestrator.actionBundle,
    resolvedPartyName:   resolvedPartyName ?? undefined,
    resolvedPartyCode:   partyCode && typeof partyCode === "string" ? partyCode.trim() : undefined,
    resolvedCompanyCode: resolvedCompanyCode ?? undefined,
    currencyMinorUnits,
    tabs,
  });

  const headerModel = useMemo(() => {
    const busy = savingDraft || submittingDraft || opDispatch.isSubmitting;
    const model = {
      ...headerModelBase,
      identity: { ...headerModelBase.identity },
      actions:  dedupeDocumentHeaderActions(headerModelBase.actions),
    };

    const hasEdit = model.actions.some((action) => documentHeaderActionKey(action) === "edit");
    if (!effectiveEditMode && canEditDraft && !hasEdit) {
      model.actions = [
        { id: "edit", label: "Edit", placement: "primary", order: 1, icon: "pencil" },
        ...model.actions.map((action) => ({ ...action, order: action.order + 10 })),
      ];
    }

    if (effectiveEditMode) {
      const submitAction = model.actions.find((action) => action.id === "submit")
        ?? (
          isJournalEntry &&
          (statusNorm === "draft" || statusNorm === "created") &&
          (operations === undefined || operations.some((op) => op.is_enabled && op.permission_code === "submit"))
            ? {
                id:        "submit",
                label:     "Submit",
                placement: "primary" as const,
                order:     2,
                icon:      "send",
              }
            : undefined
        );
      if (isDirty) {
        model.identity.status = {
          label:  "Unsaved changes",
          intent: "warning" as const,
        };
      }
      model.actions = [
        {
          id:        "__document_save",
          label:     "Save",
          placement: "primary",
          order:     1,
          disabled:  busy,
          pending:   savingDraft,
          icon:      "save",
        },
        ...(submitAction
          ? [{
              ...submitAction,
              placement: "primary" as const,
              order:     2,
              disabled:  submitAction.disabled || busy,
              pending:   submittingDraft || opDispatch.isSubmitting,
            }]
          : []),
        {
          id:        "__document_discard",
          label:     "Discard",
          placement: "secondary",
          order:     3,
          disabled:  busy,
        },
      ];
    }

    return model;
  }, [
    headerModelBase,
    effectiveEditMode,
    canEditDraft,
    isDirty,
    savingDraft,
    submittingDraft,
    opDispatch.isSubmitting,
    isJournalEntry,
    statusNorm,
    operations,
  ]);

  const overviewRail = useRailState(headerModel.progress);

  const [activeTab,   setActiveTab]   = useState(tabs[0]?.id ?? "");
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [panelCount,  setPanelCount]  = useState<number | null>(null);

  // ── Platform panel counts ─────────────────────────────────────────────────────
  // Fetched eagerly so badge counts appear on load — same pattern as MasterDetailPage.
  // Shared query keys → cache is reused when the panel opens.
  const hasPlatformComments    = resolvedTabs.includes("comments");
  const hasPlatformAttachments = resolvedTabs.includes("attachments");

  const commentsCountQuery = useQuery<{ data: unknown[]; hasMore: boolean }>({
    queryKey: ["collab-comments", entity.entity_code, record.id],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ entityType: entity.entity_code, entityId: record.id, limit: "200" });
      const res = await fetch(`/api/collab/comments?${params}`, { signal, cache: "no-store" });
      if (!res.ok) return { data: [], hasMore: false };
      return res.json() as Promise<{ data: unknown[]; hasMore: boolean }>;
    },
    staleTime: 30_000,
    enabled: hasPlatformComments,
  });

  const attachmentsCountQuery = useQuery<{ size_bytes: number; status?: string; visibility?: string }[]>({
    queryKey: ["attachments", entity.entity_code, record.id],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/documents/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(record.id)}/attachments`,
        { signal },
      );
      if (!res.ok) return [];
      return res.json() as Promise<{ size_bytes: number; status?: string; visibility?: string }[]>;
    },
    staleTime: 30_000,
    enabled: hasPlatformAttachments,
  });

  const commentsCount          = commentsCountQuery.data?.data?.length ?? 0;
  const attachmentsData        = attachmentsCountQuery.data ?? [];
  const attachmentsCount       = attachmentsData.length;
  const attachmentsTotalBytes  = attachmentsData.reduce((s, a) => s + (a.size_bytes ?? 0), 0);
  const attachmentsQuarantined = attachmentsData.filter((a) => a.status === "quarantined").length;
  const attachmentsShared      = attachmentsData.filter((a) => a.visibility === "shared_with_supplier").length;
  const attachmentsInternal    = attachmentsCount - attachmentsShared;

  // Build platform icons with live counts — identical contract to MasterDetailPage
  const platformIcons: PlatformPanelIcon[] = useMemo(() => {
    const icons: PlatformPanelIcon[] = [];
    if (hasPlatformComments)    icons.push({ id: "comments",    icon: <MessageSquare className="h-4 w-4" />, label: "Comments",    count: commentsCount    > 0 ? commentsCount    : undefined, countPending: hasPlatformComments    && commentsCountQuery.isPending });
    if (hasPlatformAttachments) icons.push({ id: "attachments", icon: <Paperclip     className="h-4 w-4" />, label: "Attachments", count: attachmentsCount > 0 ? attachmentsCount : undefined, countPending: hasPlatformAttachments && attachmentsCountQuery.isPending });
    if (resolvedTabs.includes("events")) icons.push({ id: "activity", icon: <Clock className="h-4 w-4" />, label: "Activity" });
    return icons;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlatformComments, hasPlatformAttachments, resolvedTabs.join(","), commentsCount, commentsCountQuery.isPending, attachmentsCount, attachmentsCountQuery.isPending]);

  const distQuery = useQuery<{ data: AccountingDistribution[] }>({
    queryKey: ["record-distributions", entity.entity_code, subResourceRecordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(subResourceRecordId)}/distributions`,
        { signal },
      );
      if (!res.ok) throw new Error(`distributions ${res.status}`);
      return res.json() as Promise<{ data: AccountingDistribution[] }>;
    },
    enabled: hasLinesSection || resolvedTabs.includes("distributions"),
    staleTime: 60_000,
    retry: 3,
    retryDelay: 1000,
  });

  function onLinesRefresh() {
    void queryClient.invalidateQueries({ queryKey: ["record-lines", entity.entity_code, subResourceRecordId] });
    void queryClient.invalidateQueries({ queryKey: ["record-distributions", entity.entity_code, subResourceRecordId] });
    void queryClient.invalidateQueries({ queryKey: ["entity-detail", entity.entity_code, recordId] });
    void queryClient.invalidateQueries({ queryKey: ["entity-list", entity.entity_code] });
  }

  function handleDocumentFieldChange(name: string, value: unknown) {
    setEditFormData((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next = { ...prev };
      for (const fieldName of validationFieldsAffectedByChange(entity.fields, name)) {
        delete next[fieldName];
      }
      return next;
    });
    setSaveError(null);
  }

  function resetDraftChanges() {
    setEditFormData(editBaseline);
    setFieldErrors({});
    setSaveError(null);
  }

  function applyStatusToDetailCache(status: string | null) {
    if (!status) return;
    queryClient.setQueryData(
      queryKeys.entityDetail.byId(entity.entity_code, recordId),
      (current: unknown) => {
        if (!current || typeof current !== "object") return current;
        const cachedRecord = current as { status?: string; data?: Record<string, unknown> };
        return {
          ...cachedRecord,
          status,
          data: {
            ...(cachedRecord.data ?? {}),
            status,
          },
        };
      },
    );
  }

  async function refreshRecordState() {
    const detailKey = queryKeys.entityDetail.byId(entity.entity_code, recordId);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: detailKey }),
      record.id !== recordId
        ? queryClient.invalidateQueries({ queryKey: queryKeys.entityDetail.byId(entity.entity_code, record.id) })
        : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: queryKeys.entityList.byType(entity.entity_code) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowInbox.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.workflowInbox.count }),
      queryClient.invalidateQueries({ queryKey: ["record-workflow", entity.entity_code, recordId] }),
      queryClient.invalidateQueries({ queryKey: ["record-approvals", entity.entity_code, recordId] }),
      queryClient.invalidateQueries({ queryKey: ["activity", entity.entity_code] }),
    ]);
    await queryClient.refetchQueries({ queryKey: detailKey, exact: true });
  }

  function validateDraftChanges(): boolean {
    const nextErrors: Record<string, string> = {};
    for (const field of entity.fields) {
      if (!isDocumentEditableField(field) || !field.is_required) continue;
      const value = editFormData[field.name];
      if (value === undefined || value === null || value === "") {
        nextErrors[field.name] = `${field.label ?? field.name} is required`;
      }
    }
    const editableFields = entity.fields.filter(isDocumentEditableField);
    const metaValidation = validateMetaFieldRules(editableFields, editFormData);
    Object.assign(nextErrors, metaValidation.fieldErrors);
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function saveDraftChanges(): Promise<boolean> {
    if (!isDirty) return true;
    if (!validateDraftChanges()) return false;

    setSavingDraft(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(record.id)}`,
        {
          method:  "PATCH",
          headers: { "Content-Type": "application/json", "X-CSRF-Token": getCsrfToken() },
          body:    JSON.stringify({ data: editPatch }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const apiFieldErrors = fieldErrorsFromApiErrorBody(body);
        if (Object.keys(apiFieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...apiFieldErrors }));
          setSaveError(validationSummaryMessage(apiFieldErrors));
          return false;
        }
        const message = typeof body["message"] === "string"
          ? body["message"]
          : `Save failed (${res.status})`;
        setSaveError(message);
        return false;
      }

      const savedData = { ...editBaseline, ...editPatch };
      setEditBaseline(savedData);
      setEditFormData(savedData);
      if (titleField && typeof savedData[titleField] === "string") {
        setLiveTitle(savedData[titleField]);
      }
      await refreshRecordState();
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed. Please try again.");
      return false;
    } finally {
      setSavingDraft(false);
    }
  }

  async function submitJournalEntry(): Promise<boolean> {
    setSubmittingDraft(true);
    setSaveError(null);
    try {
      const res = await fetch(
        `/api/finance/journals/${encodeURIComponent(record.id)}/submit`,
        {
          method:  "POST",
          headers: { "X-CSRF-Token": getCsrfToken() },
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const message = typeof body["message"] === "string"
          ? body["message"]
          : typeof body["error"] === "string"
          ? body["error"]
          : `Submit failed (${res.status})`;
        setSaveError(message);
        return false;
      }
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      applyStatusToDetailCache(typeof body["status"] === "string" ? body["status"] : null);
      await refreshRecordState();
      await queryClient.invalidateQueries({ queryKey: ["record-lines", entity.entity_code, subResourceRecordId] });
      await queryClient.invalidateQueries({ queryKey: ["record-distributions", entity.entity_code, subResourceRecordId] });
      return true;
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Submit failed. Please try again.");
      return false;
    } finally {
      setSubmittingDraft(false);
    }
  }

  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entity.entity_code)
    : entity.entity_code;
  const drawerNumberField = entity.display_config.document_header?.number_field;
  const drawerNumber = drawerNumberField
    ? String(data[drawerNumberField] ?? recordId)
    : recordId;
  const drawerIdentityName =
    liveTitle && liveTitle !== drawerNumber
      ? liveTitle
      : resolvedPartyName;

  function handleTabChange(tabId: string) {
    setActiveTab(tabId);
  }

  function findOperation(action: string): EntityOperation | undefined {
    const candidates = action === "edit" ? ["edit", "update"] : [action];
    return (operations ?? []).find((op) => candidates.includes(op.permission_code));
  }

  async function handleHeaderAction(action: string) {
    if (effectiveEditMode) {
      if (action === "__document_save") {
        const saved = await saveDraftChanges();
        if (saved) {
          router.push(`/app/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}`);
        }
        return;
      }
      if (action === "__document_discard" || action === "__document_exit") {
        resetDraftChanges();
        router.push(`/app/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}`);
        return;
      }
      if (action === "submit") {
        const saved = await saveDraftChanges();
        if (!saved) return;
        if (isJournalEntry) {
          const submitted = await submitJournalEntry();
          if (submitted) {
            router.push(`/app/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}`);
          }
          return;
        }
        await opDispatch.dispatch(action, operations ?? []);
        return;
      }
    }

    if (action === "submit" && isJournalEntry) {
      const submitted = await submitJournalEntry();
      if (submitted) {
        router.push(`/app/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}`);
      }
      return;
    }

    if (action === "edit" || action === "update") {
      router.push(`/app/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}?mode=edit`);
      return;
    }
    if (action === "copy") { void navigator.clipboard?.writeText(title); return; }
    if (action === "view_je") {
      const jeId = record.data["ap_je_id"] as string | null | undefined;
      if (jeId) { router.push(`/app/journal_entry/${jeId}`); }
      return;
    }
    const op = findOperation(action);
    if (op?.handler_type === "NAVIGATE" && op.handler_target) {
      const url = op.handler_target
        .replace(/\{id\}/g, record.id)
        .replace(/\{recordId\}/g, recordId);
      router.push(url);
      return;
    }
    if (action === "allocate_payment") {
      router.push(`/finance/ap?invoice=${record.id}`);
      return;
    }
    await opDispatch.dispatch(action, operations ?? []);
  }

  return (
    <>
      <EntityHeader
        model={{ ...headerModel, statuses: undefined, progress: undefined, facts: headerModel.facts?.filter((f) => f.xl) }}
        onBack={() => router.back()}
        editMode={effectiveEditMode}
        onAction={(action) => { void handleHeaderAction(action); }}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        platformIcons={platformIcons.length > 0 ? platformIcons : undefined}
        onPlatformIconClick={(id) => setActivePanel((prev) => (prev === id ? null : id))}
        activePlatformIcon={activePanel ?? undefined}
      />
      <ValidationBanner notices={orchestrator.validationNotices ?? []} />
      <div className="flex flex-col gap-2.5">
        {activeTab === "__overview" && (
          <div className="space-y-5">
            {(headerModel.progress || (headerModel.statuses?.length ?? 0) > 0) && (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <EntityProgressRow
                  progress={headerModel.progress}
                  statuses={headerModel.statuses}
                  railExpanded={overviewRail.expanded}
                  onToggleRail={overviewRail.toggle}
                  className="border-t-0"
                />
              </div>
            )}
            {hasAmountBreakdown && (
              <AmountSummaryCard lines={orchestrator.amountBreakdown} />
            )}
            {effectiveEditMode ? (
              <>
                {saveError && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {saveError}
                  </div>
                )}
                <DocumentEditableFieldsPanel
                  entity={entity}
                  data={editFormData}
                  fieldErrors={fieldErrors}
                  onFieldChange={handleDocumentFieldChange}
                />
              </>
            ) : (
              <DocumentFieldsPanel
                entity={entity}
                data={data}
                resolvedRefs={resolvedRefs}
              />
            )}
          </div>
        )}

        {activeTab === "__lines" && (
          <Card className="overflow-hidden">
            <LinesPanel
              entity={entity}
              entityCode={entity.entity_code}
              recordId={subResourceRecordId}
              recordUuid={record.id}
              companyCodeId={companyCodeId}
              record={displayData}
              lines={linesQuery.data?.data ?? []}
              distributions={distQuery.data?.data ?? []}
              isLoading={linesQuery.isLoading}
              onRefresh={onLinesRefresh}
              linesRenderer={linesRenderer ?? "generic"}
              hasAiClassification={Boolean(entity.feature_flags?.["has_ai_classification"])}
              hasLineComposer={Boolean(entity.feature_flags?.["has_line_composer"])}
              editMode={effectiveEditMode}
              currencyMinorUnits={currencyMinorUnits}
            />
          </Card>
        )}

        {activeTab === "__distributions" && (
          <Card>
            <CardContent className="pt-5">
              <DistributionsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__workflow" && (
          <Card>
            <CardContent className="pt-5">
              <WorkflowSummaryPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__versions" && (
          <Card>
            <CardContent className="pt-5">
              <VersionsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__approvals" && (
          <Card>
            <CardContent className="pt-5">
              <ApprovalsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__tasks" && (
          <Card>
            <CardContent className="pt-5">
              <TasksPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__watchers" && (
          <Card>
            <CardContent className="pt-5">
              <WatchersPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__rules" && (
          <Card>
            <CardContent className="pt-5">
              <RulesPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__integrations" && (
          <Card>
            <CardContent className="pt-5">
              <IntegrationsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__quality" && (
          <Card>
            <CardContent className="pt-5">
              <QualityPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {activeTab === "__reports" && (
          <Card>
            <CardContent className="pt-5">
              <ReportsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

      </div>

      {/* Platform context panels — resizable context drawer, same as master entity */}
      <EntityContextDrawer
        open={activePanel !== null}
        onOpenChange={(open) => { if (!open) setActivePanel(null); }}
        activePanel={activePanel}
        widthScope="document"
        entity={entity}
        recordId={recordId}
        recordData={data}
        identityName={drawerIdentityName}
        panelCount={panelCount}
        attachments={{
          count:            attachmentsCount,
          totalBytes:       attachmentsTotalBytes,
          internalCount:    attachmentsInternal,
          sharedCount:      attachmentsShared,
          quarantinedCount: attachmentsQuarantined,
        }}
        headerRight={activePanel === "comments" ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Search comments"
                  className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <Search className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Search comments</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Filter comments"
                  className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <SlidersHorizontal className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Filter comments</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : undefined}
      >
        <div className="px-6 py-5">
          {activePanel === "comments" && (
            <CommentsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} onCountChange={setPanelCount} />
          )}
          {activePanel === "attachments" && (
            <AttachmentsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} />
          )}
          {activePanel === "activity" && (() => {
            // Resolve field names via document_header config, fall back to standard names
            const dh = entity.display_config?.document_header as Record<string, string> | undefined;
            return (
              <>
                <AuditMetaCard
                  createdAt={dh?.created_at_field ? data[dh.created_at_field] : data["created_at"]}
                  createdBy={dh?.created_by_field ? data[dh.created_by_field] : data["created_by"]}
                  updatedAt={dh?.updated_at_field ? data[dh.updated_at_field] : data["updated_at"]}
                  updatedBy={dh?.updated_by_field ? data[dh.updated_by_field] : data["updated_by"]}
                />
                <EventsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} />
              </>
            );
          })()}
        </div>
      </EntityContextDrawer>

      {opDispatch.isModalOpen && opDispatch.activeBundle && (
        <FlowModal
          open={opDispatch.isModalOpen}
          onClose={opDispatch.closeModal}
          bundle={opDispatch.activeBundle}
          userPermissions={opDispatch.activeBundle.user_permissions}
          onSubmit={opDispatch.submitModal}
          submitting={opDispatch.isSubmitting}
        />
      )}
    </>
  );
}
