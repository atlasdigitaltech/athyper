import type { ReactNode } from "react";
import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { ToolbarButton, WorkPanel } from "@athyper/surface-kit";
import { ArrowLeft } from "lucide-react";
import {
  entityHeaderShellClass,
  headerIdentityPaddingClass,
  headerSecondaryActionClass,
  headerTabBarClass,
  typeChipBackButtonClass,
  typeChipClass,
  typeChipStaticLabelClass,
} from "./header/header-chrome";
import {
  compileMetaEntityRuntimeDescriptor,
  resolveRuntimeOperations,
  type MetaEntityCapabilities,
  type MetaEntityField,
  type MetaEntityOperation,
  type MetaEntityRuntimeDescriptor,
  type MetaEntitySurface,
  type ProcessRuntimeState,
} from "@athyper/runtime-contracts";
import { RuntimeEditForm, RuntimeEditState } from "./edit/runtime-edit-form";
import { RuntimeDescriptorEditWorkspace } from "./edit/runtime-descriptor-edit-workspace";
import { RuntimeListPage } from "./list/runtime-list-page";
import { RuntimeRecordWorkspace } from "./record/runtime-record-workspace";
import { RuntimeFieldValueView } from "./fields/runtime-field-value-view";
import { buildRuntimeRecordChromeModel } from "./record/runtime-header-model";
import { DescriptorSurfaceShell } from "./surfaces/surface-shell";
import type { RuntimeListState, RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { readRuntimeCanvasFlags, type RuntimeCanvasFlags } from "./surfaces/types";
import {
  operationIntent,
  isCanonicalAction,
  operationHref,
  currentModeHref,
  type RuntimeMode,
} from "./operation-utils";
import {
  formatFieldValue,
  formatFieldTitle,
  formatRecordValue,
  formatRecordTitle,
  readRecordValue,
  toNonBlankString,
} from "@athyper/runtime-shared/meta-entity";

declare const process: { env: { NODE_ENV: string } };

export type { SurfaceErrorContext } from "./surfaces/surface-shell";
export type { RuntimeListPagination, RuntimeListState, RuntimeRecordRow } from "@athyper/runtime-shared/core";
export { RuntimeListPage };
export { RuntimeEditState } from "./edit/runtime-edit-form";
export {
  DocumentObjectPageWorkspace,
  type DocumentObjectPageWorkspaceProps,
} from "./record/document-object-page-workspace";
export { toEntityEditState } from "./record/document-edit-session-adapter";
export {
  buildRuntimeRecordChromeModel,
  type RuntimeRecordChromeModel,
} from "./record/runtime-header-model";
export { getSurfaceRenderer } from "./surfaces/registry";
export { readRuntimeCanvasFlags, type RuntimeCanvasFlags } from "./surfaces/types";
export {
  useOperationDispatch,
  type UseOperationDispatchOptions,
  type UseOperationDispatchReturn,
} from "./actions";
export {
  getRegistrySize,
  registerDefaultFieldRenderers,
  registerFieldRenderer,
  resolveFieldRenderer,
  RuntimeFieldValueView,
  type FieldRendererProps,
} from "./fields";
export { FlowModal, type FlowModalProps } from "./flow";
export {
  AuditSummaryStrip,
  RuntimeEntityActionBar,
  RuntimeEntityHeader,
  RuntimeEntityIdentityBar,
  RuntimeEntityTabBar,
  resolveAuditSummaryData,
} from "./header";
export type {
  AuditSummaryActor,
  AuditSummaryData,
  AuditSummaryStripProps,
  EntityHeaderModel,
  HeaderAction,
  HeaderAudit,
  HeaderAuditMeta,
  HeaderFact,
  HeaderIdentity,
  HeaderMode,
  HeaderTab,
  PlatformPanelIcon,
  RuntimeEntityActionBarProps,
  RuntimeEntityHeaderProps,
  RuntimeEntityIdentityBarProps,
  RuntimeEntityTabBarProps,
  ResolveAuditSummaryInput,
} from "./header";
export {
  AttachmentsPanel,
  CommentsPanel,
  EntityContextDrawer,
  EventsPanel,
  type AttachmentsPanelProps,
  type CommentsPanelProps,
  type EntityContextDrawerAttachmentSummary,
  type EntityContextDrawerProps,
  type EventsPanelProps,
} from "./panels";

interface RuntimeBaseProps {
  plane: PlaneKey;
  entity: string;
  descriptor?: MetaEntityRuntimeDescriptor;
  copyRecord?: RuntimeRecordRow;
  initialRecord?: RuntimeRecordRow;
}

interface RuntimeDetailPageProps extends RuntimeBaseProps {
  id: string;
  record?: RuntimeRecordRow;
  processState?: ProcessRuntimeState;
  detailState?: RuntimeListState;
}

interface RuntimeEditPageProps extends RuntimeDetailPageProps {}

export function RuntimeNewPage({ plane, entity, descriptor, copyRecord, initialRecord }: RuntimeBaseProps) {
  const config = getPlaneConfig(plane);
  const contract = resolveRuntimeDescriptor(entity, descriptor);
  const editableFields = resolveEditableFields(contract, "create");
  const disabled = !contract.capabilities.canCreate || config.mutationMode === "read-only";
  const formRecord = mergeInitialRecord(copyRecord, initialRecord);
  const listHref = currentModeHref(contract, "list");
  const typeLabel = contract.entityName;

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* Header shell — matches the detail/edit page card chrome */}
      <div className={entityHeaderShellClass}>
        {/* Identity bar */}
        <div className={headerIdentityPaddingClass}>
          {/* Desktop */}
          <div className="hidden sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-4">
            <div className={typeChipClass}>
              <a href={listHref} aria-label={`Back to ${typeLabel} list`} className={typeChipBackButtonClass}>
                <ArrowLeft aria-hidden className="size-4" />
              </a>
              <span className={typeChipStaticLabelClass}>{typeLabel}</span>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex flex-1 items-center gap-3">
                <span className="text-sm font-medium text-foreground">New</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium leading-none text-muted-foreground">
                  <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                  New
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={listHref} className={headerSecondaryActionClass}>Cancel</a>
              </div>
            </div>
          </div>
          {/* Mobile */}
          <div className="flex flex-col gap-1.5 sm:hidden">
            <div className="flex items-center gap-2">
              <div className={typeChipClass}>
                <a href={listHref} aria-label={`Back to ${typeLabel} list`} className={typeChipBackButtonClass}>
                  <ArrowLeft aria-hidden className="size-4" />
                </a>
                <span className={typeChipStaticLabelClass}>{typeLabel}</span>
              </div>
              <div className="flex-1" />
              <a href={listHref} className={headerSecondaryActionClass}>Cancel</a>
            </div>
            <div className="flex flex-wrap items-center gap-2 px-0.5">
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-sm font-medium leading-none text-muted-foreground">
                <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
                New
              </span>
            </div>
          </div>
        </div>
        {/* Tab bar — single Details tab, always active */}
        <div className={headerTabBarClass}>
          <span className="relative flex h-11 shrink-0 items-center whitespace-nowrap text-sm font-medium text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-foreground">
            Details
          </span>
        </div>
      </div>

      {/* Form body */}
      <div className="min-h-0 flex-1 overflow-auto px-0.5 py-1">
        {disabled ? (
          <WorkPanel title="Create">
            <RuntimeEditState title="Create unavailable" message={config.mutationPolicy} />
          </WorkPanel>
        ) : (
          <RuntimeEditForm
            fields={editableFields}
            descriptor={contract}
            record={formRecord}
            entitySlug={contract.routeSlug}
            listHref={listHref}
            csrfCookieName={config.csrfCookieName}
            mode="create"
          />
        )}
      </div>
    </div>
  );
}

function mergeInitialRecord(
  copyRecord: RuntimeRecordRow | undefined,
  initialRecord: RuntimeRecordRow | undefined,
): RuntimeRecordRow | undefined {
  if (!copyRecord) return initialRecord;
  if (!initialRecord) return copyRecord;
  const copyData = isRecord(copyRecord.data) ? copyRecord.data : {};
  const initialData = isRecord(initialRecord.data) ? initialRecord.data : {};
  return {
    ...copyRecord,
    ...initialRecord,
    data: {
      ...copyData,
      ...initialData,
    },
  };
}

export function RuntimeDetailPage({ plane, entity, id, descriptor, record, processState, detailState }: RuntimeDetailPageProps) {
  const contract = resolveRuntimeDescriptor(entity, descriptor);
  const flags = readRuntimeCanvasFlags(contract);
  const chrome = buildRuntimeRecordChromeModel({
    contract,
    record,
    recordId: id,
    mode: "detail",
    processState,
    flags,
  });

  return (
    <RuntimeRecordWorkspace
      contract={contract}
      record={record}
      recordId={id}
      chrome={chrome}
      processState={processState}
      flags={flags}
    >
      {flags.descriptorSurfaceShell ? (
        <DescriptorSurfaceShell
          contract={contract}
          record={record}
          recordId={id}
          processState={processState}
          detailState={detailState}
          flags={flags}
        />
      ) : (
        <RuntimeDetailShell
          fields={resolveDetailFields(contract)}
          recordId={id}
          record={record}
          detailState={detailState}
          flags={flags}
          entityCode={contract.entityCode}
        />
      )}
    </RuntimeRecordWorkspace>
  );
}

export function RuntimeEditPage({ plane, entity, id, descriptor, record, processState, detailState }: RuntimeEditPageProps) {
  const config = getPlaneConfig(plane);
  const contract = resolveRuntimeDescriptor(entity, descriptor);
  const disabled = !contract.capabilities.canEdit || contract.capabilities.isReadOnly || config.mutationMode === "read-only";
  const flags = readRuntimeCanvasFlags(contract);
  const chrome = buildRuntimeRecordChromeModel({
    contract,
    record,
    recordId: id,
    mode: "edit",
    processState,
    flags,
  });

  if (detailState?.status !== "unavailable" && !disabled) {
    return (
      <RuntimeDescriptorEditWorkspace
        contract={contract}
        record={record}
        recordId={id}
        chrome={chrome}
        processState={processState}
        csrfCookieName={config.csrfCookieName}
      />
    );
  }

  return (
    <RuntimeRecordWorkspace
      contract={contract}
      record={record}
      recordId={id}
      chrome={chrome}
      processState={processState}
      editMode
    >
      <WorkPanel title="Edit">
        {detailState?.status === "unavailable" ? (
          <RuntimeEditState
            title="Record unavailable"
            message={detailState.message ?? "This record could not be loaded in the active organization scope."}
          />
        ) : disabled ? (
          <RuntimeEditState title="Edit unavailable" message={config.mutationPolicy} />
        ) : null}
      </WorkPanel>
    </RuntimeRecordWorkspace>
  );
}

function resolveRuntimeDescriptor(
  routeEntity: string,
  descriptor?: MetaEntityRuntimeDescriptor,
): MetaEntityRuntimeDescriptor {
  if (descriptor) return descriptor;

  if (process.env.NODE_ENV !== "development") {
    throw new Error(
      `RuntimeCanvas: no descriptor provided for entity "${routeEntity}". ` +
      `In production, all runtime pages must pass a compiled descriptor prop.`,
    );
  }

  const entityCode = routeEntity.trim().replace(/-/g, "_");
  const routeSlug = routeEntity.trim().replace(/_/g, "-");
  const entityName = toTitleLabel(entityCode);

  return compileMetaEntityRuntimeDescriptor({
    entity_code: entityCode,
    slug: routeSlug,
    entity_name: entityName,
    entity_class: "MASTER",
    table_schema: "master",
    table_name: entityCode,
    backing_type: "table",
    display_config: {
      detail_renderer: "simple",
      title_field: "name",
      list_columns: ["id", "name", "status", "updated_at"],
    },
    feature_flags: {
      has_attachments: false,
      comments_enabled: false,
      event_history: false,
      version_control: false,
    },
    fields: [
      field("id", "ID", "uuid", 0, { isReadOnly: true, isFilterable: true }),
      field("name", "Name", "text", 10, { isSearchable: true, isSortable: true }),
      field("status", "Status", "text", 20, { isFilterable: true, isSortable: true }),
      field("updated_at", "Updated At", "datetime", 30, { isReadOnly: true, isSortable: true }),
    ],
    compiled_at: new Date(0).toISOString(),
  }, {
    entityPolicy: {
      access_mode: "default_allow",
      audit_mode: "enabled",
    },
  });
}

function field(
  name: string,
  label: string,
  dataType: string,
  sortOrder: number,
  flags: Partial<{
    isReadOnly: boolean;
    isSearchable: boolean;
    isFilterable: boolean;
    isSortable: boolean;
  }> = {},
) {
  return {
    name,
    label,
    data_type: dataType,
    sort_order: sortOrder,
    is_read_only: flags.isReadOnly ?? false,
    is_searchable: flags.isSearchable ?? false,
    is_filterable: flags.isFilterable ?? false,
    is_sortable: flags.isSortable ?? false,
  };
}

function RuntimeActions({
  contract,
  mode,
  recordId,
}: {
  contract: MetaEntityRuntimeDescriptor;
  mode: RuntimeMode;
  recordId?: string;
}) {
  const actions: ReactNode[] = [];

  if (mode === "list" && contract.capabilities.canCreate) {
    actions.push(
      <ToolbarButton key="new" href={resolveCreateHref(contract)}>
        New
      </ToolbarButton>,
    );
  }

  if (mode === "detail" && contract.capabilities.canEdit && recordId) {
    actions.push(
      <ToolbarButton key="edit" href={resolveEditHref(contract, recordId)}>
        Edit
      </ToolbarButton>,
    );
  }

  if (mode === "edit" && recordId) {
    actions.push(
      <ToolbarButton key="view" href={currentModeHref(contract, "detail", recordId)}>
        View
      </ToolbarButton>,
    );
  }

  const overflow = mode === "new" ? [] : resolveRuntimeOperations({
    descriptor: contract,
    mode,
    record: recordId ? { id: recordId } : undefined,
    includeDisabled: false,
    includeWorkflowTaskOperations: false,
  })
    .map((resolved) => resolved.operation)
    .filter((operation) => operation.placement === "PRIMARY" || operation.placement === "TOOLBAR")
    .filter((operation) => !isCanonicalAction(operation, mode))
    .slice(0, 3);

  for (const operation of overflow) {
    const href = operationHref(contract, operation, mode, recordId);
    actions.push(
      <ToolbarButton key={operation.key} href={href}>
        {operation.label ?? operationLabel(operation)}
      </ToolbarButton>,
    );
  }

  return actions.length ? <>{actions}</> : undefined;
}

function resolveCreateHref(contract: MetaEntityRuntimeDescriptor): string {
  const createOperation = contract.operations.find((operation) => (
    operation.enabled
    && !operation.isRecordRequired
    && (operation.surface === "LIST" || operation.surface === "BOTH")
    && operationIntent(operation) === "create"
  ));

  return createOperation
    ? operationHref(contract, createOperation, "list")
    : `/app/${contract.routeSlug}/new`;
}

function resolveEditHref(contract: MetaEntityRuntimeDescriptor, recordId: string): string {
  const editOperation = contract.operations.find((operation) => (
    operation.enabled
    && (operation.surface === "DETAIL" || operation.surface === "BOTH")
    && operationIntent(operation) === "edit"
  ));

  return editOperation
    ? operationHref(contract, editOperation, "detail", recordId)
    : `/app/${contract.routeSlug}/${encodeURIComponent(recordId)}/edit`;
}

function RuntimeContractSummary({
  contract,
  planePolicy,
}: {
  contract: MetaEntityRuntimeDescriptor;
  planePolicy: string;
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <SummaryTile label="Renderer" value={contract.renderer} />
      <SummaryTile label="Version" value={contract.source.versionNo ? `v${contract.source.versionNo}` : "current"} />
      <SummaryTile label="Fields" value={String(contract.fields.length)} />
      <SummaryTile label="Policy" value={contract.capabilities.isReadOnly ? "read-only" : planePolicy} />
      <div className="md:col-span-2 xl:col-span-4">
        <CapabilityChips capabilities={contract.capabilities} />
      </div>
    </section>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function CapabilityChips({ capabilities }: { capabilities: MetaEntityCapabilities }) {
  const chips = [
    capabilities.canRead ? "Read" : null,
    capabilities.canCreate ? "Create" : null,
    capabilities.canEdit ? "Edit" : null,
    capabilities.canDelete ? "Delete" : null,
    capabilities.hasLineItems ? "Lines" : null,
    capabilities.hasChildRecords ? "Children" : null,
    capabilities.hasWorkflow ? "Workflow" : null,
    capabilities.hasLifecycle ? "Lifecycle" : null,
    capabilities.hasAttachments ? "Attachments" : null,
    capabilities.hasComments ? "Comments" : null,
    capabilities.hasActivityLog ? "Activity" : null,
    capabilities.hasAuditTrail ? "Audit" : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip}
          className="inline-flex h-7 items-center rounded-md border bg-muted px-2 text-xs font-medium text-foreground"
        >
          {chip}
        </span>
      ))}
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function RuntimeDetailShell({
  fields,
  recordId,
  record,
  detailState,
  flags,
  entityCode,
}: {
  fields: MetaEntityField[];
  recordId: string;
  record?: RuntimeRecordRow;
  detailState?: RuntimeListState;
  flags?: RuntimeCanvasFlags;
  entityCode?: string;
}) {
  const useSharedRenderers = flags?.sharedFieldRenderers ?? false;

  return (
    <div id="fields">
      <WorkPanel title="General">
        {detailState?.status === "unavailable" ? (
          <RuntimeEditState
            title="Record unavailable"
            message={detailState.message ?? "This record could not be loaded in the active organization scope."}
          />
        ) : (
          <dl className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {fields.map((fieldItem) => {
              const fallbackValue = fallbackDetailValue(fieldItem, recordId);
              const displayValue = record
                ? formatFieldValue(record, fieldItem)
                : formatRecordValue(fallbackValue, fieldItem);
              const title = record
                ? formatFieldTitle(record, fieldItem)
                : formatRecordTitle(fallbackValue, fieldItem);

              return (
                <div key={fieldItem.key} className="py-1">
                  <dt className="text-sm font-medium text-muted-foreground">{fieldItem.label}</dt>
                  <dd title={title} className="mt-0.5 truncate text-sm font-medium text-foreground">
                    {useSharedRenderers && record ? (
                      <RuntimeFieldValueView
                        field={fieldItem}
                        record={record}
                        sourceEntityCode={entityCode}
                      />
                    ) : (
                      displayValue
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </WorkPanel>
    </div>
  );
}

function resolveDetailFields(contract: MetaEntityRuntimeDescriptor): MetaEntityField[] {
  return contract.fields;
}

// Origins that are never editable from the create/edit form. system fields
// (id, tenant_id, audit timestamps, etc.) and server-derived values must not
// surface as input controls. Matches HARD_EXCLUDED_ORIGINS in field-editability.ts.
const FORM_HARD_EXCLUDED_ORIGINS = new Set(["system", "server"]);

function asEditabilityRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readEditabilityBool(record: Record<string, unknown> | null, ...keys: string[]): boolean | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    if (typeof record[key] === "boolean") return record[key] as boolean;
  }
  return undefined;
}

function asVisibilityRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function visibilityHidesSurface(field: MetaEntityField, surface: "create" | "edit"): boolean {
  const vis = asVisibilityRecord(field.visibility);
  if (!vis) return false;
  if (vis["hidden"] === true) return true;
  const hideRaw = vis["hideIn"] ?? vis["hide_in"];
  if (Array.isArray(hideRaw)) {
    for (const entry of hideRaw) {
      if (typeof entry === "string" && entry.trim().toLowerCase() === surface) return true;
    }
  }
  return false;
}

function resolveEditableFields(contract: MetaEntityRuntimeDescriptor, mode: "create" | "edit" = "edit"): MetaEntityField[] {
  return contract.fields.filter((field) => {
    // Structural exclusions — cannot be edited under any condition
    if (field.isReadOnly) return false;
    if (field.isComputed) return false;
    if (mode === "edit" && field.isWriteOnce) return false;

    // Origin gate — system-managed columns never surface as form inputs.
    // This is what hides `status`, audit timestamps, row_version, etc.
    const origin = field.origin?.toLowerCase();
    if (origin && FORM_HARD_EXCLUDED_ORIGINS.has(origin)) return false;

    // editability.* explicit opt-outs (control.entity_field.editability JSONB)
    const editability = asEditabilityRecord(field.editability);
    if (editability) {
      if (readEditabilityBool(editability, "disabled") === true) return false;
      if (readEditabilityBool(editability, "editable") === false) return false;
      if (mode === "create" && readEditabilityBool(editability, "editableOnCreate") === false) return false;
      if (mode === "edit"   && readEditabilityBool(editability, "editableOnEdit")   === false) return false;
    }

    // visibility.hidden / visibility.hide_in for create / edit surface
    if (visibilityHidesSurface(field, mode)) return false;

    return true;
  });
}

function runtimeEyebrow(appName: string, contract: MetaEntityRuntimeDescriptor): string {
  return `${appName} / ${contract.entityCode}`;
}

function sourceLabel(contract: MetaEntityRuntimeDescriptor): string {
  return `${contract.source.tableSchema}.${contract.source.tableName}`;
}

function recordLabel(contract: MetaEntityRuntimeDescriptor, id: string): string {
  return `${contract.source.tableSchema}.${contract.source.tableName} / ${id}`;
}

function recordHeading(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  id: string,
): { title: string; description: string } {
  const title = firstRecordText(contract, record, ["name", "display_name", "title", "document_no", "number", "code"])
    ?? contract.entityName;
  const subtitle = firstRecordText(contract, record, ["code", "document_no", "number", "external_code"], title)
    ?? id;

  return {
    title,
    description: subtitle === id ? recordLabel(contract, id) : subtitle,
  };
}

function firstRecordText(
  contract: MetaEntityRuntimeDescriptor,
  record: RuntimeRecordRow | undefined,
  candidates: string[],
  exclude?: string,
): string | undefined {
  for (const candidate of candidates) {
    const fieldItem = contract.fields.find((field) => field.name === candidate || field.columnName === candidate);
    const value = fieldItem
      ? readRecordValue(record ?? {}, fieldItem)
      : readRecordValueByName(record, candidate);
    const text = toNonBlankString(value);
    if (text && text !== exclude) return text;
  }
  return undefined;
}

function readRecordValueByName(record: RuntimeRecordRow | undefined, fieldName: string): unknown {
  const data = isRecord(record?.data) ? record.data : {};
  return data[fieldName] ?? record?.[fieldName];
}

function operationLabel(operation: MetaEntityOperation): string {
  const parts = operation.permissionCode.split(/[.:_/-]+/).filter(Boolean);
  return toTitleLabel(parts.at(-1) ?? operation.permissionCode);
}

function fallbackDetailValue(fieldItem: MetaEntityField, recordId: string): unknown {
  if (fieldItem.name === "id") return recordId;
  if (fieldItem.isComputed) return "Computed";
  return fieldItem.defaultValue;
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
