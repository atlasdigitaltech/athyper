/**
 * @athyper/entity-runtime — EntityDetailPage
 *
 * Renders a master record detail view with:
 *   - Header card (title, subtitle, status badge, key fields)
 *   - Tabbed sections from field_groups
 *   - Comments tab (when feature_flags.has_comments)
 *   - Activity tab (when feature_flags.has_activity_log)
 *   - Related panels (address_link, contact_link)
 *   - Action bar from entity_operation
 *
 * For entities with detail_renderer = "approvable" the page delegates to
 * ApprovableDocumentShell with a generically-built header DTO.
 */
"use client";

import { useState } from "react";
import { useCompiledEntity, useEntityDetail, useEntityOperations } from "@athyper/query";
import { useQuery } from "@tanstack/react-query";
import { resolveDetailConfig, resolveDetailRenderer } from "@athyper/metadata-client/compiled-reader";
import { Card, CardContent, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger, TabsContent, Skeleton, Badge } from "@athyper/ui/primitives";
import { PageFrame } from "@athyper/ui/layout";
import { CommentList } from "@athyper/collaboration-ui/comments";
import { ActivityTimeline } from "@athyper/collaboration-ui/activity";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";
import { ApprovableDocumentShell } from "@athyper/document-runtime/shell";
import { buildApprovableHeaderFromRecord } from "@athyper/document-runtime/header";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { ActionBar } from "../actions/ActionBar";

// ── Activity tab (fetches data via relay) ─────────────────────────────────────

function ActivityTab({ entityCode, recordId }: { entityCode: string; recordId: string }) {
  const { data, isLoading } = useQuery<{ data: ActivityEntry[] }>({
    queryKey: ["activity", entityCode, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(`/api/relay/api/activity/${entityCode}/${recordId}`, { signal });
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ActivityEntry[] }>;
    },
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 py-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </div>
    );
  }

  return <ActivityTimeline entries={data?.data ?? []} />;
}

// ── Approvable renderer ───────────────────────────────────────────────────────

/**
 * Generic approvable document view.
 *
 * Used when entity.display_config.detail_renderer === "approvable" and there
 * is no dedicated route for the entity (e.g. purchase-invoice has its own rich
 * route; other approvable documents fall through to this generic view).
 *
 * Tabs are derived from the compiled entity's field_groups; Comments and
 * Activity tabs are added when the corresponding feature flags are set.
 */
function ApprovableEntityDetailView({
  entity,
  record,
  operations,
}: {
  entity: NonNullable<ReturnType<typeof useCompiledEntity>["data"]>;
  record: NonNullable<ReturnType<typeof useEntityDetail>["data"]>;
  operations: ReturnType<typeof useEntityOperations>["data"];
}) {
  const data = record.data as Record<string, unknown>;
  const flags = entity.feature_flags ?? {};
  const detailConfig = resolveDetailConfig(entity);

  const headerData = buildApprovableHeaderFromRecord(entity, data);

  // Build tab list from field_groups + optional system tabs
  const baseTabs = detailConfig.sections.map((s) => ({
    id: s.group.group_key,
    label: s.group.label,
  }));
  const tabs = [
    ...baseTabs,
    ...(flags.has_comments ? [{ id: "__comments", label: "Comments" }] : []),
    ...(flags.has_activity_log ? [{ id: "__activity", label: "Activity" }] : []),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0]?.id ?? "");

  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entity.entity_code)
    : entity.entity_code;

  return (
    <PageFrame title={title}>
      <ApprovableDocumentShell
        data={headerData}
        persistMode
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onAction={(action) => {
          if (action === "copy") void navigator.clipboard?.writeText(title);
        }}
      >
        {/* Field-group sections */}
        {detailConfig.sections.map((section) =>
          activeTab === section.group.group_key ? (
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

        {/* Comments */}
        {activeTab === "__comments" && (
          <Card>
            <CardContent className="pt-5">
              <CommentList entityType={entity.entity_code} entityId={record.id} />
            </CardContent>
          </Card>
        )}

        {/* Activity */}
        {activeTab === "__activity" && (
          <Card>
            <CardContent className="pt-5">
              <ActivityTab entityCode={entity.entity_code} recordId={record.id} />
            </CardContent>
          </Card>
        )}
      </ApprovableDocumentShell>

      {/* Action bar — outside shell so it doesn't interfere with sticky header */}
      {operations && (
        <ActionBar
          operations={operations}
          surface="DETAIL"
          entityCode={entity.entity_code}
          recordId={record.id}
        />
      )}
    </PageFrame>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface EntityDetailPageProps {
  entityCode: string;
  recordId: string;
}

export function EntityDetailPage({ entityCode, recordId }: EntityDetailPageProps) {
  const { data: entity, isLoading: metaLoading } = useCompiledEntity(entityCode);
  const { data: record, isLoading: recordLoading } = useEntityDetail(entityCode, recordId);
  const { data: operations } = useEntityOperations(entityCode);

  if (metaLoading || recordLoading || !entity) {
    return (
      <PageFrame>
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </PageFrame>
    );
  }

  if (!record) {
    return (
      <PageFrame title="Record Not Found">
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Record <code className="font-mono">{recordId}</code> not found
            in <code className="font-mono">{entityCode}</code>.
          </p>
        </div>
      </PageFrame>
    );
  }

  // ── Renderer dispatch ─────────────────────────────────────────────────────
  const renderer = resolveDetailRenderer(entity);

  if (renderer === "approvable") {
    return (
      <ApprovableEntityDetailView
        entity={entity}
        record={record}
        operations={operations}
      />
    );
  }

  // ── Generic renderer ──────────────────────────────────────────────────────
  const detailConfig = resolveDetailConfig(entity);
  const data = record.data as Record<string, unknown>;
  const flags = entity.feature_flags ?? {};
  const hasComments = Boolean(flags.has_comments);
  const hasActivity = Boolean(flags.has_activity_log);

  // Resolve title from descriptor
  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entityCode)
    : entityCode;

  const subtitle = detailConfig.subtitleField
    ? String(data[detailConfig.subtitleField.name] ?? "")
    : undefined;

  return (
    <PageFrame
      title={title}
      description={subtitle}
      actions={
        operations ? <ActionBar operations={operations} surface="DETAIL" entityCode={entityCode} recordId={recordId} /> : null
      }
    >
      {/* Header Card — key identifying fields */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <CardTitle>{title}</CardTitle>
            {record.status && <Badge variant="outline">{record.status}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {detailConfig.headerFields.map((field) => {
              const Renderer = resolveFieldRenderer(field);
              return (
                <div key={field.name}>
                  <dt className="text-xs font-medium text-muted-foreground">{field.label ?? field.name}</dt>
                  <dd className="mt-1">
                    <Renderer value={data[field.name]} field={field} mode="view" />
                  </dd>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tabbed Sections — field groups + conditional Comments/Activity */}
      {(detailConfig.sections.length > 0 || hasComments || hasActivity) && (
        <Tabs defaultValue={detailConfig.sections[0]?.group.group_key ?? (hasComments ? "__comments" : "__activity")}>
          <TabsList>
            {detailConfig.sections.map((section) => (
              <TabsTrigger key={section.group.group_key} value={section.group.group_key}>
                {section.group.label}
              </TabsTrigger>
            ))}
            {hasComments && (
              <TabsTrigger value="__comments">Comments</TabsTrigger>
            )}
            {hasActivity && (
              <TabsTrigger value="__activity">Activity</TabsTrigger>
            )}
          </TabsList>

          {detailConfig.sections.map((section) => (
            <TabsContent key={section.group.group_key} value={section.group.group_key}>
              <Card>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            </TabsContent>
          ))}

          {hasComments && (
            <TabsContent value="__comments">
              <Card>
                <CardContent className="pt-5">
                  <CommentList entityType={entityCode} entityId={recordId} />
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {hasActivity && (
            <TabsContent value="__activity">
              <Card>
                <CardContent className="pt-5">
                  <ActivityTab entityCode={entityCode} recordId={recordId} />
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </PageFrame>
  );
}
