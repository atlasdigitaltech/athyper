"use client";

/**
 * RichMasterDetailPage — generic detail shell for master entities.
 *
 * One component drives ALL master entities with detail_renderer = "rich_master".
 * No per-entity TSX files — all layout decisions live in SQL:
 *   display_config.rich_master_config.tabs        → ordered tab list
 *   display_config.rich_master_config.header_facts → P2 KPI rail field names
 *   display_config.rich_master_config.type_label  → P1 chip label
 *   display_config.rich_master_config.platform_panels → side-panel icons
 *
 * Tab renderers:
 *   "overview"    — KPI cards from header_facts + child-tab shortcut links
 *   "fields"      — entity field grid (view) / EntityForm (edit)
 *   "child"       — child entity list panel, driven by entity_code + display_fields
 *   "composite"   — anchored section nav + stacked sections (fields or child)
 *   "comments"    — CommentsPanel
 *   "attachments" — AttachmentsPanel
 *   "activity"    — EventsPanel
 *   "blank"       — placeholder with blank_message
 *
 * Platform panels (Comments / Attachments / Activity) are surfaced as icon
 * buttons in the tab bar (right side) and open as Sheet slide-ins, NOT as tabs.
 *
 * Adding a new master entity with rich tabs = SQL only. Zero new TSX files.
 */

import { useState, useMemo, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUpdateEntity } from "@athyper/query";
import { MessageSquare, Paperclip, Clock, Plus, AlertCircle, Lock } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { adminStatusIntent } from "@athyper/theme/domain-intents";
import type { SemanticIntent } from "@athyper/theme/semantic-colors";
import {
  Button, Card, CardContent, Skeleton,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
  Tooltip, TooltipContent, TooltipTrigger,
} from "@athyper/ui/primitives";
import type { CompiledEntity, EntityField, EntityOperation } from "@athyper/api-contracts/metadata";
import { EntityHeader } from "../header";
import type { PlatformPanelIcon } from "../header/atoms/EntityTabBar";
import { AttachmentsPanel, CommentsPanel, EventsPanel } from "../panels";
import type { EntityHeaderModel, HeaderAction, HeaderTab } from "../header/types";
import {
  resolveRichMasterConfig,
  type RichMasterConfig,
  type RichMasterTab,
  type RichMasterTabSection,
} from "@athyper/metadata-client/compiled-reader";
import { resolveFieldRenderer } from "../field-renderers/registry";
import { useOperationDispatch } from "../actions/useOperationDispatch";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";

// ── Public props ──────────────────────────────────────────────────────────────

export interface RichMasterDetailPageProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
  editMode?:  boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(val: unknown): string {
  if (!val) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    }).format(new Date(String(val)));
  } catch {
    return String(val);
  }
}

function formatValue(val: unknown, field?: EntityField): string {
  if (val === null || val === undefined || val === "") return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  const dt = field?.data_type;
  if (dt === "date" || dt === "datetime" || dt === "timestamptz") return formatDate(val);
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) return formatDate(val);
  if (dt === "enum" || dt === "lifecycle_state") return titleCase(String(val));
  return String(val);
}

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Placement map for operation → HeaderAction ────────────────────────────────

const PLACEMENT_MAP: Record<string, "primary" | "secondary" | "overflow" | "danger"> = {
  PRIMARY:  "primary",
  TOOLBAR:  "secondary",
  OVERFLOW: "overflow",
  CONTEXT:  "overflow",
  COMMAND:  "overflow",
};

// ── Header model ──────────────────────────────────────────────────────────────

function buildHeaderModel(
  entity:     CompiledEntity,
  data:       Record<string, unknown>,
  config:     RichMasterConfig,
  tabs:       HeaderTab[] | undefined,
  recordId:   string,
  operations: EntityOperation[] | undefined,
  editMode:   boolean,
  isDirty:    boolean,
): EntityHeaderModel {
  const statusField  = entity.display_config.status_field_names?.[0] ?? "status";
  const statusVal    = String(data[statusField] ?? "active").toLowerCase();
  const statusIntent = adminStatusIntent(statusVal);

  // Inline classification: "· Vendor" — driven by config.classification_field, no hardcoding
  const classField   = config.classification_field
    ? entity.fields.find((f) => f.name === config.classification_field)
    : undefined;
  const classRawVal  = config.classification_field
    ? (data[config.classification_field] ?? (classField?.column_name ? data[classField.column_name] : undefined))
    : undefined;
  const classification = classRawVal ? formatValue(classRawVal, classField) : undefined;

  // P1 — identity
  const titleFieldName    = entity.display_config.title_field;
  const subtitleFieldName = entity.display_config.subtitle_field;
  const title       = titleFieldName && data[titleFieldName]
    ? String(data[titleFieldName])
    : undefined;
  const description = subtitleFieldName &&
    data[subtitleFieldName] &&
    data[subtitleFieldName] !== data[titleFieldName ?? ""]
      ? String(data[subtitleFieldName])
      : undefined;

  const typeLabel  = config.type_label
    ?? entity.entity_name.toUpperCase().replace(/_/g, " ");
  const codeNumber = data["code"] ? String(data["code"]) : recordId;

  const editStatus = isDirty
    ? { label: "Unsaved changes", intent: "warning" as SemanticIntent }
    : { label: "Editing",         intent: "info"    as SemanticIntent };

  let actions: HeaderAction[];
  if (editMode) {
    actions = isDirty
      ? [
          { id: "__save",    label: "Save",    placement: "primary",   order: 1 },
          { id: "__discard", label: "Discard", placement: "secondary", order: 2 },
        ]
      : [
          { id: "__exit", label: "Exit", placement: "secondary", order: 1 },
        ];
  } else {
    const detailOps = (operations ?? []).filter(
      (op) => op.surface === "DETAIL" || op.surface === "BOTH",
    );
    actions = detailOps.map((op) => ({
      id:        op.permission_code,
      label:     op.label_override ?? titleCase(op.permission_code),
      placement: PLACEMENT_MAP[op.placement] ?? "overflow",
      order:     op.sort_order,
      disabled:  !op.is_enabled,
      icon:      op.icon_override ?? undefined,
    }));
  }

  return {
    identity: {
      typeLabel,
      typeHref:       `/app/${entity.entity_code}`,
      number:         codeNumber,
      classification,
      title,
      description,
      identifierAction: "copy",
      status: editMode
        ? editStatus
        : { label: titleCase(statusVal), intent: statusIntent },
    },
    actions,
    facts: undefined,
    tabs,
  };
}

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
  config:      RichMasterConfig;
  childTabs:   RichMasterTab[];
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

interface ViewOnlyReason {
  label:   string;
  tooltip: string;
}

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

// ── Child entity panel ────────────────────────────────────────────────────────

// List endpoint returns flat rows (all columns at top level, not nested under "data").
type ChildRecord = Record<string, unknown>;

function ChildEntityPanel({
  tab,
  recordUuid,
  editMode,
  viewOnlyReason,
}: {
  tab:            RichMasterTab;
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
              .map((f) => rec[f])
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
}: {
  entity:         CompiledEntity;
  data:           Record<string, unknown>;
  sections:       RichMasterTabSection[];
  recordUuid:     string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
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
              <FieldsRenderer entity={entity} data={data} viewOnlyReason={null} />
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

// ── Platform panel label ──────────────────────────────────────────────────────

const PANEL_LABELS: Record<string, string> = {
  comments:    "Comments",
  attachments: "Attachments",
  activity:    "Activity",
};

// ── Main component ────────────────────────────────────────────────────────────

export function RichMasterDetailPage({
  entity,
  record,
  operations,
  recordId,
  editMode = false,
}: RichMasterDetailPageProps) {
  const router         = useRouter();
  const data           = record.data;
  const updateMutation = useUpdateEntity(entity.entity_code, recordId);
  const config         = resolveRichMasterConfig(entity);
  const formRef        = useRef<EntityFormHandle>(null);
  const [isDirty, setIsDirty]     = useState(false);
  const [activePanel, setActivePanel] = useState<string | null>(null);

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

  const attachmentsCountQuery = useQuery<unknown[]>({
    queryKey: ["attachments", entity.entity_code, recordId],
    queryFn: async ({ signal }) => {
      const res = await fetch(
        `/api/relay/api/documents/${encodeURIComponent(entity.entity_code)}/${encodeURIComponent(recordId)}/attachments`,
        { signal },
      );
      if (!res.ok) return [];
      return res.json() as Promise<unknown[]>;
    },
    staleTime: 30_000,
    enabled: hasPlatformAttachments,
  });

  const commentsCount    = commentsCountQuery.data?.data?.length ?? 0;
  const attachmentsCount = Array.isArray(attachmentsCountQuery.data) ? attachmentsCountQuery.data.length : 0;

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
    () => buildHeaderModel(entity, data, config, headerTabs, recordId, operations, editMode, isDirty),
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
        router.push(`/app/${entity.entity_code}/${recordId}`);
        return;
      }
      if (actionId === "__save") {
        void formRef.current?.submit();
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
    setActivePanel((prev) => (prev === id ? null : id));
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

      {/* Platform context panels — slide in from right, do not navigate */}
      <Sheet open={activePanel !== null} onOpenChange={(open) => { if (!open) setActivePanel(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <SheetTitle>{activePanel ? (PANEL_LABELS[activePanel] ?? activePanel) : ""}</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {activePanel === "comments" && (
              <CommentsPanel entityCode={entity.entity_code} recordId={recordId} />
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
        </SheetContent>
      </Sheet>
    </>
  );
}
