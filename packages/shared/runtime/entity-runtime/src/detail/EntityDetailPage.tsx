/**
 * @athyper/entity-runtime — EntityDetailPage
 *
 * Top-level dispatcher for /app/[entity]/[id]. Routes to one of three shells:
 *   master + rich  → RichMasterDetailPage (EntityHeader + SQL-driven tabs)
 *   document       → ApprovableDetailPage (injected via documentRenderer prop)
 *   master + simple→ GenericDetailReadView (EntityHeader + field-grid + tabs)
 *
 * All three shells use EntityHeader for consistent identity bar, actions, and tabs.
 * PageHeader is not used on entity detail pages.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCompiledEntity, useEntityDetail, useEntityOperations, useUpdateEntity } from "@athyper/query";
import { useQuery } from "@tanstack/react-query";
import { resolveDetailConfig, resolveRendererFamily, resolveTabs, resolveRichMasterConfig } from "@athyper/metadata-client/compiled-reader";
import { RichMasterDetailPage } from "./RichMasterDetailPage";
import {
  Card, CardContent,
  Skeleton,
} from "@athyper/ui/primitives";
import { CommentList } from "@athyper/collaboration-ui/comments";
import { ActivityTimeline } from "@athyper/collaboration-ui/activity";
import type { ActivityEntry } from "@athyper/api-contracts/workflow";
import type { CompiledEntity, EntityOperation } from "@athyper/api-contracts/metadata";
import type { HeaderTab } from "../header/types";
import { EntityHeader } from "../header/EntityHeader";
import { buildMasterHeaderModel } from "../header/builders/buildMasterHeaderModel";
import { useOperationDispatch } from "../actions/useOperationDispatch";
import { resolveFieldRenderer } from "../field-renderers/registry";
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

/** Props passed to the injected document-renderer component. */
export interface DocumentRendererProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
}

/** @deprecated Use DocumentRendererProps */
export type ApprovableRendererProps = DocumentRendererProps;

export interface EntityDetailPageProps {
  entityCode: string;
  recordId: string;
  /** When true (URL: ?mode=edit) renders EntityForm in-place in the same shell. */
  editMode?: boolean;
  /** Renderer for entities with detail_renderer="document". Pass ApprovableDetailPage from @athyper/document-runtime. */
  documentRenderer?: React.ComponentType<DocumentRendererProps>;
}

// ── Generic simple-master read view — owns tab + action state ─────────────

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
  const router       = useRouter();
  const opDispatch   = useOperationDispatch({ entityCode, recordId, recordUuid: record.id });
  const detailConfig = resolveDetailConfig(entity);
  const masterConfig = resolveRichMasterConfig(entity);
  const data         = record.data;
  const resolvedTabs = resolveTabs(entity, null, []);
  const hasComments  = resolvedTabs.includes("comments");
  const hasActivity  = resolvedTabs.includes("events");

  const headerTabs: HeaderTab[] = [
    ...detailConfig.sections.map((s) => ({ id: s.group.group_key, label: s.group.label })),
    ...(hasComments ? [{ id: "__comments", label: "Comments" }] : []),
    ...(hasActivity  ? [{ id: "__activity", label: "Activity"  }] : []),
  ];

  const defaultTabId = headerTabs[0]?.id ?? "";
  const [activeTab, setActiveTab] = useState(defaultTabId);

  // Append Edit as an explicit action so it appears in the EntityHeader action bar.
  const editAction = canEdit
    ? [{ id: "__edit", label: "Edit", placement: "secondary" as const, order: 999 }]
    : [];

  const headerModel = buildMasterHeaderModel(
    entity,
    data,
    { type_label: masterConfig.type_label },
    headerTabs.length > 0 ? headerTabs : undefined,
    recordId,
    operations,
    false,   // editMode
    false,   // isDirty
  );
  // Splice in the Edit action (buildMasterHeaderModel maps ops from entity_operations;
  // the Edit navigate-op is already included if seeded, but we guard canEdit explicitly).
  const editActionsAlreadyPresent = headerModel.actions.some(
    (a) => (a.id ?? "").toLowerCase().includes("edit"),
  );
  if (!editActionsAlreadyPresent && canEdit) {
    headerModel.actions = [...headerModel.actions, ...editAction];
  }

  function handleAction(id: string) {
    if (id === "__edit") { onEditClick(); return; }
    const op = (operations ?? []).find((o) => o.permission_code === id);
    if (!op) return;
    if (op.handler_type === "NAVIGATE" && op.handler_target) {
      router.push(op.handler_target.replace("{id}", encodeURIComponent(recordId)));
      return;
    }
    void opDispatch.dispatch(id, operations ?? []);
  }

  return (
    <>
      <EntityHeader
        model={headerModel}
        onBack={() => router.back()}
        onAction={handleAction}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      <div className="flex flex-col gap-2.5">
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

        {/* Tab content */}
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
    </>
  );
}

// ── Main dispatcher ────────────────────────────────────────────────────────────

export function EntityDetailPage({ entityCode, recordId, editMode = false, documentRenderer: ApprovableRenderer }: EntityDetailPageProps) {
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

  // Delegate to specialised shells based on resolved renderer family + profile
  const renderer = resolveRendererFamily(entity);
  const profile  = entity.display_config.detail_profile ?? "simple";

  // ledger + read-only profile: never editable regardless of operations
  const isReadOnly = renderer === "ledger" || profile === "read-only";
  const resolvedCanEdit = isReadOnly ? false : canEdit;
  const resolvedEditMode = isReadOnly ? false : effectiveEditMode;

  if (renderer === "master" && profile === "rich") {
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

  if (renderer === "document" && ApprovableRenderer) {
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
  const data = record.data as Record<string, unknown>;

  // ── Edit mode — EntityHeader in "Editing" state + EntityForm below ────────
  if (resolvedEditMode) {
    const editConfig    = resolveRichMasterConfig(entity);
    const editDetailCfg = resolveDetailConfig(entity);
    const editCodeField  = entity.display_config.code_field ?? "code";
    const editCodeNumber = data[editCodeField] ? String(data[editCodeField]) : recordId;
    const editEntityName = editDetailCfg.titleField && data[editDetailCfg.titleField.name]
      ? String(data[editDetailCfg.titleField.name])
      : undefined;

    const editModel = buildMasterHeaderModel(
      entity, data,
      { type_label: editConfig.type_label },
      undefined,   // no tabs in edit mode
      recordId,
      undefined,   // actions come from editMode branch inside builder
      true,        // editMode
      false,       // isDirty — static header; form manages dirty state internally
    );
    // Override identity for edit mode: number + name from record, status = Editing
    editModel.identity.number = editCodeNumber;
    editModel.identity.name   = editEntityName;
    editModel.identity.identifierAction = "none";
    editModel.identity.status = { label: "Editing", intent: "info" };

    return (
      <>
        <EntityHeader
          model={editModel}
          onBack={() => router.back()}
          onAction={(id) => {
            if (id === "__exit" || id === "__discard") {
              router.push(`/app/${entityCode}/${recordId}`);
            }
          }}
        />
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
      </>
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
      canEdit={resolvedCanEdit}
    />
  );
}
