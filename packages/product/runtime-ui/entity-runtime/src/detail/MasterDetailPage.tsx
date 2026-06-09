"use client";

/**
 * MasterDetailPage — generic detail shell for master entities (detail_profile="rich").
 * All layout decisions live in SQL (display_config.master_config). Zero per-entity TSX.
 *
 * Tab renderers: overview | fields | child | composite | comments | attachments | activity | blank | summary_cards_with_drawer | contacts_channel_accordion | addresses_accordion
 * Platform panels: Comments / Attachments / Activity as icon buttons in the tab bar (Sheet slide-ins).
 */

import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUpdateEntity } from "@athyper/query";
import { MessageSquare, Paperclip, Clock, Plus, AlertCircle, Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button, Card, CardContent, CardHeader, CardTitle, Label, Skeleton,
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@athyper/ui/primitives";
import type {
  CompiledEntity, EntityField, EntityOperation,
  VisibilityCondition, CompletenessCheck,
} from "@athyper/api-contracts/metadata";
import { EntityHeader } from "../header";
import type { PlatformPanelIcon } from "../header/atoms/EntityTabBar";
import { AttachmentsPanel, CommentsPanel, EntityContextDrawer, EventsPanel } from "../panels";
import type { HeaderAction, HeaderTab } from "../header/types";
import { buildMasterHeaderModel, formatValue } from "../header/builders/buildMasterHeaderModel";
import { appEntityDetailHref, appEntityListHref, entitySlugFromCode, normalizeAppEntityHref, titleCase } from "@athyper/runtime-shared/core";
import {
  resolveDetailConfig,
  resolveMasterConfig,
  resolveTabs,
  type MasterConfig,
  type MasterTab,
  type MasterTabSection,
} from "@athyper/metadata-client/compiled-reader";
import { resolveFieldRenderer, BOOLEAN_UI_TYPES, BOOLEAN_FULL_WIDTH_UI_TYPES } from "../field-renderers";
import { CommentList } from "@athyper/collaboration-ui/comments";
import { useOperationDispatch } from "../actions/useOperationDispatch";
import { EntityForm, type EntityFormHandle } from "../form/EntityForm";
import { ChildSummaryCardsPanel, type ViewOnlyReason } from "./ChildSummaryCardsPanel";
import { PrintPreviewModal } from "@athyper/entity-print/modal";
import { ContactsChannelPanel } from "./ContactsChannelPanel";
import { AddressesPanel } from "./AddressesPanel";
import { SupplierCcExtensionTab } from "./SupplierCcExtensionTab";
import {
  configuredAuditFieldNames,
  configuredIdentityFieldNames,
  configuredStatusFieldNames,
  displayConfigRecord,
  documentHeaderRecord,
  editableEntityField,
  fieldExcludedFromCopy,
  fieldHiddenInSurface,
  fieldValueByName,
} from "../metadata/fieldSemantics";

// ── Public props ──────────────────────────────────────────────────────────────

export interface MasterDetailPageProps {
  entity:     CompiledEntity;
  record:     { id: string; data: Record<string, unknown>; status?: string };
  operations: EntityOperation[] | undefined;
  recordId:   string;
  editMode?:  boolean;
  returnTo?:   string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── KPI mini-card ─────────────────────────────────────────────────────────────

const DETAIL_FIELD_LABEL_CLASS = "text-xs font-medium leading-normal text-muted-foreground";
const DETAIL_FIELD_VALUE_CLASS = "text-sm leading-snug text-foreground";
const DETAIL_ITEM_TITLE_CLASS = "text-sm font-medium text-foreground";
const RECENT_RECORD_SNAPSHOT_EVENT = "athyper:recent-record-snapshot";
const PRINT_ACTION_ID = "__print";
const PRINT_ACTION: HeaderAction = {
  id:        PRINT_ACTION_ID,
  label:     "Print / Save PDF",
  placement: "overflow",
  order:     90,
  disabled:  false,
  icon:      "Printer",
  group:     "record",
};

function printActionEnabled(entity: CompiledEntity): boolean {
  const displayConfig = entity.display_config as Record<string, unknown> | undefined;
  if (!displayConfig || !Object.hasOwn(displayConfig, "print_config")) return false;
  const printConfig = displayConfig["print_config"] as Record<string, unknown> | undefined;
  return printConfig?.["enabled"] === true;
}

function appendPrintAction(entity: CompiledEntity, actions: HeaderAction[]): HeaderAction[] {
  if (!printActionEnabled(entity)) return actions;
  if (actions.some((action) => action.id === PRINT_ACTION_ID || action.id === "print")) return actions;
  return [...actions, { ...PRINT_ACTION }];
}

function plainRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function textConfig(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function safeInternalReturnHref(value: string | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

function operationLeafCode(op: EntityOperation): string {
  return op.permission_code.includes(".")
    ? op.permission_code.split(".").pop()!
    : op.permission_code;
}

function isEditNavigationOperation(op: EntityOperation): boolean {
  const code = operationLeafCode(op).toLowerCase();
  const target = (op.handler_target ?? "").toLowerCase();
  return code === "edit" || code === "update" || target === "edit";
}

function stringArrayConfig(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function booleanConfig(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeLifecycleValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function configuredLifecycleStages(entity: CompiledEntity): Record<string, unknown>[] {
  const displayConfig = displayConfigRecord(entity);
  const documentHeader = documentHeaderRecord(entity);
  const rawStages = Array.isArray(documentHeader.lifecycle_stages)
    ? documentHeader.lifecycle_stages
    : displayConfig.lifecycle_stages;
  return Array.isArray(rawStages)
    ? rawStages.map(plainRecord).filter((stage): stage is Record<string, unknown> => Boolean(stage))
    : [];
}

function lifecycleStageValue(stage: Record<string, unknown>): string | undefined {
  return textConfig(stage.key)
    ?? textConfig(stage.code)
    ?? textConfig(stage.value)
    ?? textConfig(stage.status);
}

function lifecycleStageEditable(stage: Record<string, unknown>): boolean | undefined {
  const explicitEditable =
    booleanConfig(stage.editable)
    ?? booleanConfig(stage.is_editable)
    ?? booleanConfig(stage.allows_edit)
    ?? booleanConfig(stage.allow_edit);
  if (explicitEditable !== undefined) return explicitEditable;

  const mutability = normalizeLifecycleValue(stage.mutability);
  if (mutability === "immutable" || mutability === "readonly" || mutability === "read_only") return false;
  if (mutability === "mutable" || mutability === "editable") return true;
  return undefined;
}

function configuredEditableLifecycleStatuses(entity: CompiledEntity): string[] {
  const displayConfig = displayConfigRecord(entity);
  const documentHeader = documentHeaderRecord(entity);
  return stringArrayConfig(documentHeader.editable_statuses ?? displayConfig.editable_statuses)
    .map(normalizeLifecycleValue)
    .filter(Boolean);
}

function immutableLifecycleViewOnlyReason(
  entity: CompiledEntity,
  data: Record<string, unknown>,
): ViewOnlyReason | null {
  const statusValue = configuredStatusFieldNames(entity)
    .map((fieldName) => fieldValueByName(entity, data, fieldName))
    .find((value) => value !== undefined && value !== null && value !== "");
  const normalizedStatus = normalizeLifecycleValue(statusValue);
  if (!normalizedStatus) return null;

  const stages = configuredLifecycleStages(entity);
  const stage = stages.find((item) => normalizeLifecycleValue(lifecycleStageValue(item)) === normalizedStatus);
  const stageEditable = stage ? lifecycleStageEditable(stage) : undefined;
  const editableStatuses = configuredEditableLifecycleStatuses(entity);
  const editableByConfiguredSet = editableStatuses.length > 0
    ? editableStatuses.includes(normalizedStatus)
    : undefined;

  if (stageEditable !== false && editableByConfiguredSet !== false) return null;

  const label = textConfig(stage?.label) ?? titleCase(normalizedStatus.replace(/_/g, " "));
  const entityLabel = entity.entity_name.replace(/_/g, " ");
  return {
    label:   `${label} - view only`,
    tooltip: `${label} ${entityLabel} cannot be edited in its current lifecycle state.`,
  };
}

function recentEntityLabel(entity: CompiledEntity): string {
  return titleCase((entity.entity_name || entity.entity_code).replace(/[_-]+/g, " ").toLowerCase());
}

function dispatchRecentRecordSnapshot({
  entity,
  recordId,
  recordCode,
  recordName,
  recordFamily,
}: {
  entity: CompiledEntity;
  recordId: string;
  recordCode: string;
  recordName?: string;
  recordFamily: "master" | "document";
}) {
  if (typeof window === "undefined") return;

  const code = recordCode.trim() || recordId;
  const name = recordName?.trim();
  const displayName = name && name.toLowerCase() !== code.toLowerCase() ? name : undefined;

  const detail = {
    href: appEntityDetailHref(entity.entity_code, recordId),
    label: displayName ?? code,
    refCode: code,
    entityCode: entity.entity_code,
    entityLabel: recentEntityLabel(entity),
    recordCode: code,
    recordName: displayName,
    recordFamily,
  };

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(RECENT_RECORD_SNAPSHOT_EVENT, { detail }));
  }, 0);
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/40 px-4 py-3">
      <p className={DETAIL_FIELD_LABEL_CLASS}>{label}</p>
      <p className={cn("mt-1 truncate", DETAIL_FIELD_VALUE_CLASS)}>{value}</p>
    </div>
  );
}

// ── Overview renderer — header_facts KPI cards + child-tab shortcuts ──────────

function OverviewRenderer({
  entity,
  data,
  recordUuid,
  config,
  sections,
  childTabs,
  editMode,
  viewOnlyReason,
  onTabChange,
}: {
  entity:      CompiledEntity;
  data:        Record<string, unknown>;
  recordUuid:  string;
  config:      MasterConfig;
  sections:    MasterTabSection[];
  childTabs:   MasterTab[];
  editMode:    boolean;
  viewOnlyReason: ViewOnlyReason | null;
  onTabChange: (id: string) => void;
}) {
  const kpiItems = (config.header_facts ?? []).slice(0, 4).map((fieldName) => {
    const field      = entity.fields.find((f) => f.name === fieldName);
    const fieldValue = field ? extractFieldValue(data, field) : data[fieldName];
    return {
      label: field?.label ?? titleCase(fieldName),
      value: formatValue(fieldValue, field),
    };
  });

  return (
    <div className="space-y-4">
      {/* Completeness strip — driven entirely by master_config.completeness_checks */}
      {(config.completeness_checks?.length ?? 0) > 0 && (
        <CompletenessStrip
          checks={config.completeness_checks!}
          recordUuid={recordUuid}
          record={{ data }}
          onTabChange={onTabChange}
        />
      )}
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
                <span className={DETAIL_ITEM_TITLE_CLASS}>{tab.label}</span>
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
      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((section) => {
            const content = (() => {
              if (section.type === "fields") {
                return (
                  <FieldsRenderer
                    entity={entity}
                    data={data}
                    displayFieldNames={section.display_fields}
                  />
                );
              }

              if (section.type === "child" && section.entity_code) {
                return (
                  <ChildEntityPanel
                    tab={{
                      id:                section.id,
                      label:             section.label,
                      renderer:          "child",
                      entity_code:       section.entity_code,
                      display_fields:    section.display_fields,
                      add_href_template: section.add_href_template,
                      add_label:         section.add_label,
                      owner_type_filter: section.owner_type_filter,
                      party_type_filter: section.party_type_filter,
                      through_entity:    section.through_entity,
                      empty_title:       section.empty_title,
                      empty_description: section.empty_description,
                    }}
                    recordUuid={resolveParentId(section.parent_id_field, recordUuid, data)}
                    editMode={editMode}
                    viewOnlyReason={viewOnlyReason}
                  />
                );
              }

              if (section.type === "child_list" && section.entity_code) {
                return (
                  <ChildListSection
                    section={section}
                    recordUuid={resolveParentId(section.parent_id_field, recordUuid, data)}
                    editMode={editMode}
                    viewOnlyReason={viewOnlyReason}
                  />
                );
              }

              return <EmptyState title={section.label} description="Section not yet configured." />;
            })();

            return (
              <section key={section.id} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <h3 className={DETAIL_ITEM_TITLE_CLASS}>{section.label}</h3>
                </div>
                {content}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Fields renderer — view mode (read-only field grid) ────────────────────────

function configuredDetailSkipNames(entity: CompiledEntity): Set<string> {
  const audit = configuredAuditFieldNames(entity);
  return new Set([
    ...configuredIdentityFieldNames(entity),
    ...Object.values(audit).filter((value): value is string => typeof value === "string"),
  ]);
}

function fieldGroupGridClass(columns: 1 | 2 | 3 | undefined): string {
  if (columns === 1) return "grid grid-cols-1 gap-x-6 gap-y-4";
  if (columns === 2) return "grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2";
  return "grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3";
}

function FieldsRenderer({
  entity,
  data,
  displayFieldNames,
}: {
  entity:              CompiledEntity;
  data:                Record<string, unknown>;
  displayFieldNames?:  string[];
}) {
  const { field_groups, fields } = entity;
  const skipNames = configuredDetailSkipNames(entity);

  const displayFields = fields
    .filter((f) =>
      !skipNames.has(f.name) &&
      !fieldHiddenInSurface(f, "detail") &&
      f.origin !== "system" &&
      f.data_type !== "lifecycle_state" &&
      (displayFieldNames ? displayFieldNames.includes(f.name) : true),
    )
    .sort((a, b) =>
      displayFieldNames
        ? (displayFieldNames.indexOf(a.name) - displayFieldNames.indexOf(b.name))
        : (a.sort_order ?? 0) - (b.sort_order ?? 0),
    );

  if (displayFields.length === 0) {
    return (
      <EmptyState
        title="No profile fields configured"
        description="Add field definitions to this entity to display profile data here."
      />
    );
  }

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
        {sections.map(({ group, fields: gFields }) => (
          <Card key={group.group_key}>
            <CardContent className="pt-5">
              <h4 className={cn("mb-4", DETAIL_ITEM_TITLE_CLASS)}>
                {group.label}
              </h4>
              <div className={fieldGroupGridClass(group.columns as 1 | 2 | 3 | undefined)}>
                {gFields.map((field) => (
                  <FieldCell
                    key={field.name}
                    field={field}
                    value={extractFieldValue(data, field)}
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
                    value={extractFieldValue(data, field)}
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
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
            {displayFields.map((field) => (
              <FieldCell
                key={field.name}
                field={field}
                value={extractFieldValue(data, field)}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Extracts the raw field value from a record, correctly handling fields whose
 * physical column_name is "metadata" (JSONB). For those fields the logical
 * field.name is the key inside the metadata object, not a top-level key.
 */
function extractFieldValue(data: Record<string, unknown>, field: EntityField): unknown {
  const direct = data[field.name];
  if (direct !== undefined) return direct;

  if (field.column_name === "metadata") {
    const meta = data["metadata"];
    if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
      return (meta as Record<string, unknown>)[field.name] ?? null;
    }
    return null;
  }

  return data[field.column_name ?? ""] ?? null;
}

function FieldCell({ field, value }: { field: EntityField; value: unknown }) {
  const Renderer = resolveFieldRenderer(field);
  return (
    <div>
      <dt className={cn("mb-1", DETAIL_FIELD_LABEL_CLASS)}>
        {field.label ?? field.name}
      </dt>
      <dd className={DETAIL_FIELD_VALUE_CLASS}>
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
  const skipNames = configuredDetailSkipNames(entity);

  const editableFields = fields
    .filter(
      (f) =>
        !f.is_readonly &&
        f.origin !== "system" &&
        f.data_type !== "lifecycle_state" &&
        !skipNames.has(f.name) &&
        !fieldHiddenInSurface(f, "edit") &&
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

  const FULL_WIDTH_INLINE_UI_TYPES = new Set([
    "textarea", "rich_text", "json_editor", "markdown", "code_editor",
  ]);

  function isInlineFieldFullWidth(field: EntityField): boolean {
    const uiType = field.ui_type ?? field.data_type;
    if (BOOLEAN_FULL_WIDTH_UI_TYPES.has(uiType)) return true;
    if (FULL_WIDTH_INLINE_UI_TYPES.has(uiType)) return true;
    const hint = (field.ui_hint ?? {}) as Record<string, unknown>;
    return hint["col_span"] === "full";
  }

  const renderGrid = (flds: typeof editableFields, columns?: 1 | 2 | 3) => (
    <div className={fieldGroupGridClass(columns)}>
      {flds.map((field) => {
        const Renderer = resolveFieldRenderer(field);
        const val = extractFieldValue(formData, field);
        const effectiveUiType = field.ui_type ?? field.data_type;
        const embedsLabel = BOOLEAN_UI_TYPES.has(effectiveUiType);
        const isFullWidth = isInlineFieldFullWidth(field);
        return (
          <div key={field.name} className={isFullWidth ? "space-y-1.5 col-span-full" : "space-y-1.5"}>
            {!embedsLabel && (
              <Label>
                {field.label ?? field.name}
                {field.is_required && <span className="ml-1 text-destructive">*</span>}
              </Label>
            )}
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
          <h4 className={cn("mb-3", DETAIL_ITEM_TITLE_CLASS)}>
            {group.label}
          </h4>
          {renderGrid(gFields, group.columns as 1 | 2 | 3 | undefined)}
        </div>
      ))}
      {ungrouped.length > 0 && renderGrid(ungrouped)}
    </div>
  );
}

// ── Child entity panel ────────────────────────────────────────────────────────

// List endpoint returns flat rows (all columns at top level, not nested under "data").
type ChildRecord = Record<string, unknown>;

function resolveParentId(
  parentIdField: string | undefined,
  recordUuid:    string,
  data:          Record<string, unknown>,
): string {
  if (parentIdField) {
    const val = data[parentIdField];
    if (typeof val === "string" && val) return val;
  }
  return recordUuid;
}

function childScopeKey(tab: Pick<MasterTab, "owner_type_filter" | "party_type_filter" | "through_entity">): string {
  return [
    tab.owner_type_filter ? `owner:${tab.owner_type_filter}` : "",
    tab.party_type_filter ? `party:${tab.party_type_filter}` : "",
    tab.through_entity    ? `via:${tab.through_entity}`      : "",
  ].filter(Boolean).join("|");
}

function buildChildRecordsUrl(entityCode: string, parentId: string, tab: MasterTab): string {
  const params = new URLSearchParams({ parent_id: parentId });
  if (tab.owner_type_filter) params.set("owner_type_filter", tab.owner_type_filter);
  if (tab.party_type_filter) params.set("party_type_filter", tab.party_type_filter);
  if (tab.through_entity)    params.set("through_entity",    tab.through_entity);
  return `/api/relay/api/records/${encodeURIComponent(entityCode)}?${params.toString()}`;
}

function applyScopeFilters(data: Record<string, unknown>, tab: MasterTab): Record<string, unknown> {
  return {
    ...data,
    ...(tab.owner_type_filter ? { owner_type: tab.owner_type_filter } : {}),
    ...(tab.party_type_filter ? { party_type: tab.party_type_filter } : {}),
  };
}

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

  const childQueryKey = ["child-entity", entityCode, recordUuid, childScopeKey(tab)] as const;

  const { data, isLoading, isError } = useQuery<{ data: ChildRecord[] }>({
    queryKey: childQueryKey,
    queryFn: async ({ signal }) => {
      const res = await fetch(buildChildRecordsUrl(entityCode, recordUuid, tab), { signal });
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
      const scopedFormData = applyScopeFilters(formData, tab);
      const primaryBody = linkEntityCode
        ? { data: scopedFormData }
        : { data: { ...scopedFormData, parent_id: recordUuid } };

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

      // Step 2 (two-step only): create the configured polymorphic link record.
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
  const canAdd        = editMode && !viewOnlyReason && !!tab.add_href_template;

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
                  <p className={cn("truncate", DETAIL_ITEM_TITLE_CLASS)}>
                    {primary || recId.slice(0, 8) + "…"}
                  </p>
                  {secondary && (
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{secondary}</p>
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
  // Resolve which sections pass their visibility conditions.
  // Gated sections default to visible while the check is in-flight so the nav
  // doesn't flicker. After load, sections with no matching child records are
  // removed from the nav and their content is suppressed.
  const { map: visMap, loading: visLoading } = useVisibilityMap(sections, recordUuid);
  const visibleSections = sections.filter((s) => visMap[s.id] !== false);

  const [activeSection, setActiveSection] = useState(sections[0]?.id ?? "");

  // When visibility resolves and the active section is gated-out, move to the
  // first visible section to avoid rendering a hidden content area.
  const firstVisibleId = visibleSections[0]?.id ?? "";
  const effectiveActive = visibleSections.some((s) => s.id === activeSection)
    ? activeSection
    : firstVisibleId;

  if (sections.length === 0) {
    return <EmptyState title="No sections configured" description="Add composite_sections to the tab config." />;
  }

  return (
    <div className="flex gap-6">
      {/* Left section nav — only shows sections whose visibility resolved to true */}
      <nav className="w-36 shrink-0 space-y-0.5 pt-0.5">
        {visLoading && visibleSections.length === 0 ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
          </div>
        ) : (
          visibleSections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm rounded-md transition-colors",
                effectiveActive === s.id
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {s.label}
            </button>
          ))
        )}
      </nav>

      {/* Section content */}
      <div className="flex-1 min-w-0">
        {sections.map((s) => {
          // Hide sections not in visibleSections or not the active one.
          if (visMap[s.id] === false) return null;
          const isActive = s.id === effectiveActive;

          const content = (() => {
            if (s.type === "fields") {
              return editMode && editFormData && onFieldChange ? (
                <InlineEditSection
                  entity={entity}
                  formData={editFormData}
                  onFieldChange={onFieldChange}
                  displayFieldNames={s.display_fields}
                />
              ) : (
                <FieldsRenderer
                  entity={entity}
                  data={data}
                  displayFieldNames={s.display_fields}
                />
              );
            }

            if (s.type === "child" && s.entity_code) {
              return (
                <ChildEntityPanel
                  tab={{
                    id:                s.id,
                    label:             s.label,
                    renderer:          "child",
                    entity_code:       s.entity_code,
                    display_fields:    s.display_fields,
                    add_href_template: s.add_href_template,
                    add_label:         s.add_label,
                    owner_type_filter: s.owner_type_filter,
                    party_type_filter: s.party_type_filter,
                    through_entity:    s.through_entity,
                    empty_title:       s.empty_title,
                    empty_description: s.empty_description,
                  }}
                  recordUuid={resolveParentId(s.parent_id_field, recordUuid, data)}
                  editMode={editMode}
                  viewOnlyReason={viewOnlyReason}
                />
              );
            }

            // child_list — delegated to ChildSummaryCardsPanel via ChildListSection.
            if (s.type === "child_list" && s.entity_code) {
              return (
                <ChildListSection
                  section={s}
                  recordUuid={resolveParentId(s.parent_id_field, recordUuid, data)}
                  editMode={editMode}
                  viewOnlyReason={viewOnlyReason}
                />
              );
            }

            return <EmptyState title={s.label} description="Section not yet configured." />;
          })();

          return (
            <div key={s.id} className={isActive ? "" : "hidden"}>
              {content}
            </div>
          );
        })}
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

// ── Visibility gate — hides a section when a child entity has no records ──────
//
// Evaluated client-side via a single lightweight fetch (?limit=1).
// While loading: renders a skeleton so nav layout stays stable.
// After load with zero records: returns null (section + nav pill both hidden
// by the parent CompositeRenderer which checks the visibility map).

function useVisibilityMap(
  sections: MasterTabSection[],
  recordUuid: string,
): { map: Record<string, boolean>; loading: boolean } {
  const gatedSections = useMemo(
    () => sections.filter((s) => s.visibility_condition),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections.map((s) => s.id + (s.visibility_condition?.entity_code ?? "")).join(",")],
  );

  const { data, isPending } = useQuery<Record<string, boolean>>({
    queryKey: [
      "vis-map",
      recordUuid,
      gatedSections.map((s) => `${s.id}:${s.visibility_condition!.entity_code}`).join(","),
    ],
    queryFn: async ({ signal }) => {
      const results = await Promise.all(
        gatedSections.map(async (s) => {
          const cond = s.visibility_condition!;
          const params = new URLSearchParams({ parent_id: recordUuid, limit: "1" });
          if (cond.owner_type_filter) params.set("owner_type_filter", cond.owner_type_filter);
          if (cond.party_type_filter) params.set("party_type_filter", cond.party_type_filter);
          const res = await fetch(
            `/api/relay/api/records/${encodeURIComponent(cond.entity_code)}?${params}`,
            { signal },
          );
          if (!res.ok) return [s.id, false] as const;
          const json = await res.json() as { data: unknown[] };
          return [s.id, (json.data?.length ?? 0) > 0] as const;
        }),
      );
      return Object.fromEntries(results);
    },
    enabled: gatedSections.length > 0,
    staleTime: 60_000,
  });

  const map: Record<string, boolean> = {};
  for (const s of sections) {
    if (!s.visibility_condition) {
      map[s.id] = true;
    } else {
      // Default true while loading so nav pills don't flicker out then back in.
      map[s.id] = isPending ? true : (data?.[s.id] ?? false);
    }
  }
  return { map, loading: isPending && gatedSections.length > 0 };
}

// ── Child-list section — card list for child entity inside a composite tab ────
//
// Converts a MasterTabSection (type=child_list) to the MasterTab shape that
// ChildSummaryCardsPanel expects, then delegates entirely to that component.
// add_href_template is passed through for direct child-list sections. Through
// sections can omit it when creation needs a more specific parent context.

function ChildListSection({
  section,
  recordUuid,
  editMode,
  viewOnlyReason,
}: {
  section:        MasterTabSection;
  recordUuid:     string;
  editMode:       boolean;
  viewOnlyReason: ViewOnlyReason | null;
}) {
  const tabShape: MasterTab = {
    id:                  section.id,
    label:               section.label,
    renderer:            "summary_cards_with_drawer",
    entity_code:         section.entity_code,
    display_fields:      section.display_fields,
    add_href_template:   section.add_href_template,
    add_label:           section.add_label,
    owner_type_filter:   section.owner_type_filter,
    party_type_filter:   section.party_type_filter,
    through_entity:      section.through_entity,
    empty_title:         section.empty_title,
    empty_description:   section.empty_description,
    config:              section.config,
  };

  return (
    <ChildSummaryCardsPanel
      tab={tabShape}
      recordUuid={recordUuid}
      editMode={editMode}
      viewOnlyReason={viewOnlyReason}
    />
  );
}

// ── Completeness strip — meta-driven, max 3 items, severity-ordered ───────────
//
// Reads master_config.completeness_checks. For checks with role_gate,
// fetches the role entity once (shared query). For child_field_expiry and
// child_any_match, fetches child entity records in a single batched query.
// Only field_null requires no network call. child_missing is accepted in the
// schema but skipped until the address entity is registered.
//
// CSS: uses semantic tokens only — text-destructive / text-warning / text-info.

const SEVERITY_ORDER = { blocking: 0, warning: 1, info: 2 } as const;

function CompletenessStrip({
  checks,
  recordUuid,
  record,
  onTabChange,
}: {
  checks:      CompletenessCheck[];
  recordUuid:  string;
  record:      { data: Record<string, unknown> };
  onTabChange: (id: string) => void;
}) {
  const needsCustomer = checks.some((c) => c.role_gate === "customer");
  const needsSupplier = checks.some((c) => c.role_gate === "supplier");

  const childEntities = useMemo(
    () => [...new Set(checks.filter((c) => c.child_entity).map((c) => c.child_entity!))],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checks.map((c) => c.key).join(",")],
  );

  const { data: customerData } = useQuery<{ data: unknown[] }>({
    queryKey: ["completeness-role", "customer", recordUuid],
    queryFn:  async ({ signal }) => {
      const res = await fetch(`/api/relay/api/records/customer?parent_id=${recordUuid}&limit=1`, { signal });
      return res.ok ? (res.json() as Promise<{ data: unknown[] }>) : { data: [] };
    },
    enabled:   needsCustomer,
    staleTime: 5 * 60_000,
  });

  const { data: supplierData } = useQuery<{ data: unknown[] }>({
    queryKey: ["completeness-role", "supplier", recordUuid],
    queryFn:  async ({ signal }) => {
      const res = await fetch(`/api/relay/api/records/supplier?parent_id=${recordUuid}&limit=1`, { signal });
      return res.ok ? (res.json() as Promise<{ data: unknown[] }>) : { data: [] };
    },
    enabled:   needsSupplier,
    staleTime: 5 * 60_000,
  });

  const { data: childRecordMap } = useQuery<Record<string, Record<string, unknown>[]>>({
    queryKey: ["completeness-children", recordUuid, childEntities.join(",")],
    queryFn:  async ({ signal }) => {
      const pairs = await Promise.all(
        childEntities.map(async (code) => {
          const res = await fetch(
            `/api/relay/api/records/${encodeURIComponent(code)}?parent_id=${recordUuid}`,
            { signal },
          );
          if (!res.ok) return [code, []] as const;
          const json = await res.json() as { data: Record<string, unknown>[] };
          return [code, json.data ?? []] as const;
        }),
      );
      return Object.fromEntries(pairs);
    },
    enabled:   childEntities.length > 0,
    staleTime: 60_000,
  });

  const customerExists = (customerData?.data?.length ?? 0) > 0;
  const supplierExists = (supplierData?.data?.length ?? 0) > 0;

  const items = checks
    .filter((c) => {
      if (c.role_gate === "customer" && !customerExists) return false;
      if (c.role_gate === "supplier" && !supplierExists) return false;
      return true;
    })
    .flatMap((c): Array<{ key: string; message: string; tabTarget?: string; severity: "blocking" | "warning" | "info" }> => {
      // ── field_null: no network call, just inspect parent record data ──────
      if (c.check_type === "field_null") {
        const field = c.check_config?.["field"] as string | undefined;
        if (!field) return [];
        const val = record.data[field];
        if (val !== null && val !== undefined && val !== "") return [];
        return [{ key: c.key, message: c.message, tabTarget: c.tab_target, severity: c.severity }];
      }

      // ── child_field_expiry: surface the earliest expiring record ─────────
      if (c.check_type === "child_field_expiry" && c.child_entity) {
        const recs       = childRecordMap?.[c.child_entity] ?? [];
        const field      = (c.check_config?.["field"] as string | undefined) ?? "effective_until";
        const threshold  = c.check_config?.["threshold_days"] as number | undefined ?? 90;
        const cutoff     = new Date();
        cutoff.setDate(cutoff.getDate() + threshold);
        const now        = new Date();
        const expiring   = recs.filter((r) => {
          const d = r[field] ? new Date(String(r[field])) : null;
          return d && d >= now && d <= cutoff;
        });
        if (!expiring.length) return [];
        const earliest = expiring.reduce((a, b) =>
          new Date(String(a[field])) < new Date(String(b[field])) ? a : b,
        );
        const dateStr = new Date(String(earliest[field])).toLocaleDateString("en-GB", {
          day: "numeric", month: "short",
        });
        return [{
          key:       c.key,
          message:   c.message.replace("{date}", dateStr),
          tabTarget: c.tab_target,
          severity:  c.severity,
        }];
      }

      // ── child_any_match: fire if any record matches a field/values filter ─
      if (c.check_type === "child_any_match" && c.child_entity) {
        const recs   = childRecordMap?.[c.child_entity] ?? [];
        const field  = c.check_config?.["field"]  as string   | undefined;
        const values = c.check_config?.["values"] as string[] | undefined;
        if (!field || !values?.length) return [];
        const match = recs.some((r) => values.includes(String(r[field] ?? "")));
        if (!match) return [];
        return [{ key: c.key, message: c.message, tabTarget: c.tab_target, severity: c.severity }];
      }

      // child_missing — deferred until address entity is registered.
      return [];
    })
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 2) - (SEVERITY_ORDER[b.severity] ?? 2))
    .slice(0, 3);

  if (!items.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
      {items.map((item, i) => (
        <button
          key={item.key}
          type="button"
          onClick={() => item.tabTarget && onTabChange(item.tabTarget)}
          className={cn(
            "flex items-center gap-1.5 text-xs",
            item.severity === "blocking" ? "text-destructive" :
            item.severity === "warning"  ? "text-warning"     : "text-muted-foreground",
            item.tabTarget ? "cursor-pointer hover:underline" : "cursor-default",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
              item.severity === "blocking" ? "bg-destructive" :
              item.severity === "warning"  ? "bg-warning"     : "bg-muted-foreground",
            )}
          />
          {item.message}
          {i < items.length - 1 && (
            <span aria-hidden className="ml-3 text-border">·</span>
          )}
        </button>
      ))}
    </div>
  );
}

// ── Platform panel labels + default widths ────────────────────────────────────

// ── Main component ────────────────────────────────────────────────────────────

export function MasterDetailPage({
  entity,
  record,
  operations,
  recordId,
  editMode = false,
  returnTo,
}: MasterDetailPageProps) {
  const router         = useRouter();
  const data           = record.data;
  const updateMutation = useUpdateEntity(entity.entity_code, recordId);
  const config         = resolveMasterConfig(entity);
  const returnToHref   = safeInternalReturnHref(returnTo);
  const formRef        = useRef<EntityFormHandle>(null);
  const [isDirty, setIsDirty]         = useState(false);
  const [printOpen, setPrintOpen]     = useState(false);
  const [activePanel, setActivePanel]             = useState<string | null>(null);
  const [panelCount,  setPanelCount]              = useState<number | null>(null);
  const [commentSearchOpen, setCommentSearchOpen] = useState(false);
  const [commentFiltersOn,  setCommentFiltersOn]  = useState(true);
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
    const lifecycleReason = immutableLifecycleViewOnlyReason(entity, data);
    if (lifecycleReason) return lifecycleReason;

    const editOp = (operations ?? []).find(
      (op) =>
        (op.surface === "DETAIL" || op.surface === "BOTH") &&
        op.permission_code.toLowerCase().includes("edit"),
    );
    if (editOp?.is_enabled) return null;

    const entityLabel = entity.entity_name.replace(/_/g, " ");
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
    queryKey: ["collab-comments", entity.entity_code, record.id],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        entityType: entity.entity_code,
        entityId:   record.id,
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

  // Build platform icons with live counts
  const platformIcons: PlatformPanelIcon[] = useMemo(
    () => {
      const icons: PlatformPanelIcon[] = [];
      for (const panelId of config.platform_panels ?? []) {
        switch (panelId) {
          case "comments":
            icons.push({
              id: "comments", icon: <MessageSquare className="h-5 w-5" />, label: "Comments",
              count:        commentsCount > 0 ? commentsCount : undefined,
              countPending: hasPlatformComments && commentsCountQuery.isPending,
            });
            break;
          case "attachments":
            icons.push({
              id: "attachments", icon: <Paperclip className="h-5 w-5" />, label: "Attachments",
              count:        attachmentsCount > 0 ? attachmentsCount : undefined,
              countPending: hasPlatformAttachments && attachmentsCountQuery.isPending,
            });
            break;
          case "activity":
            icons.push({ id: "activity", icon: <Clock className="h-5 w-5" />, label: "Activity" });
            break;
        }
      }

      return icons;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      config.platform_panels,
      commentsCount, commentsCountQuery.isPending,
      attachmentsCount, attachmentsCountQuery.isPending,
    ],
  );

  const headerModel = useMemo(() => {
    const base = buildMasterHeaderModel(
      entity, data,
      {
        type_label:           config.type_label,
        classification_field: config.classification_field,
      },
      headerTabs, recordId, operations, editMode, isDirty,
    );
    return {
      ...base,
      actions: appendPrintAction(entity, base.actions),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity, data, config, recordId, operations, editMode, isDirty]);

  useEffect(() => {
    dispatchRecentRecordSnapshot({
      entity,
      recordId,
      recordCode: headerModel.identity.number,
      recordName: headerModel.identity.name,
      recordFamily: "master",
    });
  }, [entity, recordId, headerModel.identity.number, headerModel.identity.name]);

  const opDispatch = useOperationDispatch({
    entityCode: entity.entity_code,
    recordId,
    recordUuid: record.id,
    statusFieldName: configuredStatusFieldNames(entity)[0],
  });

  const detailHref = (mode?: "edit") => {
    const params = new URLSearchParams();
    if (mode === "edit") params.set("mode", "edit");
    if (returnToHref) params.set("returnTo", returnToHref);
    return appEntityDetailHref(entity.entity_code, recordId, undefined, params);
  };

  function handleAction(actionId: string) {
    if (editMode) {
      if (actionId === "__exit" || actionId === "__discard") {
        setIsDirty(false);
        setEditFormData(data);
        router.replace(detailHref());
        return;
      }
      if (actionId === "__save") {
        const activeTabDef = rawTabs.find((t) => t.id === activeTab);
        if (activeTabDef?.renderer === "composite") {
          // Composite tabs use lifted editFormData — submit directly.
          const skipNames = configuredDetailSkipNames(entity);
          const editableNames = new Set(
            entity.fields
              .filter(
                (f) =>
                  !f.is_readonly &&
                  f.origin !== "system" &&
                  f.data_type !== "lifecycle_state" &&
                  !skipNames.has(f.name) &&
                  !fieldHiddenInSurface(f, "edit"),
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
              router.replace(detailHref());
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
    if (actionId === PRINT_ACTION_ID || actionId === "print") {
      setPrintOpen(true);
      return;
    }
    const op = (operations ?? []).find((o) => o.permission_code === actionId);
    if (!op) return;
    if (isEditNavigationOperation(op)) {
      router.push(detailHref("edit"));
      return;
    }
    if (op.handler_type === "NAVIGATE" && op.handler_target) {
      router.push(normalizeAppEntityHref(op.handler_target
        .replace("{id}", encodeURIComponent(recordId))
        .replace("{entityCode}", entity.entity_code)
        .replace("{entity}", entitySlugFromCode(entity.entity_code))));
      return;
    }
    void opDispatch.dispatch(actionId, operations ?? []);
  }

  function handlePlatformIconClick(id: string) {
    setActivePanel((prev) => {
      if (prev === id) {
        setCommentSearchOpen(false);
        setCommentFiltersOn(true);
        return null;
      }
      if (id !== "comments") {
        setCommentSearchOpen(false);
        setCommentFiltersOn(true);
      }
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
                recordUuid={record.id}
                config={config}
                sections={activeTabDef.composite_sections ?? []}
                childTabs={childTabs}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
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
              router.replace(detailHref());
            }}
            onCancel={() => {
              setIsDirty(false);
              router.replace(detailHref());
            }}
            onChange={() => setIsDirty(true)}
            submitting={updateMutation.isPending}
            hideActions
            noFrame
          />
        ) : (
          <FieldsRenderer entity={entity} data={data} />
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
                recordUuid={resolveParentId(activeTabDef.parent_id_field, record.id, data)}
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
                recordUuid={resolveParentId(activeTabDef.parent_id_field, record.id, data)}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Child entity not configured" description="Set entity_code in the tab config." />
        );

      case "contacts_channel_accordion":
        return activeTabDef.entity_code ? (
          <Card>
            <CardContent className="pt-5">
              <ContactsChannelPanel
                tab={activeTabDef}
                recordUuid={record.id}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
              />
            </CardContent>
          </Card>
        ) : (
          <EmptyState title="Contact entity not configured" description="Set entity_code in the tab config." />
        );

      case "addresses_accordion":
        return (
          <Card>
            <CardContent className="pt-5">
              <AddressesPanel
                tab={activeTabDef}
                recordUuid={record.id}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
              />
            </CardContent>
          </Card>
        );

      case "comments":
        return (
          <Card>
            <CardContent className="pt-5">
              <CommentsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} />
            </CardContent>
          </Card>
        );

      case "attachments":
        return (
          <Card>
            <CardContent className="pt-5">
              <AttachmentsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} />
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

      case "supplier_cc_extension":
        return (
          <Card>
            <CardContent className="pt-5">
              <SupplierCcExtensionTab
                supplierUuid={record.id}
                editMode={editMode}
                viewOnlyReason={viewOnlyReason}
                tab={activeTabDef}
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
        onBack={() => returnToHref ? router.push(returnToHref) : router.back()}
        editMode={editMode}
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
      <EntityContextDrawer
        open={activePanel !== null}
        onOpenChange={(open) => { if (!open) setActivePanel(null); }}
        activePanel={activePanel}
        widthScope="master"
        entity={entity}
        recordId={recordId}
        recordData={data}
        typeLabel={config.type_label}
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
                  onClick={() => setCommentSearchOpen((prev) => !prev)}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    commentSearchOpen
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
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
                  aria-label="Toggle comment filters"
                  onClick={() => setCommentFiltersOn((prev) => !prev)}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                    !commentFiltersOn
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <SlidersHorizontal className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {commentFiltersOn ? "Hide filters" : "Show filters"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : undefined}
      >
        <div className="px-6 py-5">
          {activePanel === "comments" && (
            <CommentsPanel
              entityCode={entity.entity_code}
              recordId={recordId}
              recordUuid={record.id}
              onCountChange={setPanelCount}
              searchOpen={commentSearchOpen}
              showFilters={commentFiltersOn}
            />
          )}
          {activePanel === "attachments" && (
            <AttachmentsPanel entityCode={entity.entity_code} recordId={recordId} recordUuid={record.id} />
          )}
          {activePanel === "activity" && (
            <EventsPanel
              entityCode={entity.entity_code}
              recordId={recordId}
              recordUuid={record.id}
            />
          )}
        </div>
      </EntityContextDrawer>

      <PrintPreviewModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        entity={entity}
        record={record}
        entityCode={entity.entity_code}
      />
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
  returnTo?:    string;
  canEdit?:    boolean;
}

export function SimpleDetailPage({
  entityCode, recordId, entity, record, operations, editMode = false, returnTo, canEdit = true,
}: SimpleDetailPageProps) {
  const router         = useRouter();
  const updateMutation = useUpdateEntity(entityCode, recordId);
  const returnToHref   = safeInternalReturnHref(returnTo);
  const opDispatch     = useOperationDispatch({
    entityCode,
    recordId,
    recordUuid: record.id,
    statusFieldName: configuredStatusFieldNames(entity)[0],
  });
  const data         = record.data as Record<string, unknown>;
  const masterConfig = resolveMasterConfig(entity);
  const viewSections = useMemo(() => {
    const detailConfig = resolveDetailConfig(entity);
    if (detailConfig.sections.length > 0) return detailConfig.sections;

    const fields = entity.fields
      .filter((f) => f.origin !== "system" && !fieldHiddenInSurface(f, "detail"))
      .sort((a, b) => a.sort_order - b.sort_order);

    return fields.length > 0
      ? [{
          group: {
            group_key:   "general",
            label:       "General",
            description: null,
            sort_order:  0,
            columns:     2 as const,
            page_span:   "half" as const,
            fields:      fields.map((f) => f.name),
          },
          fields,
        }]
      : [];
  }, [entity]);
  // Single Overview tab — all fields displayed together
  const headerTabs: HeaderTab[] = [{ id: "__overview", label: "Overview" }];

  const [activeTab,   setActiveTab]   = useState("__overview");
  const [activePanel, setActivePanel] = useState<string | null>(null);
  const formRef  = useRef<EntityFormHandle>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  const detailHref = (mode?: "edit") => {
    const params = new URLSearchParams();
    if (mode === "edit") params.set("mode", "edit");
    if (returnToHref) params.set("returnTo", returnToHref);
    return appEntityDetailHref(entityCode, recordId, undefined, params);
  };

  // Platform panel gating — identical to MasterDetailPage: driven by masterConfig.platform_panels
  const hasPlatformComments    = (masterConfig.platform_panels ?? []).includes("comments");
  const hasPlatformAttachments = (masterConfig.platform_panels ?? []).includes("attachments");

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
  const commentsCount    = commentsCountQuery.data?.data?.length ?? 0;
  const attachmentsCount = attachmentsCountQuery.data?.length ?? 0;

  // Build platform icons — same shape as MasterDetailPage, driven by platform_panels order
  const platformIcons: PlatformPanelIcon[] = useMemo(
    () => {
      const icons: PlatformPanelIcon[] = [];
      for (const panelId of masterConfig.platform_panels ?? []) {
        switch (panelId) {
          case "comments":
            icons.push({ id: "comments",    icon: <MessageSquare className="h-5 w-5" />, label: "Comments",    count: commentsCount    > 0 ? commentsCount    : undefined, countPending: hasPlatformComments    && commentsCountQuery.isPending });
            break;
          case "attachments":
            icons.push({ id: "attachments", icon: <Paperclip     className="h-5 w-5" />, label: "Attachments", count: attachmentsCount > 0 ? attachmentsCount : undefined, countPending: hasPlatformAttachments && attachmentsCountQuery.isPending });
            break;
          case "activity":
            icons.push({ id: "activity",    icon: <Clock         className="h-5 w-5" />, label: "Activity" });
            break;
        }
      }

      return icons;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [masterConfig.platform_panels, commentsCount, commentsCountQuery.isPending, attachmentsCount, attachmentsCountQuery.isPending],
  );

  // Standard CRUD actions — injected only when not already provided by DB operations
  const mutable = entity.display_config.detail_profile !== "read-only";
  const editAction = canEdit && mutable
    ? [{ id: "__edit",   label: "Edit",   placement: "primary"  as const, order: 10 }]
    : [];
  const copyAction = canEdit && mutable
    ? [{ id: "__copy",   label: "Copy",   placement: "overflow" as const, order: 20, group: "record" as const }]
    : [];
  const deleteAction = canEdit && mutable
    ? [{ id: "__delete", label: "Delete", placement: "danger"   as const, order: 30, group: "record" as const }]
    : [];

  // Build header model — edit mode gets Save/Discard actions; view mode gets Edit/Copy/Delete injected
  const headerModel = editMode
    ? buildMasterHeaderModel(
        entity, data,
        { type_label: masterConfig.type_label, classification_field: masterConfig.classification_field },
        headerTabs, recordId, undefined, true, isDirty,
      )
    : (() => {
        const m = buildMasterHeaderModel(
          entity, data,
          { type_label: masterConfig.type_label, classification_field: masterConfig.classification_field },
          headerTabs, recordId, operations, false, false,
        );
        if (!m.actions.some((a) => (a.id ?? "").toLowerCase().includes("edit")) && canEdit && mutable)
          m.actions = [...editAction, ...m.actions];
        if (!m.actions.some((a) => (a.id ?? "").toLowerCase().includes("copy")) && canEdit && mutable)
          m.actions = [...m.actions, ...copyAction];
        if (!m.actions.some((a) => (a.id ?? "").toLowerCase().includes("delete")) && canEdit && mutable)
          m.actions = [...m.actions, ...deleteAction];
        m.actions = appendPrintAction(entity, m.actions);
        return m;
      })();

  useEffect(() => {
    dispatchRecentRecordSnapshot({
      entity,
      recordId,
      recordCode: headerModel.identity.number,
      recordName: headerModel.identity.name,
      recordFamily: "master",
    });
  }, [entity, recordId, headerModel.identity.number, headerModel.identity.name]);

  function handleAction(id: string) {
    if (id === PRINT_ACTION_ID || id === "print") {
      setPrintOpen(true);
      return;
    }

    if (editMode) {
      if (id === "__exit" || id === "__discard") {
        setIsDirty(false);
        router.replace(detailHref());
      } else if (id === "__save") {
        void formRef.current?.submit();
      }
      return;
    }

    if (id === "__edit") {
      router.push(detailHref("edit"));
      return;
    }

    if (id === "__copy") {
      const skipNames = configuredDetailSkipNames(entity);
      const copyData = Object.fromEntries(
        entity.fields
          .filter((f) => editableEntityField(f) && !skipNames.has(f.name) && !fieldExcludedFromCopy(f))
          .map((f) => [f.name, extractFieldValue(data, f)])
          .filter(([, v]) => v !== undefined && v !== null),
      );
      void (async () => {
        const res = await fetch(`/api/relay/api/records/${encodeURIComponent(entityCode)}`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ data: copyData }),
        });
        if (!res.ok) return;
        const created = await res.json() as Record<string, unknown>;
        const newId = String(created["id"] ?? "");
        router.push(newId ? appEntityDetailHref(entityCode, newId) : appEntityListHref(entityCode));
      })();
      return;
    }

    if (id === "__delete") {
      if (!confirm(`Delete this record? This cannot be undone.`)) return;
      void (async () => {
        const res = await fetch(
          `/api/relay/api/records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`,
          { method: "DELETE" },
        );
        if (!res.ok) return;
        router.push(appEntityListHref(entityCode));
      })();
      return;
    }

    const op = (operations ?? []).find((o) => o.permission_code === id);
    if (!op) return;
    if (isEditNavigationOperation(op)) {
      router.push(detailHref("edit"));
      return;
    }
    if (op.handler_type === "NAVIGATE" && op.handler_target) {
      router.push(normalizeAppEntityHref(op.handler_target
        .replace("{id}", encodeURIComponent(recordId))
        .replace("{entityCode}", entityCode)
        .replace("{entity}", entitySlugFromCode(entityCode))));
      return;
    }
    void opDispatch.dispatch(id, operations ?? []);
  }

  return (
    <>
      <EntityHeader
        model={headerModel}
        onBack={() => returnToHref ? router.push(returnToHref) : router.back()}
        editMode={editMode}
        onAction={handleAction}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        platformIcons={platformIcons.length > 0 ? platformIcons : undefined}
        onPlatformIconClick={(id) => setActivePanel((prev) => (prev === id ? null : id))}
        activePlatformIcon={activePanel ?? undefined}
      />
      <div className="flex flex-col gap-2.5">
        {editMode ? (
          <EntityForm
            ref={formRef}
            entityCode={entityCode}
            initialData={data}
            onSubmit={async (formData) => {
              await updateMutation.mutateAsync(formData);
              setIsDirty(false);
              router.replace(detailHref());
            }}
            onCancel={() => {
              setIsDirty(false);
              router.replace(detailHref());
            }}
            onChange={() => setIsDirty(true)}
            submitting={updateMutation.isPending}
            hideActions
            noFrame
          />
        ) : (
          activeTab === "__overview" && (() => {
            const multiSection = viewSections.length > 1;
            return viewSections.map((section) => {
            const colClass = fieldGroupGridClass(section.group.columns as 1 | 2 | 3 | undefined);
            return (
              <Card key={section.group.group_key}>
                {multiSection && (
                  <CardHeader>
                    <CardTitle className="text-base">{section.group.label}</CardTitle>
                  </CardHeader>
                )}
                <CardContent className={multiSection ? undefined : "pt-6"}>
                  <div className={colClass}>
                    {section.fields.map((field) => {
                      const Renderer = resolveFieldRenderer(field);
                      const hint = (field.ui_hint ?? {}) as Record<string, unknown>;
                      const isWide = hint["col_span"] === "full";
                      return (
                        <div key={field.name} className={cn("space-y-1", isWide && "col-span-full")}>
                          <p className="text-xs font-medium text-muted-foreground leading-normal">
                            {field.label ?? field.name}
                          </p>
                          <div className="text-sm text-foreground leading-snug">
                            <Renderer
                              value={extractFieldValue(data, field)}
                              field={field}
                              mode="view"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
            });
          })()
        )}
      </div>

      {/* Platform context panels — slide-in drawer, present in both view and edit modes */}
      <EntityContextDrawer
        open={activePanel !== null}
        onOpenChange={(open) => { if (!open) setActivePanel(null); }}
        activePanel={activePanel}
        widthScope="simple"
        entity={entity}
        recordId={recordId}
        recordData={data}
        typeLabel={masterConfig.type_label}
      >
        <div className="px-6 py-5">
          {activePanel === "comments"    && <CommentsPanel    entityCode={entityCode} recordId={recordId} recordUuid={record.id} />}
          {activePanel === "attachments" && <AttachmentsPanel entityCode={entityCode} recordId={recordId} recordUuid={record.id} />}
          {activePanel === "activity" && (
            <EventsPanel entityCode={entityCode} recordId={recordId} recordUuid={record.id} />
          )}
        </div>
      </EntityContextDrawer>

      <PrintPreviewModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        entity={entity}
        record={record}
        entityCode={entityCode}
      />
    </>
  );
}
