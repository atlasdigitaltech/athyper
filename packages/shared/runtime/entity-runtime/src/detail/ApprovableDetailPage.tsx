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
 * Versions tab navigates to /app/:entity/:id/versions (does not render inline).
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import {
  ApprovableDocumentShell,
  buildOrchestratorFromRecord,
  buildApprovableHeaderFromRecord,
  AmountSummaryCard,
  LinesGrid,
  FlowModal,
  type ApprovableReference,
} from "@athyper/document-runtime";
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

function LinesPanel({ entityCode, recordId }: { entityCode: string; recordId: string }) {
  const qc = useQueryClient();

  const linesQuery = useQuery<{ data: import("@athyper/api-contracts/documents").DocumentLine[] }>({
    queryKey: ["record-lines", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: import("@athyper/api-contracts/documents").DocumentLine[] }>;
    },
    staleTime: 60_000,
  });

  const distQuery = useQuery<{ data: import("@athyper/api-contracts/documents").AccountingDistribution[] }>({
    queryKey: ["record-distributions", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/distributions`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: import("@athyper/api-contracts/documents").AccountingDistribution[] }>;
    },
    staleTime: 60_000,
  });

  function handleRefresh() {
    void qc.invalidateQueries({ queryKey: ["record-lines",         entityCode, recordId] });
    void qc.invalidateQueries({ queryKey: ["record-distributions", entityCode, recordId] });
  }

  return (
    <LinesGrid
      entityCode={entityCode}
      recordId={recordId}
      lines={linesQuery.data?.data ?? []}
      distributions={distQuery.data?.data ?? []}
      isLoading={linesQuery.isLoading}
      onRefresh={handleRefresh}
    />
  );
}

// ── Field-schema → rendering hint ────────────────────────────────────────────
// Maps entity field data_type to ApprovableReference.valueType so the KPI
// strip can render values correctly without guessing from the label string.

function resolveRefMeta(
  entity: CompiledEntity,
  fieldName: string,
  fallbackLabel: string,
): { label: string; valueType: ApprovableReference["valueType"] } {
  const field = entity.fields.find(
    (f) => f.name === fieldName || f.column_name === fieldName,
  );
  const label = field?.label ?? fallbackLabel;
  let valueType: ApprovableReference["valueType"] = "text";
  if (field) {
    const dt = field.data_type;
    if (dt === "uuid" || dt === "reference")                             valueType = "code";
    else if (dt === "date" || dt === "datetime" || dt === "timestamptz") valueType = "date";
    else if (dt === "decimal" || dt === "numeric" || dt === "money")     valueType = "amount";
    else if (dt === "enum")                                              valueType = "enum";
    // integer/bigint are counts, years, sequence numbers — plain text
  }
  return { label, valueType };
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
            <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {group.label}
            </h4>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
              {group.fields.map((field) => {
                const raw = data[field.name] ?? data[field.column_name ?? ""];
                const { text } = fmtFieldValue(raw, field.data_type, resolvedRefs);
                return (
                  <div key={field.name}>
                    <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground leading-none mb-1.5">
                      {field.label ?? field.name}
                    </dt>
                    <dd className="text-sm font-semibold text-foreground leading-snug">
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

  // ── MODAL operation dispatch ───────────────────────────────────────────────
  // Handles entity_operation rows where handler_type='MODAL'. Fetches the
  // named flow bundle (handler_target='flow:<code>'), then renders FlowModal.
  const opDispatch = useOperationDispatch({
    entityCode: entity.entity_code,
    recordId,
  });

  // Orchestrator
  const orchestrator = buildOrchestratorFromRecord(entity, data, operations ?? []);

  // ── Reference resolution helpers ──────────────────────────────────────────
  // All UUID reference fields are resolved via the BFF relay:
  //   GET /api/relay/api/records/:refEntity/:id
  // This is a plain fetch() wrapped in useQuery — NOT Kysely (server-only).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // ── Header DTO ─────────────────────────────────────────────────────────────
  const headerData = buildApprovableHeaderFromRecord(entity, data);

  // Resolve party name (replaces raw UUID shown before async fetch completes)
  if (resolvedPartyName && headerData.party) {
    const words = resolvedPartyName.split(/\s+/);
    const initials =
      words.length === 1
        ? (words[0] ?? "").slice(0, 2).toUpperCase()
        : ((words[0]?.[0] ?? "") + (words[words.length - 1]?.[0] ?? "")).toUpperCase();
    const partyCode = partyRecord?.data?.["code"];
    const subtitle  = partyCode && typeof partyCode === "string" ? partyCode.trim() : undefined;
    headerData.party = { ...headerData.party, name: resolvedPartyName, initials, subtitle };
  }

  // Add key reference fields to the metadata row.
  // Label and valueType are derived from the entity field schema — no label guessing.
  const refs: ApprovableReference[] = [];
  const vendorRef = data["vendor_invoice_ref"] ?? data["supplier_invoice_number"];
  if (vendorRef && typeof vendorRef === "string" && vendorRef.trim()) {
    const { label, valueType } = resolveRefMeta(entity, "vendor_invoice_ref", "Vendor Ref");
    refs.push({ label, value: vendorRef.trim(), valueType });
  }
  // Company code — resolved from company_code_id UUID via master.company_code.
  // Shows "CC-001 · Acme Corp" when resolved; falls back to fiscal year context.
  if (resolvedCompanyCode) {
    refs.push({
      label:     "Company Code",
      value:     resolvedCompanyCode.name,
      subValue:  resolvedCompanyCode.code,
      valueType: "text",
    });
  } else {
    const fiscalYear = data["fiscal_year"];
    const periodNo   = data["period_number"];
    if (fiscalYear != null) {
      const { label } = resolveRefMeta(entity, "fiscal_year", "Fiscal Year");
      const value = periodNo != null ? `FY${fiscalYear} / P${periodNo}` : `FY${fiscalYear}`;
      refs.push({ label, value, valueType: "text" });
    }
  }
  const invoiceSource = data["invoice_source"];
  if (invoiceSource && typeof invoiceSource === "string") {
    const { label, valueType } = resolveRefMeta(entity, "invoice_source", "Source");
    refs.push({
      label,
      value: invoiceSource.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      valueType,
    });
  }
  const description = data["description"];
  if (description && typeof description === "string" && description.trim()) {
    refs.push({ label: "Description", value: description.trim(), valueType: "text" });
    if (!headerData.identity.title) {
      headerData.identity.title = description.trim();
    }
  }
  if (refs.length > 0) headerData.references = refs;

  // Remove the lifecycle dimension — it's already shown as the status badge
  // in the identity bar (identity.statusLabel). The strip should show only
  // the supplementary dimensions (accounting, settlement, matching).
  headerData.statusDimensions = (orchestrator.statusDimensions ?? []).filter(
    (d) => d.dimension !== "lifecycle",
  );
  headerData.actionBundle   = orchestrator.actionBundle;
  headerData.blockedReasons = orchestrator.blockedReasons;

  // ── Resolved refs map — UUID → display name for all known references ────────
  const resolvedRefs = useMemo(() => {
    const m = new Map<string, string>();
    if (partyId && resolvedPartyName) m.set(partyId, resolvedPartyName);
    if (companyCodeId && resolvedCompanyCode) {
      m.set(companyCodeId, `${resolvedCompanyCode.code} · ${resolvedCompanyCode.name}`);
    }
    return m;
  }, [partyId, resolvedPartyName, companyCodeId, resolvedCompanyCode]);

  // Build ordered tab list
  const hasAmountBreakdown = orchestrator.amountBreakdown.length > 0;
  const sectionTabs = detailConfig.sections.map((s) => ({
    id:    s.group.group_key,
    label: s.group.label,
  }));

  const tabs = [
    { id: "__overview", label: "Overview" },
    ...sectionTabs,
    ...(resolvedTabs.includes("lines")         ? [{ id: "__lines",         label: "Lines" }]         : []),
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

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entity.entity_code)
    : entity.entity_code;

  function handleTabChange(tabId: string) {
    if (tabId === "__versions") {
      router.push(
        `/app/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}/versions`,
      );
      return;
    }
    setActiveTab(tabId);
  }

  return (
    <PageFrame title={title}>
      <ApprovableDocumentShell
        data={headerData}
        persistMode
        validationNotices={orchestrator.validationNotices}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onAction={(action) => {
          if (action === "copy") { void navigator.clipboard?.writeText(title); return; }
          opDispatch.dispatch(action, operations ?? []);
        }}
      >
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {section.fields.map((field) => {
                    const Renderer = resolveFieldRenderer(field);
                    return (
                      <div key={field.name}>
                        <dt className="text-xs font-medium text-muted-foreground">
                          {field.label ?? field.name}
                        </dt>
                        <dd className="mt-1">
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
            <LinesPanel entityCode={entity.entity_code} recordId={recordId} />
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
              <EventsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        )}
      </ApprovableDocumentShell>

      {/* MODAL-type operation overlay — rendered outside the shell so it sits
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
    </PageFrame>
  );
}
