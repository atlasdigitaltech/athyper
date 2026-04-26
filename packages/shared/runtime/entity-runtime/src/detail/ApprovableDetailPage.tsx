"use client";

/**
 * @athyper/entity-runtime — Generic Approvable Document Detail Page
 *
 * Full-page renderer for DOCUMENT entities with is_approvable = true.
 * Dispatched by EntityDetailPage when resolveRendererFamily() returns "approvable".
 *
 * All tabs are resolved via resolveTabs() — no hardcoded tab list.
 * Tabs: overview | lines | distributions | workflow | attachments | versions |
 *       comments | approvals | tasks | watchers | rules | integrations |
 *       quality | reports | events | [field-group sections]
 *
 * Versions tab renders inline as a panel (same pattern as all other tabs).
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueries, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  ArrowLeftRight, CheckCircle2, Clock,
  FileClock, GitBranch, RotateCcw, XCircle,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Badge, Button, Card, CardContent,
  Skeleton, Tooltip, TooltipContent, TooltipTrigger,
} from "@athyper/ui/primitives";
import type { RecordVersionSummary } from "@athyper/api-contracts/records";
import type { DocumentLine, AccountingDistribution } from "@athyper/api-contracts/documents";
import {
  buildOrchestratorFromRecord,
  mapDocumentHeaderModel,
  AmountSummaryCard,
  FlowModal,
  ValidationBanner,
} from "@athyper/document-runtime";
import { EntityHeader } from "../header";
import { resolveLinesRenderer } from "@athyper/runtime-shared/renderer-registry";
import { resolvePresentationConfig as resolveDisplayConfig } from "../metadata";
import { useOperationDispatch } from "../actions/useOperationDispatch";
import { resolveDetailConfig, resolveTabs } from "@athyper/metadata-client/compiled-reader";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import { resolveFieldRenderer } from "../field-renderers/registry";
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
  DistributionsPanel,
} from "../panels";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ApprovableDetailPageProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  /** Canonical business key from the URL [id] segment — used for sub-resource BFF calls */
  recordId:   string;
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

// LinesPanel is a pure display component — queries are lifted to ApprovableDetailPage
// so data is prefetched on page load, not on first tab click.
// Renderer is resolved from display_config.lines_renderer via the runtime-shared
// registry — no entity-code branching here.
function LinesPanel({
  entityCode, recordId, companyCodeId, record,
  lines, distributions, isLoading, onRefresh, linesRenderer,
  hasAiClassification, hasLineComposer,
}: {
  entityCode: string; recordId: string;
  companyCodeId?: string; record?: Record<string, unknown>;
  lines: DocumentLine[];
  distributions: AccountingDistribution[];
  isLoading: boolean;
  onRefresh: () => void;
  linesRenderer: string;
  hasAiClassification?: boolean;
  hasLineComposer?: boolean;
}) {
  const RendererComponent = resolveLinesRenderer(linesRenderer);
  if (!RendererComponent) return null;

  const currencyCode =
    typeof record?.["transaction_currency"] === "string" ? record["transaction_currency"]
    : typeof record?.["currency_code"]       === "string" ? record["currency_code"]
    : "USD";

  return (
    <RendererComponent
      entityCode={entityCode}
      recordId={recordId}
      companyCodeId={companyCodeId}
      record={record}
      lines={lines}
      distributions={distributions}
      isLoading={isLoading}
      onRefresh={onRefresh}
      currencyCode={currencyCode}
      hasAiClassification={hasAiClassification}
      hasLineComposer={hasLineComposer}
    />
  );
}

// ── Versions panel ────────────────────────────────────────────────────────────

interface VersionListResponse {
  data: RecordVersionSummary[];
  current_version_no: number;
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
            <Badge variant={versionStatusVariant(version.status)} className="capitalize text-[10px]">
              {version.status}
            </Badge>
            {version.is_current && <Badge variant="info" className="text-[10px]">Current</Badge>}
            {isPinned        && <Badge variant="secondary" className="text-[10px]">Selected</Badge>}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {canCompareWith ? (
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
            ) : (
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
        <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground/50">
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
// Groups entity fields by sort_order bands — matches the band conventions used
// across the entity engine seed files (A:0-39, B:40-69, C:70-119, D:120-149,
// E:150-179, F:200+). No field_groups seed required.

const FIELD_BANDS = [
  { key: "identity",     label: "Identity & Classification", min: 0,   max: 39  },
  { key: "counterparty", label: "Counterparty & Dates",      min: 40,  max: 69  },
  { key: "amounts",      label: "Currency & Amounts",         min: 70,  max: 119 },
  { key: "references",   label: "References & Terms",         min: 120, max: 149 },
  { key: "matching",     label: "Matching & Hold",            min: 150, max: 179 },
  { key: "dimensions",   label: "Dimensions & Fiscal",        min: 200, max: 999 },
] as const;

// Fields shown in the identity card / KPI strip — omit from the detail grid
// to avoid duplication between the sticky header and the body.
const HEADER_DISPLAY_FIELDS = new Set([
  "document_no", "status", "code", "name",
]);

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

function DocumentFieldsPanel({
  entity,
  data,
  resolvedRefs,
}: {
  entity: CompiledEntity;
  data: Record<string, unknown>;
  resolvedRefs: Map<string, string>;
}) {
  const grouped = FIELD_BANDS.map((band) => ({
    ...band,
    fields: entity.fields
      .filter((f) =>
        !HEADER_DISPLAY_FIELDS.has(f.name) &&
        f.data_type !== "lifecycle_state" &&
        (f.sort_order ?? 0) >= band.min &&
        (f.sort_order ?? 0) <= band.max,
      )
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
  })).filter((g) => g.fields.length > 0);

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

// ── Main component ────────────────────────────────────────────────────────────

export function ApprovableDetailPage({
  entity,
  record,
  operations,
  recordId,
}: ApprovableDetailPageProps) {
  const router  = useRouter();
  const data    = record.data;

  const detailConfig  = resolveDetailConfig(entity);
  const resolvedTabs  = resolveTabs(entity, null, []);

  // display_config v2 — lines_renderer drives which tab/renderer is active.
  // Fallback: if lines_renderer isn't set but feature_flags.has_lines is true,
  // default to "generic" so entities seeded before the display_config backfill
  // still show the Lines tab.
  const resolvedDisplayConfig = resolveDisplayConfig(entity.display_config as Record<string, unknown>);
  const linesRenderer = resolvedDisplayConfig.lines_renderer
    ?? (resolvedTabs.includes("lines") ? "generic" : null);
  const hasLinesSection = linesRenderer !== null;

  // ── MODAL operation dispatch ───────────────────────────────────────────────
  // Handles entity_operation rows where handler_type='MODAL'. Fetches the
  // named flow bundle (handler_target='flow:<code>'), then renders FlowModal.
  const opDispatch = useOperationDispatch({
    entityCode: entity.entity_code,
    recordId,
    recordUuid: record.id,
  });

  // Orchestrator
  const orchestrator = buildOrchestratorFromRecord(entity, data, operations ?? []);

  // ── Reference resolution helpers ──────────────────────────────────────────
  // All UUID reference fields are resolved via the BFF relay:
  //   GET /api/relay/api/records/:refEntity/:id
  // This is a plain fetch() wrapped in useQuery — NOT Kysely (server-only).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // Collect ALL reference fields that carry a UUID value — driven entirely by
  // entity_field.reference_config.target_entity (compiled from validation.ref_entity).
  // No hardcoding needed: every field with data_type="reference" and a valid UUID value
  // is resolved automatically.
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
        displayField: f.reference_config?.display_field ?? "name",
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

  // ── Company code resolution ────────────────────────────────────────────────
  // Resolves company_code_id (UUID) → { code, name } from master.company_code
  // via the same BFF relay pattern used for party resolution.
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

  // partyCode is used below when building the header model after tabs are assembled
  const partyCode = partyRecord?.data?.["code"];

  // ── Resolved refs map — UUID → display name for all known references ────────
  // Built from the generic refQueries batch (covers all reference fields) plus
  // explicit overrides for party and company_code (richer format with code+name).
  const resolvedRefs = useMemo(() => {
    const m = new Map<string, string>();
    // Generic resolution: payment_term, payment_method, cost_center, profit_center, site, etc.
    refFields.forEach(({ value, displayField }, i) => {
      const result = refQueries[i]?.data;
      if (!result?.data) return;
      const d = result.data;
      const label =
        (d[displayField] as string | undefined) ??
        (d["name"] as string | undefined) ??
        (d["code"] as string | undefined) ??
        null;
      if (label) m.set(value, label);
    });
    // Explicit overrides: party and company_code use richer display formats.
    if (partyId && resolvedPartyName) m.set(partyId, resolvedPartyName);
    if (companyCodeId && resolvedCompanyCode) {
      m.set(companyCodeId, `${resolvedCompanyCode.code} · ${resolvedCompanyCode.name}`);
    }
    return m;
  }, [refFields, refQueries, partyId, resolvedPartyName, companyCodeId, resolvedCompanyCode]);

  // Build ordered tab list
  const hasAmountBreakdown = orchestrator.amountBreakdown.length > 0;
  const sectionTabs = detailConfig.sections.map((s) => ({
    id:    s.group.group_key,
    label: s.group.label,
  }));

  const tabs = [
    { id: "__overview", label: "Overview" },
    ...sectionTabs,
    ...(hasLinesSection                         ? [{ id: "__lines",         label: "Lines" }]         : []),
    ...(resolvedTabs.includes("distributions") ? [{ id: "__distributions", label: "Distributions" }] : []),
    ...(resolvedTabs.includes("workflow")      ? [{ id: "__workflow",      label: "Workflow" }]      : []),
    ...(resolvedTabs.includes("attachments")   ? [{ id: "__attachments",   label: "Attachments" }]   : []),
    ...(resolvedTabs.includes("versions")      ? [{ id: "__versions",      label: "Versions" }]      : []),
    ...(resolvedTabs.includes("approvals")     ? [{ id: "__approvals",     label: "Approvals" }]     : []),
    ...(resolvedTabs.includes("tasks")         ? [{ id: "__tasks",         label: "Tasks" }]         : []),
    ...(resolvedTabs.includes("watchers")      ? [{ id: "__watchers",      label: "Watchers" }]      : []),
    ...(resolvedTabs.includes("rules")         ? [{ id: "__rules",         label: "Rules" }]         : []),
    ...(resolvedTabs.includes("integrations")  ? [{ id: "__integrations",  label: "Integrations" }]  : []),
    ...(resolvedTabs.includes("quality")       ? [{ id: "__quality",       label: "Quality" }]       : []),
    ...(resolvedTabs.includes("reports")       ? [{ id: "__reports",       label: "Reports" }]       : []),
    ...(resolvedTabs.includes("comments")      ? [{ id: "__comments",      label: "Comments" }]      : []),
    ...(resolvedTabs.includes("events")        ? [{ id: "__events",        label: "Activity" }]      : []),
  ];

  // ── Header model (Phase 5 — EntityHeader contract) ────────────────────────
  const headerModel = mapDocumentHeaderModel(entity, data, {
    statusDimensions:    orchestrator.statusDimensions ?? [],
    actionBundle:        orchestrator.actionBundle,
    resolvedPartyName:   resolvedPartyName ?? undefined,
    resolvedPartyCode:   partyCode && typeof partyCode === "string" ? partyCode.trim() : undefined,
    resolvedCompanyCode: resolvedCompanyCode ?? undefined,
    tabs,
    description:         typeof data["description"] === "string" && (data["description"] as string).trim()
      ? (data["description"] as string).trim()
      : undefined,
  });

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  // ── Lifted queries — prefetched on page load so tab switches are instant ───
  // Both queries share the same staleTime; onLinesRefresh invalidates both so
  // editing a line immediately refreshes the Distributions panel too.
  const queryClient = useQueryClient();

  const linesQuery = useQuery<{ data: DocumentLine[] }>({
    queryKey: ["record-lines", entity.entity_code, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}/lines`,
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

  const distQuery = useQuery<{ data: AccountingDistribution[] }>({
    queryKey: ["record-distributions", entity.entity_code, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}/distributions`,
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
    void queryClient.invalidateQueries({ queryKey: ["record-lines", entity.entity_code, recordId] });
    void queryClient.invalidateQueries({ queryKey: ["record-distributions", entity.entity_code, recordId] });
  }

  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entity.entity_code)
    : entity.entity_code;

  function handleTabChange(tabId: string) {
    setActiveTab(tabId);
  }

  return (
    <>
      <EntityHeader
        model={headerModel}
        onBack={() => router.back()}
        onAction={async (action) => {
          if (action === "copy") { void navigator.clipboard?.writeText(title); return; }
          if (action === "view_je") {
            const jeId = record.data["ap_je_id"] as string | null | undefined;
            if (jeId) { router.push(`/app/journal_entry/${jeId}`); }
            return;
          }
          const op = (operations ?? []).find((o) => o.permission_code === action);
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
        }}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
      <ValidationBanner notices={orchestrator.validationNotices ?? []} />
      <div className="flex flex-col gap-2.5">
        {/* Overview — amount summary + grouped header fields */}
        {activeTab === "__overview" && (
          <div className="space-y-5">
            {hasAmountBreakdown && (
              <AmountSummaryCard lines={orchestrator.amountBreakdown} />
            )}
            <DocumentFieldsPanel
              entity={entity}
              data={data}
              resolvedRefs={resolvedRefs}
            />
          </div>
        )}

        {/* Field-group section tabs (skip the first — it's shown in overview) */}
        {detailConfig.sections.map((section, idx) =>
          activeTab === section.group.group_key && idx > 0 ? (
            <Card key={section.group.group_key}>
              <CardContent className="pt-5">
                <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
                  {section.fields.map((field) => {
                    const Renderer = resolveFieldRenderer(field);
                    return (
                      <div key={field.name}>
                        <dt className="text-xs font-medium text-muted-foreground leading-normal mb-1">
                          {field.label ?? field.name}
                        </dt>
                        <dd className="text-sm font-normal text-foreground leading-snug">
                          <Renderer value={data[field.name]} field={field} mode="view" />
                        </dd>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : null,
        )}

        {/* Lines */}
        {activeTab === "__lines" && (
          <Card className="overflow-hidden">
            <LinesPanel
              entityCode={entity.entity_code}
              recordId={recordId}
              companyCodeId={companyCodeId}
              record={data}
              lines={linesQuery.data?.data ?? []}
              distributions={distQuery.data?.data ?? []}
              isLoading={linesQuery.isLoading}
              onRefresh={onLinesRefresh}
              linesRenderer={linesRenderer ?? "generic"}
              hasAiClassification={Boolean(entity.feature_flags?.["has_ai_classification"])}
              hasLineComposer={Boolean(entity.feature_flags?.["has_line_composer"])}
            />
          </Card>
        )}

        {/* Distributions */}
        {activeTab === "__distributions" && (
          <Card>
            <CardContent className="pt-5">
              <DistributionsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Workflow */}
        {activeTab === "__workflow" && (
          <Card>
            <CardContent className="pt-5">
              <WorkflowSummaryPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Attachments */}
        {activeTab === "__attachments" && (
          <Card>
            <CardContent className="pt-5">
              <AttachmentsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Versions */}
        {activeTab === "__versions" && (
          <Card>
            <CardContent className="pt-5">
              <VersionsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Approvals */}
        {activeTab === "__approvals" && (
          <Card>
            <CardContent className="pt-5">
              <ApprovalsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Tasks */}
        {activeTab === "__tasks" && (
          <Card>
            <CardContent className="pt-5">
              <TasksPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Watchers */}
        {activeTab === "__watchers" && (
          <Card>
            <CardContent className="pt-5">
              <WatchersPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Rules */}
        {activeTab === "__rules" && (
          <Card>
            <CardContent className="pt-5">
              <RulesPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Integrations */}
        {activeTab === "__integrations" && (
          <Card>
            <CardContent className="pt-5">
              <IntegrationsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Quality */}
        {activeTab === "__quality" && (
          <Card>
            <CardContent className="pt-5">
              <QualityPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Reports */}
        {activeTab === "__reports" && (
          <Card>
            <CardContent className="pt-5">
              <ReportsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Comments */}
        {activeTab === "__comments" && (
          <Card>
            <CardContent className="pt-5">
              <CommentsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}

        {/* Activity */}
        {activeTab === "__events" && (
          <Card>
            <CardContent className="pt-5">
              <EventsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* MODAL-type operation overlay — rendered outside the layout div so it sits
          at the top of the stacking context, not inside the header scroll. */}
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
