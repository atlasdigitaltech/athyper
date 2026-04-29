/**
 * @athyper/entity-runtime — EntityDetailPage
 *
 * Renders a master record detail view with:
 *   - PageShell (Region 1 header + Region 2 tabs + Region 3 content)
 *   - Tabbed sections from field_groups
 *   - Comments / Activity tabs when enabled by resolveTabs()
 *   - editMode: when true (via ?mode=edit URL param), field values become
 *     inputs via EntityForm rendered inline — same shell, no route change.
 *
 * For entities with detail_renderer = "approvable" delegates to
 * ApprovableDetailPage (which has its own rich shell via ApprovableDocumentShell).
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@athyper/theme/utils";
import { useCompiledEntity, useEntityDetail, useEntityOperations, useUpdateEntity } from "@athyper/query";
import { useQuery } from "@tanstack/react-query";
import { resolveDetailConfig, resolveRendererFamily, resolveTabs } from "@athyper/metadata-client/compiled-reader";
import { RichMasterDetailPage } from "./RichMasterDetailPage";
import {
  Card, CardContent,
  Skeleton, Badge, Button,
} from "@athyper/ui/primitives";
import { CommentList } from "@athyper/collaboration-ui/comments";
import { ActivityTimeline } from "@athyper/collaboration-ui/activity";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { ActionBar } from "../actions/ActionBar";
import { PageShell } from "../shell/PageShell";
import { PageHeader, ModeBadge } from "../shell/PageHeader";
import { EntityForm } from "../form/EntityForm";

// ── Activity tab ───────────────────────────────────────────────────────────────

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

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ApprovableRendererProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
}

export interface EntityDetailPageProps {
  entityCode: string;
  recordId: string;
  /** When true (URL: ?mode=edit) renders EntityForm in-place in the same shell. */
  editMode?: boolean;
  /** Renderer for entities with detail_renderer="approvable". Pass ApprovableDetailPage from @athyper/document-runtime. */
  approvableRenderer?: React.ComponentType<ApprovableRendererProps>;
}

// ── Generic read-mode view — owns tab state ────────────────────────────────

interface GenericDetailReadViewProps {
  entityCode:  string;
  recordId:    string;
  entity:      CompiledEntity;
  record:      { id: string; data: Record<string, unknown>; status?: string };
  operations:  EntityOperation[] | undefined;
  onEditClick: () => void;
  canEdit:     boolean;
}

function GenericDetailReadView({
  entityCode, recordId, entity, record, operations, onEditClick, canEdit,
}: GenericDetailReadViewProps) {
  const detailConfig  = resolveDetailConfig(entity);
  const data          = record.data;
  const resolvedTabs  = resolveTabs(entity, null, []);
  const hasComments   = resolvedTabs.includes("comments");
  const hasActivity   = resolvedTabs.includes("events");

  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entityCode)
    : entityCode;
  const subtitle = detailConfig.subtitleField
    ? String(data[detailConfig.subtitleField.name] ?? "")
    : undefined;

  const allTabKeys: { key: string; label: string }[] = [
    ...detailConfig.sections.map((s) => ({ key: s.group.group_key, label: s.group.label })),
    ...(hasComments ? [{ key: "__comments", label: "Comments" }] : []),
    ...(hasActivity  ? [{ key: "__activity", label: "Activity"  }] : []),
  ];

  const defaultTabKey: string =
    detailConfig.sections[0]?.group.group_key ??
    (hasComments ? "__comments" : (hasActivity ? "__activity" : ""));

  const [activeTab, setActiveTab] = useState(defaultTabKey);
  const hasTabs = allTabKeys.length > 0;

  const header = (
    <PageHeader
      typeChip={entity.entity_name}
      title={title}
      titleVariant="doc"
      statusSlot={record.status ? <Badge variant="outline">{record.status}</Badge> : undefined}
      subtitle={subtitle}
      actions={
        <div className="flex items-center gap-1.5">
          {operations && (
            <ActionBar
              operations={operations}
              surface="DETAIL"
              entityCode={entityCode}
              recordId={recordId}
            />
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={onEditClick}>
              Edit
            </Button>
          )}
        </div>
      }
    />
  );

  // Region 2 — interactive tab bar (state lives in this component)
  const context = hasTabs ? (
    <div className="flex items-center gap-0.5">
      {allTabKeys.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setActiveTab(key)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            activeTab === key
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  ) : undefined;

  return (
    <PageShell header={header} context={context}>
      {/* Header card — key identifying fields */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-3 lg:grid-cols-4">
            {detailConfig.headerFields.map((field) => {
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

      {hasTabs && (
        <div className="mt-2.5 space-y-2">
          {detailConfig.sections.map((section) =>
            activeTab === section.group.group_key ? (
              <Card key={section.group.group_key}>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
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

          {activeTab === "__comments" && hasComments && (
            <Card>
              <CardContent className="pt-5">
                <CommentList entityType={entityCode} entityId={recordId} />
              </CardContent>
            </Card>
          )}

          {activeTab === "__activity" && hasActivity && (
            <Card>
              <CardContent className="pt-5">
                <ActivityTab entityCode={entityCode} recordId={recordId} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export function EntityDetailPage({ entityCode, recordId, editMode = false, approvableRenderer: ApprovableRenderer }: EntityDetailPageProps) {
  const router = useRouter();
  const { data: entity, isLoading: metaLoading } = useCompiledEntity(entityCode);
  const { data: record, isLoading: recordLoading } = useEntityDetail(entityCode, recordId);
  const { data: operations } = useEntityOperations(entityCode);
  const updateMutation = useUpdateEntity(entityCode, recordId);

  // Gate edit mode behind server-returned operations.
  // operations===undefined = still loading → optimistic-allow (no flash).
  // Once loaded: require an enabled NAVIGATE op whose target contains "mode=edit".
  const canEdit = operations === undefined
    || operations.some(
        op => op.is_enabled &&
              op.handler_type === "NAVIGATE" &&
              (op.handler_target ?? "").includes("mode=edit"),
      );
  const effectiveEditMode = editMode && canEdit;

  if (metaLoading || recordLoading || !entity) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <Skeleton className="h-7 w-56" />
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="rounded-xl border border-destructive/50 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">
          Record <code className="font-mono">{recordId}</code> not found
          in <code className="font-mono">{entityCode}</code>.
        </p>
      </div>
    );
  }

  // Delegate to specialised shells based on resolved renderer family
  const renderer = resolveRendererFamily(entity);

  if (renderer === "rich_master") {
    return (
      <RichMasterDetailPage
        entity={entity}
        record={record}
        operations={operations}
        recordId={recordId}
        editMode={effectiveEditMode}
      />
    );
  }

  if (renderer === "approvable" && ApprovableRenderer) {
    return (
      <ApprovableRenderer
        entity={entity}
        record={record}
        operations={operations}
        recordId={recordId}
      />
    );
  }

  // ── Generic master record renderer ─────────────────────────────────────────
  const detailConfig = resolveDetailConfig(entity);
  const data = record.data as Record<string, unknown>;

  const title = detailConfig.titleField
    ? String(data[detailConfig.titleField.name] ?? entityCode)
    : entityCode;
  const subtitle = detailConfig.subtitleField
    ? String(data[detailConfig.subtitleField.name] ?? "")
    : undefined;

  // ── Edit mode — same shell, EntityForm in Region 3 ────────────────────────
  if (effectiveEditMode) {
    const header = (
      <PageHeader
        typeChip={entity.entity_name}
        title={title}
        titleVariant="doc"
        statusSlot={<ModeBadge>Editing</ModeBadge>}
        subtitle={subtitle}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/app/${entityCode}/${recordId}`)}
          >
            Cancel
          </Button>
        }
      />
    );

    return (
      <PageShell header={header}>
        <EntityForm
          entityCode={entityCode}
          initialData={data}
          onSubmit={async (formData) => {
            await updateMutation.mutateAsync(formData);
            router.push(`/app/${entityCode}/${recordId}`);
          }}
          onCancel={() => router.push(`/app/${entityCode}/${recordId}`)}
          submitting={updateMutation.isPending}
        />
      </PageShell>
    );
  }

  // ── Read mode — delegate to sub-component (owns tab useState) ─────────────
  return (
    <GenericDetailReadView
      entityCode={entityCode}
      recordId={recordId}
      entity={entity}
      record={record}
      operations={operations}
      onEditClick={() => router.push(`/app/${entityCode}/${recordId}?mode=edit`)}
      canEdit={canEdit}
    />
  );
}
