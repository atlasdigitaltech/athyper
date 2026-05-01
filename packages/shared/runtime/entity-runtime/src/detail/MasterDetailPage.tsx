"use client";

/**
 * MasterDetailPage — generic detail shell for master entities (detail_profile="rich").
 * All layout decisions live in SQL (display_config.master_config). Zero per-entity TSX.
 *
 * Tab renderers: overview | fields | child | composite | comments | attachments | activity | blank | summary_cards_with_drawer
 * Platform panels: Comments / Attachments / Activity as icon buttons in the tab bar (Sheet slide-ins).
 */

import { useState, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUpdateEntity } from "@athyper/query";
import { MessageSquare, Paperclip, Clock, Plus, AlertCircle, Lock, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button, Card, CardContent, Label, Skeleton,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
  DrawerShell,
} from "@athyper/ui/primitives";
import type { CompiledEntity, EntityField, EntityOperation } from "@athyper/api-contracts/metadata";
import { EntityHeader } from "../header";
import type { PlatformPanelIcon } from "../header/atoms/EntityTabBar";
import { AttachmentsPanel, CommentsPanel, EventsPanel } from "../panels";
import type { HeaderTab } from "../header/types";
import { buildMasterHeaderModel, formatValue } from "../header/builders/buildMasterHeaderModel";
import { formatBytes, titleCase } from "@athyper/runtime-shared/core";
import {
  resolveDetailConfig,
  resolveMasterConfig,
  resolveTabs,
  type MasterConfig,
  type MasterTab,
  type MasterTabSection,
} from "@athyper/metadata-client/compiled-reader";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { CommentList } from "@athyper/collaboration-ui/comments";
import { useOperationDispatch } from "../actions/useOperationDispatch";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";
import { ChildSummaryCardsPanel, type ViewOnlyReason } from "./ChildSummaryCardsPanel";

// ── Public props ──────────────────────────────────────────────────────────────

export interface MasterDetailPageProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
  editMode?:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── KPI mini-card ─────────────────────────────────────────────────────────────

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-4 py-3 border border-border/50">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-semibold text-foreground leading-snug truncate">{value}</p>
    </div>
  );
}

// ── Overview renderer — header_facts KPI cards + child-tab shortcuts ──────────

function OverviewRenderer({
  entity,
  data,
  config,
  childTabs,
  onTabChange,
}: {
  entity:      CompiledEntity;
  data:        Record<string, unknown>;
  config:      MasterConfig;
  childTabs:   MasterTab[];
  onTabChange: (id: string) => void;
}) {
  const kpiItems = (config.header_facts ?? []).slice(0, 4).map((fieldName) => {
    const field      = entity.fields.find((f) => f.name === fieldName);
    const fieldValue = data[fieldName] ?? (field?.column_name ? data[field.column_name] : undefined);
    return {
      label: field?.label ?? titleCase(fieldName),
      value: formatValue(fieldValue, field),
    };
  });

  return (
    <div className="space-y-4">
      {kpiItems.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpiItems.map((item) => (
            <KpiCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      )}
      {childTabs.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {childTabs.slice(0, 6).map((tab) => (
            <div key={tab.id} className="rounded-lg border border-border bg-card px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{tab.label}</span>
                <button
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className="text-xs text-info hover:underline"
                >
                  View →
                </button>
              </div>
              {tab.empty_description && (
                <p className="mt-1 text-xs text-muted-foreground/70 line-clamp-1">
                  {tab.empty_description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── View-only chip — only shown when editing is actually blocked ──────────────
// Never shown in normal view mode when Edit is available.

function ViewOnlyChip({ reason }: { reason: ViewOnlyReason }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-[11px] font-medium text-muted-foreground select-none cursor-default">
          <Lock className="h-3 w-3 shrink-0" />
          {reason.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">{reason.tooltip}</TooltipContent>
    </Tooltip>
  );
}

// ── Fields renderer — view mode (read-only field grid) ────────────────────────

const SKIP_FIELD_NAMES = new Set(["code", "name", "status"]);

function FieldsRenderer({
  entity,
  data,
  viewOnlyReason,
}: {
  entity:         CompiledEntity;
  data:           Record<string, unknown>;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const { field_groups, fields } = entity;

  const displayFields = fields
    .filter((f) =>
      !SKIP_FIELD_NAMES.has(f.name) &&
      f.origin !== "system" &&
      f.data_type !== "lifecycle_state",
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (displayFields.length === 0) {
    return (
      <EmptyState
        title="No profile fields configured"
        description="Add field definitions to this entity to display profile data here."
      />
    );
  }

  const chipNode = viewOnlyReason ? (
    <div className="flex items-center">
      <ViewOnlyChip reason={viewOnlyReason} />
    </div>
  ) : null;

  if (field_groups.length > 0) {
    const sections = field_groups
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((group) => ({
        group,
        fields: displayFields.filter((f) => group.fields.includes(f.name)),
      }))
      .filter((s) => s.fields.length > 0);

    const ungrouped = displayFields.filter(
      (f) => !field_groups.some((g) => g.fields.includes(f.name)),
    );

    return (
      <div className="space-y-3">
        {chipNode}
        {sections.map(({ group, fields: gFields }) => (
          <Card key={group.group_key}>
            <CardContent className="pt-5">
              <h4 className="mb-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {group.label}
              </h4>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
                {gFields.map((field) => (
                  <FieldCell
                    key={field.name}
                    field={field}
                    value={data[field.name] ?? data[field.column_name ?? ""]}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
        {ungrouped.length > 0 && (
          <Card>
            <CardContent className="pt-5">
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
                {ungrouped.map((field) => (
                  <FieldCell
                    key={field.name}
                    field={field}
                    value={data[field.name] ?? data[field.column_name ?? ""]}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chipNode}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            {displayFields.map((field) => (
              <FieldCell
                key={field.name}
                field={field}
                value={data[field.name] ?? data[field.column_name ?? ""]}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FieldCell({ field, value }: { field: EntityField; value: unknown }) {
  const Renderer = resolveFieldRenderer(field);
  return (
    <div>
      <dt className="mb-1 text-xs font-medium leading-normal text-muted-foreground">
        {field.label ?? field.name}
      </dt>
      <dd className="text-sm leading-snug text-foreground">
        <Renderer value={value} field={field} mode="view" />
      </dd>
    </div>
  );
}

// ── Inline editable fields — for composite tab sections in edit mode ──────────

function InlineEditSection({
  entity,
  formData,
  onFieldChange,
  displayFieldNames,
}: {
  entity:            CompiledEntity;
  formData:          Record<string, unknown>;
  onFieldChange:     (name: string, value: unknown) => void;
  displayFieldNames?: string[];
}) {
  const { fields, field_groups } = entity;

  const editableFields = fields
    .filter(
      (f) =>
        !f.is_readonly &&
        f.origin !== "system" &&
        f.data_type !== "lifecycle_state" &&
        !SKIP_FIELD_NAMES.has(f.name) &&
        (displayFieldNames ? displayFieldNames.includes(f.name) : true),
    )
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (editableFields.length === 0) {
    return (
      <EmptyState
        title="No editable fields"
        description="No editable fields are configured for this section."
      />
    );
  }

  const grouped = field_groups.length > 0
    ? field_groups
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((g) => ({ group: g, fields: editableFields.filter((f) => g.fields.includes(f.name)) }))
        .filter((s) => s.fields.length > 0)
    : [];

  const ungrouped = grouped.length > 0
    ? editableFields.filter((f) => !field_groups.some((g) => g.fields.includes(f.name)))
    : editableFields;

  const renderGrid = (flds: typeof editableFields) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {flds.map((field) => {
        const Renderer = resolveFieldRenderer(field);
        const val = formData[field.name] ?? formData[field.column_name ?? ""];
        return (
          <div key={field.name} className="space-y-1.5">
            <Label>
              {field.label ?? field.name}
              {field.is_required && <span className="ml-1 text-destructive">*</span>}
            </Label>
            <Renderer
              value={val}
              field={field}
              mode="edit"
              onChange={(v) => onFieldChange(field.name, v)}
            />
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5">
      {grouped.map(({ group, fields: gFields }) => (
        <div key={group.group_key}>
          <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h4>
          {renderGrid(gFields)}
        </div>
      ))}
      {ungrouped.length > 0 && renderGrid(ungrouped)}
    </div>
  );
}

// ── Child entity panel ────────────────────────────────────────────────────────

// List endpoint returns flat rows (all columns at top level, not nested under "data").
type ChildRecord = Record<string, unknown>;

function ChildEntityPanel({
  tab,
  recordUuid,
  editMode,
  viewOnlyReason,
}: {
  tab:            MasterTab;
  recordUuid:     string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const entityCode       = tab.entity_code!;
  // For view-backed child tabs: create the underlying writable entity (e.g. bank_account),
  // then create the polymorphic link (e.g. bank_account_link).  When absent, entityCode is used.
  const createEntityCode = tab.create_entity_code ?? entityCode;
  const linkEntityCode   = tab.link_entity_code;
  const linkOwnerType    = tab.link_owner_type;

  const queryClient   = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const formRef = useRef<EntityFormHandle>(null);

  const childQueryKey = ["child-entity", entityCode, recordUuid] as const;

  const { data, isLoading, isError } = useQuery<{ data: ChildRecord[] }>({
    queryKey: childQueryKey,
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/records/${encodeURIComponent(entityCode)}?parent_id=${encodeURIComponent(recordUuid)}`,
        { signal },
      );
      if (!res.ok) return { data: [] };
      return res.json() as Promise<{ data: ChildRecord[] }>;
    },
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (formData: Record<string, unknown>) => {
      // Step 1: create the primary entity record.
      // Two-step tabs omit parent_id — the primary entity (e.g. bank_account) has no parent FK.
      // Single-step tabs inject parent_id so records.route sets the physical FK column.
      const primaryBody = linkEntityCode
        ? { data: formData }
        : { data: { ...formData, parent_id: recordUuid } };

      const res = await fetch(`/api/relay/api/records/${encodeURIComponent(createEntityCode)}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(primaryBody),
      });
      if (!res.ok) {
        const err = await res.json() as { message?: string };
        throw new Error(err.message ?? "Failed to create record");
      }
      const created = await res.json() as Record<string, unknown>;

      // Step 2 (two-step only): create the polymorphic link record.
      // e.g. bank_account_link with owner_type='supplier', owner_id=supplierUuid, bank_account_id=newId
      if (linkEntityCode && linkOwnerType) {
        const newId   = String(created["id"] ?? "");
        const linkRes = await fetch(`/api/relay/api/records/${encodeURIComponent(linkEntityCode)}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            data: {
              [`${createEntityCode}_id`]: newId,
              owner_id:                  recordUuid,
              owner_type:                linkOwnerType,
            },
          }),
        });
        if (!linkRes.ok) {
          const err = await linkRes.json() as { message?: string };
          throw new Error(err.message ?? "Failed to link record to owner");
        }
      }

      return created;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: childQueryKey });
      setDrawerOpen(false);
    },
  });

  const records       = data?.data ?? [];
  const displayFields = tab.display_fields ?? [];
  const canAdd        = editMode && !!tab.add_href_template;

  return (
    <>
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${records.length} record${records.length !== 1 ? "s" : ""}`}
          </p>
          {!canAdd && viewOnlyReason && <ViewOnlyChip reason={viewOnlyReason} />}
        </div>
        {canAdd && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setDrawerOpen(true)}
          >
            <Plus className="h-3 w-3" />
            {tab.add_label ?? "Add"}
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Failed to load records.</p>
        </div>
      )}

      {!isLoading && !isError && records.length === 0 && (
        <EmptyState
          title={tab.empty_title ?? "No records"}
          description={tab.empty_description}
        />
      )}

      {!isLoading && !isError && records.length > 0 && (
        <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
          {records.map((rec) => {
            const recId     = String(rec["id"] ?? "");
            const primary   = displayFields[0] ? String(rec[displayFields[0]] ?? "") : "";
            const secondary = displayFields
              .slice(1)
              .map((f: string) => rec[f])
              .filter(Boolean)
              .map(String)
              .join(" · ");
            return (
              <div key={recId} className="flex items-start gap-4 bg-card px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">
                    {primary || recId.slice(0, 8) + "…"}
                  </p>
                  {secondary && (
                    <p className="mt-0.5 text-xs text-muted-foreground truncate">{secondary}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>

    <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
          <SheetTitle>{tab.add_label ?? "Add"}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <EntityForm
            ref={formRef}
            entityCode={createEntityCode}
            onSubmit={async (formData) => {
              await createMutation.mutateAsync(formData);
            }}
            submitting={createMutation.isPending}
            hideActions
            noFrame
          />
        </div>
        <SheetFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setDrawerOpen(false)}
            disabled={createMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void formRef.current?.submit()}
            loading={createMutation.isPending}
          >
            Create
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
    </>
  );
}

// ── Composite renderer — anchored section nav + stacked content ───────────────

function CompositeRenderer({
  entity,
  data,
  sections,
  recordUuid,
  editMode,
  viewOnlyReason,
  editFormData,
  onFieldChange,
}: {
  entity:          CompiledEntity;
  data:            Record<string, unknown>;
  sections:        MasterTabSection[];
  recordUuid:      string;
  editMode:        boolean;
  viewOnlyReason:  ViewOnlyReason | null;
  editFormData?:   Record<string, unknown>;
  onFieldChange?:  (name: string, value: unknown) => void;
}) {
  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");

  if (sections.length === 0) {
    return <EmptyState title="No sections configured" description="Add composite_sections to the tab config." />;
  }

  return (
    <div className="flex gap-6">
      {/* Left section nav */}
      <nav className="w-36 shrink-0 space-y-0.5 pt-0.5">
        {viewOnlyReason && (
          <div className="mb-3">
            <ViewOnlyChip reason={viewOnlyReason} />
          </div>
        )}
        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveSection(s.id)}
            className={cn(
              "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
              activeSection === s.id
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Section content — chip already rendered in the nav column */}
      <div className="flex-1 min-w-0">
        {sections.map((s) => (
          <div key={s.id} className={s.id === activeSection ? "" : "hidden"}>
            {s.type === "fields" ? (
              editMode && editFormData && onFieldChange ? (
                <InlineEditSection
                  entity={entity}
                  formData={editFormData}
                  onFieldChange={onFieldChange}
                  displayFieldNames={s.display_fields}
                />
              ) : (
                <FieldsRenderer entity={entity} data={data} viewOnlyReason={null} />
              )
            ) : s.type === "child" && s.entity_code ? (
              <ChildEntityPanel
                tab={{
                  id:                s.id,
                  label:             s.label,
                  renderer:          "child",
                  entity_code:       s.entity_code,
                  display_fields:    s.display_fields,
                  add_href_template: s.add_href_template,
                  add_label:         s.add_label,
                  empty_title:       s.empty_title,
                  empty_description: s.empty_description,
                }}
                recordUuid={recordUuid}
                editMode={editMode}
                viewOnlyReason={null}
              />
            ) : (
              <EmptyState title={s.label} description="Section not yet configured." />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
}: {
  icon?:        ReactNode;
  title:        string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-12 text-center">
      {icon && <div className="text-muted-foreground/30">{icon}</div>}
      <p className="text-sm text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground/60 max-w-xs">{description}</p>
      )}
    </div>
  );
}

// ── Platform panel labels + default widths ────────────────────────────────────

const PANEL_LABELS: Record<string, string> = {
  comments:    "Comments",
  attachments: "Attachments",
  activity:    "Activity",
};


// ── Main component ────────────────────────────────────────────────────────────

export function MasterDetailPage({
  entity,
  record,
  operations,
  recordId,
  editMode = false,
}: MasterDetailPageProps) {
  const router         = useRouter();
  const data           = record.data;
  const updateMutation = useUpdateEntity(entity.entity_code, recordId);
  const config         = resolveMasterConfig(entity);
  const formRef        = useRef<EntityFormHandle>(null);
  const [isDirty, setIsDirty]         = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const [panelCount,  setPanelCount]  = useState<number | null>(null);
  // Lifted form state for composite-tab edits (InlineEditSection does not own its own state).
  const [editFormData, setEditFormData] = useState<Record<string, unknown>>(data);

  function handleCompositeFieldChange(name: string, value: unknown) {
    setEditFormData((prev) => ({ ...prev, [name]: value }));
    setIsDirty(true);
  }

  // Derive why editing is blocked (null = can edit — no chip shown).
  // Checked once here; passed to every content renderer.
  const viewOnlyReason = useMemo((): ViewOnlyReason | null => {
    if (editMode) return null;
    const editOp = (operations ?? []).find(
      (op) =>
        (op.surface === "DETAIL" || op.surface === "BOTH") &&
        op.permission_code.toLowerCase().includes("edit"),
    );
    if (editOp?.is_enabled) return null;

    const statusField = entity.display_config.status_field_names?.[0] ?? "status";
    const statusVal   = String(data[statusField] ?? "active").toLowerCase();
    const IMMUTABLE   = new Set(["archived", "inactive", "cancelled", "closed", "terminated", "voided", "deleted"]);
    const entityLabel = entity.entity_name.replace(/_/g, " ");

    if (IMMUTABLE.has(statusVal)) {
      return {
        label:   `${titleCase(statusVal)} · view only`,
        tooltip: `${titleCase(statusVal)} ${entityLabel} cannot be edited. Reactivate to make changes.`,
      };
    }
    return {
      label:   "View only",
      tooltip: `You do not have permission to edit this ${entityLabel}.`,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, operations, entity, data]);

  const rawTabs   = config.tabs!;
  const childTabs = rawTabs.filter((t) => t.renderer === "child");
  // Suppress the P5 tab strip when there is only one tab.
  const headerTabs: HeaderTab[] | undefined = rawTabs.length > 1
    ? rawTabs.map((t) => ({ id: t.id, label: t.label }))
    : undefined;

  const defaultActiveTab = editMode
    ? (rawTabs.find((t) => t.renderer === "fields")?.id
      ?? rawTabs.find((t) => t.renderer === "composite")?.id
      ?? rawTabs[0]?.id
      ?? "__profile")
    : (rawTabs[0]?.id ?? "__profile");

  const [activeTab, setActiveTab] = useState(defaultActiveTab);

  // ── Platform panel counts ─────────────────────────────────────────────────────
  // Fetched eagerly so badge counts appear on load, not only after the panel opens.
  // Same query keys as CommentsPanel / AttachmentsPanel — cache is shared.
  const hasPlatformComments    = (config.platform_panels ?? []).includes("comments");
  const hasPlatformAttachments = (config.platform_panels ?? []).includes("attachments");

  const commentsCountQuery = useQuery<{ data: unknown[]; hasMore: boolean }>({
    queryKey: ["collab-comments", entity.entity_code, recordId],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        entityType: entity.entity_code,
        entityId:   recordId,
        limit:      "200",
      });
      const res = await fetch(`/api/collab/comments?${params}`, { signal, cache: "no-store" });
      if (!res.ok) return { data: [], hasMore: false };
      return res.json() as Promise<{ data: unknown[]; hasMore: boolean }>;
    },
    staleTime: 30_000,
    enabled: hasPlatformComments,
  });

  const attachmentsCountQuery = useQuery<{ size_bytes: number; status?: string; visibility?: string }[]>({
    queryKey: ["attachments", entity.entity_code, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/documents/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}/attachments`,
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

  // Build platform icons with live counts
  const platformIcons: PlatformPanelIcon[] = useMemo(
    () =>
      (config.platform_panels ?? []).map((panelId) => {
        switch (panelId) {
          case "comments":    return {
            id: "comments", icon: <MessageSquare className="h-4 w-4" />, label: "Comments",
            count:        commentsCount > 0 ? commentsCount : undefined,
            countPending: hasPlatformComments && commentsCountQuery.isPending,
          };
          case "attachments": return {
            id: "attachments", icon: <Paperclip className="h-4 w-4" />, label: "Attachments",
            count:        attachmentsCount > 0 ? attachmentsCount : undefined,
            countPending: hasPlatformAttachments && attachmentsCountQuery.isPending,
          };
          case "activity":    return {
            id: "activity", icon: <Clock className="h-4 w-4" />, label: "Activity",
          };
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.platform_panels,
      commentsCount, commentsCountQuery.isPending,
      attachmentsCount, attachmentsCountQuery.isPending,
    ],
  );

  const headerModel = useMemo(
    () => buildMasterHeaderModel(
      entity, data,
      {
        type_label:           config.type_label,
        classification_field: config.classification_field,
        header_facts:         config.header_facts,
      },
      headerTabs, recordId, operations, editMode, isDirty,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, data, config, recordId, operations, editMode, isDirty],
  );

  const opDispatch = useOperationDispatch({
    entityCode: entity.entity_code,
    recordId,
    recordUuid: record.id,
  });

  function handleAction(actionId: string) {
    if (editMode) {
      if (actionId === "__exit" || actionId === "__discard") {
        setIsDirty(false);
        setEditFormData(data);
        router.push(`/app/${entity.entity_code}/${recordId}`);
        return;
      }
      if (actionId === "__save") {
        const activeTabDef = rawTabs.find((t) => t.id === activeTab);
        if (activeTabDef?.renderer === "composite") {
          // Composite tabs use lifted editFormData — submit directly.
          const editableNames = new Set(
            entity.fields
              .filter(
                (f) =>
                  !f.is_readonly &&
                  f.origin !== "system" &&
                  f.data_type !== "lifecycle_state" &&
                  !SKIP_FIELD_NAMES.has(f.name),
              )
              .map((f) => f.name),
          );
          const payload = Object.fromEntries(
            Object.entries(editFormData).filter(([k]) => editableNames.has(k)),
          );
          void (async () => {
            try {
              await updateMutation.mutateAsync(payload);
              setIsDirty(false);
              router.push(`/app/${entity.entity_code}/${recordId}`);
            } catch {
              // mutation error is surfaced by useUpdateEntity
            }
          })();
        } else {
          // "fields" tabs use EntityForm via formRef.
          void formRef.current?.submit();
        }
        return;
      }
      return;
    }
    const op = (operations ?? []).find((o) => o.permission_code === actionId);
    if (!op) return;
    if (op.handler_type === "NAVIGATE" && op.handler_target) {
      router.push(op.handler_target.replace("{id}", encodeURIComponent(recordId)));
      return;
    }
    void opDispatch.dispatch(actionId, operations ?? []);
  }

  function handlePlatformIconClick(id: string) {
    setActivePanel((prev) => {
      if (prev === id) return null;
      setPanelCount(null);
      return id;
    });
  }

  const activeTabDef = rawTabs.find((t) => t.id === activeTab);

  function renderActiveTab() {
    if (!activeTabDef) return null;

    switch (activeTabDef.renderer) {
      case "overview":
        return (
          <Card>
            <CardContent className="pt-5">
              <OverviewRenderer
                entity={entity}
                data={data}
                config={config}
                childTabs={childTabs}
                onTabChange={setActiveTab}
              />
            </CardContent>
          </Card>
        );

      case "fields":
        return editMode ? (
          <EntityForm
            ref={formRef}
            entityCode={entity.entity_code}
            initialData={data}
            onSubmit={async (formData) => {
              await updateMutation.mutateAsync(formData);
              setIsDirty(false);
              router.push(`/app/${entity.entity_code}/${recordId}`);
            }}
            onCancel={() => {
              setIsDirty(false);
              router.push(`/app/${entity.entity_code}/${recordId}`);
            }}
            onChange={() => setIsDirty(true)}
            submitting={updateMutation.isPending}
            hideActions
          />
        ) : (
          <FieldsRenderer entity={entity} data={data} viewOnlyReason={viewOnlyReason} />
        );

      case "composite":
        return activeTabDef.composite_sections && activeTabDef.composite_sections.length > 0 ? (
          <Card>
            <CardContent className="pt-5">
              <CompositeRenderer
                entity={entity}
                data={data}
                sections={activeTabDef.composite_sections}
                recordUuid={record.id}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
                editFormData={editMode ? editFormData : undefined}
                onFieldChange={editMode ? handleCompositeFieldChange : undefined}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState title={activeTabDef.label} description="No sections configured for this tab." />
        );

      case "child":
        return activeTabDef.entity_code ? (
          <Card>
            <CardContent className="pt-5">
              <ChildEntityPanel
                tab={activeTabDef}
                recordUuid={record.id}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Child entity not configured" description="Set entity_code in the tab config." />
        );

      case "summary_cards_with_drawer":
        return activeTabDef.entity_code ? (
          <Card>
            <CardContent className="pt-5">
              <ChildSummaryCardsPanel
                tab={activeTabDef}
                recordUuid={record.id}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Child entity not configured" description="Set entity_code in the tab config." />
        );

      case "comments":
        return (
          <Card>
            <CardContent className="pt-5">
              <CommentsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        );

      case "attachments":
        return (
          <Card>
            <CardContent className="pt-5">
              <AttachmentsPanel entityCode={entity.entity_code} recordId={recordId} />
            </CardContent>
          </Card>
        );

      case "activity":
        return (
          <Card>
            <CardContent className="pt-5">
              <EventsPanel
                entityCode={entity.entity_code}
                recordId={recordId}
                recordUuid={record.id}
              />
            </CardContent>
          </Card>
        );

      case "blank":
        return (
          <Card>
            <CardContent className="pt-5">
              <EmptyState
                title={activeTabDef.label}
                description={activeTabDef.blank_message}
              />
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  }

  return (
    <>
      <EntityHeader
        model={headerModel}
        onBack={() => router.back()}
        onAction={handleAction}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        platformIcons={platformIcons.length > 0 ? platformIcons : undefined}
        onPlatformIconClick={handlePlatformIconClick}
        activePlatformIcon={activePanel ?? undefined}
      />
      <div className="flex flex-col gap-2.5">
        {renderActiveTab()}
      </div>

      {/* Platform context panels — context-weight drawer: resizable, expandable, enriched header */}
      <DrawerShell
        open={activePanel !== null}
        onOpenChange={(open) => { if (!open) setActivePanel(null); }}
        intent="context"
        widthKey={activePanel ? `master:${entity.entity_code}:${activePanel}` : undefined}
        defaultWidth="60vw"
        minWidth="30vw"
        expandedWidth="80vw"
        maxWidth="85vw"
        resizable
        expandable
        badge={config.type_label ?? entity.entity_name.toUpperCase().replace(/_/g, " ")}
        title={
          activePanel ? (
            <span className="flex items-center gap-2">
              {PANEL_LABELS[activePanel] ?? activePanel}
              {(() => {
                const count = activePanel === "attachments" ? attachmentsCount : panelCount;
                return count !== null && count > 0 ? (
                  <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[11px] font-semibold bg-muted text-muted-foreground border border-border/60 leading-none tabular-nums">
                    {count}
                  </span>
                ) : null;
              })()}
            </span>
          ) : ""
        }
        subtitle={(() => {
          const base = data["code"]
            ? `${String(data["code"])}${data["name"] ? ` · ${String(data["name"])}` : ""}`
            : undefined;
          if (!base || activePanel !== "attachments" || attachmentsCount === 0) return base;
          const sizeStr = formatBytes(attachmentsTotalBytes);
          if (attachmentsQuarantined > 0) {
            return `${base} · ${sizeStr} · ${attachmentsInternal} internal · ${attachmentsQuarantined} quarantined`;
          }
          if (attachmentsShared > 0) {
            return `${base} · ${sizeStr} · ${attachmentsInternal} internal · ${attachmentsShared} shared`;
          }
          return (
            <>
              {base}{" · "}{sizeStr}{" · "}
              <Lock className="inline size-3 align-middle opacity-60" />
              {" All internal"}
            </>
          );
        })()}
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
            <CommentsPanel
              entityCode={entity.entity_code}
              recordId={recordId}
              onCountChange={setPanelCount}
            />
          )}
          {activePanel === "attachments" && (
            <AttachmentsPanel entityCode={entity.entity_code} recordId={recordId} />
          )}
          {activePanel === "activity" && (
            <EventsPanel
              entityCode={entity.entity_code}
              recordId={recordId}
              recordUuid={record.id}
            />
          )}
        </div>
      </DrawerShell>
    </>
  );
}

// ── SimpleDetailPage — generic master shell for detail_profile = "simple" / "read-only" ──

export interface SimpleDetailPageProps {
  entityCode:  string;
  recordId:    string;
  entity:      CompiledEntity;
  record:      { id: string; data: Record<string, unknown>; status?: string };
  operations:  EntityOperation[] | undefined;
  editMode?:   boolean;
  canEdit?:    boolean;
}

export function SimpleDetailPage({
  entityCode, recordId, entity, record, operations, editMode = false, canEdit = true,
}: SimpleDetailPageProps) {
  const router         = useRouter();
  const updateMutation = useUpdateEntity(entityCode, recordId);
  const opDispatch     = useOperationDispatch({ entityCode, recordId, recordUuid: record.id });
  const data           = record.data as Record<string, unknown>;
  const detailConfig   = resolveDetailConfig(entity);
  const masterConfig   = resolveMasterConfig(entity);
  const resolvedTabs   = resolveTabs(entity, null, []);
  const hasComments    = resolvedTabs.includes("comments");
  const hasActivity    = resolvedTabs.includes("events");

  const headerTabs: HeaderTab[] = [
    ...detailConfig.sections.map((s) => ({ id: s.group.group_key, label: s.group.label })),
    ...(hasComments ? [{ id: "__comments", label: "Comments" }] : []),
    ...(hasActivity  ? [{ id: "__activity", label: "Activity"  }] : []),
  ];

  const [activeTab, setActiveTab] = useState(headerTabs[0]?.id ?? "");

  const editAction = canEdit
    ? [{ id: "__edit", label: "Edit", placement: "secondary" as const, order: 999 }]
    : [];

  const headerModel = buildMasterHeaderModel(
    entity, data,
    {
      type_label:           masterConfig.type_label,
      classification_field: masterConfig.classification_field,
      header_facts:         masterConfig.header_facts,
    },
    headerTabs.length > 0 ? headerTabs : undefined,
    recordId, operations, false, false,
  );
  if (!headerModel.actions.some((a) => (a.id ?? "").toLowerCase().includes("edit")) && canEdit) {
    headerModel.actions = [...headerModel.actions, ...editAction];
  }

  // ── Edit mode ──────────────────────────────────────────────────────────────
  if (editMode) {
    const editConfig = resolveMasterConfig(entity);
    const editModel  = buildMasterHeaderModel(
      entity, data,
      { type_label: editConfig.type_label, classification_field: editConfig.classification_field },
      undefined, recordId, undefined, true, false,
    );
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

  // ── Read mode ──────────────────────────────────────────────────────────────
  function handleAction(id: string) {
    if (id === "__edit") { router.push(`/app/${entityCode}/${recordId}?mode=edit`); return; }
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
          <Card><CardContent className="pt-5"><CommentList entityType={entityCode} entityId={recordId} /></CardContent></Card>
        )}
        {activeTab === "__activity" && hasActivity && (
          <Card><CardContent className="pt-5"><EventsPanel entityCode={entityCode} recordId={recordId} /></CardContent></Card>
        )}
      </div>
    </>
  );
}

/** @deprecated Use MasterDetailPage / MasterDetailPageProps. */
export { MasterDetailPage as RichMasterDetailPage, type MasterDetailPageProps as RichMasterDetailPageProps };
