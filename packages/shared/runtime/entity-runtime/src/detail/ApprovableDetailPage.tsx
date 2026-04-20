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

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, Skeleton } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import {
  ApprovableDocumentShell,
  buildOrchestratorFromRecord,
  buildApprovableHeaderFromRecord,
  AmountSummaryCard,
  ItemsGrid,
} from "@athyper/document-runtime";
import { resolveDetailConfig, resolveTabs } from "@athyper/metadata-client/compiled-reader";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import type { DocumentLine } from "@athyper/api-contracts/documents";
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
  const { data, isLoading } = useQuery<{ data: DocumentLine[] }>({
    queryKey: ["record-lines", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}/lines`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: DocumentLine[] }>;
    },
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return <ItemsGrid lines={data?.data ?? []} />;
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

  // Orchestrator
  const orchestrator = buildOrchestratorFromRecord(entity, data, operations ?? []);

  // Header DTO
  const headerData = buildApprovableHeaderFromRecord(entity, data);
  headerData.statusDimensions = orchestrator.statusDimensions;
  headerData.actionBundle     = orchestrator.actionBundle;
  headerData.blockedReasons   = orchestrator.blockedReasons;

  // Build ordered tab list
  const hasAmountBreakdown = orchestrator.amountBreakdown.length > 0;
  const sectionTabs = detailConfig.sections.map((s) => ({
    id:    s.group.group_key,
    label: s.group.label,
  }));

  const tabs = [
    ...(hasAmountBreakdown || sectionTabs.length > 0
      ? [{ id: "__overview", label: "Overview" }]
      : []),
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
        healthTiles={orchestrator.healthTiles}
        validationNotices={orchestrator.validationNotices}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onAction={(action) => {
          if (action === "copy") void navigator.clipboard?.writeText(title);
        }}
      >
        {/* Overview — amounts + first section fields */}
        {activeTab === "__overview" && (
          <div className="space-y-6">
            {hasAmountBreakdown && (
              <AmountSummaryCard lines={orchestrator.amountBreakdown} />
            )}

            {detailConfig.sections[0] && (
              <Card>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {detailConfig.sections[0].fields.map((field) => {
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
            )}
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
          <Card>
            <CardContent className="pt-5">
              <LinesPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
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
    </PageFrame>
  );
}
