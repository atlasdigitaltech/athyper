"use client";

import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { runtimePath } from "@athyper/api-contracts/runtime-paths";
import type {
  MetaEntityChildRecordsSurface,
  MetaEntityCollectionConfig,
  MetaEntityLifecycleStateMask,
  MetaEntityLineItemsSurface,
  MetaEntityRuntimeDescriptor,
  DocumentEditRuntimeContract,
} from "@athyper/runtime-contracts";
import { LineItemsSurface } from "@athyper/runtime-line-item/surface";
import type { DocumentWorkspaceLineSubmit, LineFieldChangeResolver } from "@athyper/runtime-line-item";
import { ChildCollectionGrid } from "@athyper/runtime-line-item/embedded";
import { useEditDraftContext } from "@athyper/content-ui";
import { cn } from "@athyper/theme/utils";
import { useOptionalDocumentEditCoordinator } from "../document-runtime/document-edit-coordinator";
import { headerPrimaryActionClass } from "../header/header-chrome";
import type { RuntimeSurfaceRendererProps } from "./types";

// Fallback statuses used when the descriptor carries no lifecycle masks (legacy
// platform entities or freshly-registered tenants). Removed once every
// approvable document seeds its mask in control.entity_lifecycle_state_mask.
const LEGACY_EDITABLE_STATUSES = new Set(["draft", "proforma"]);

function resolveStatusMask(
  contract: MetaEntityRuntimeDescriptor,
  status: string | null,
): MetaEntityLifecycleStateMask | null {
  if (!status) return null;
  return (contract.lifecycleStateMasks ?? []).find((mask) => mask.recordStatus === status) ?? null;
}

export function LineItemsSurfaceRenderer({
  surface,
  record,
  recordId,
  contract,
  editMode: parentEditMode,
}: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "line_items") return null;
  const lineItemsSurface = surface as MetaEntityLineItemsSurface;
  const editCoordinator = useOptionalDocumentEditCoordinator();
  const workspaceCollection = editCoordinator?.contract.childCollections.find((collection) =>
    collection.relationName === lineItemsSurface.relationName
    || collection.entityCode === lineItemsSurface.entityCode,
  );
  const workspaceAvailable = contract.renderer === "document"
    && lineItemsSurface.mutationOwner === "workspace"
    && Boolean(editCoordinator && workspaceCollection);
  const lineResolveSeqRef = useRef(0);
  const lineResolveTabIdRef = useRef(createLineResolveTabId());

  const currencyCode = typeof record?.["currency_code"] === "string" ? record["currency_code"] : undefined;
  const companyCodeId = typeof record?.["company_code_id"] === "string" ? record["company_code_id"] : undefined;

  const docStatus = typeof record?.["status"] === "string" ? record["status"] : null;
  const statusMask = resolveStatusMask(contract, docStatus);
  const statusAllowsEdit = statusMask
    ? statusMask.canEdit
    : docStatus === null || LEGACY_EDITABLE_STATUSES.has(docStatus);

  const session = useEditDraftContext();
  const editMode =
    lineItemsSurface.canEdit
    && statusAllowsEdit
    && Boolean(parentEditMode)
    && Boolean(session?.isEditing)
    && (lineItemsSurface.mutationOwner === "direct_crud" || workspaceAvailable);

  const mobileColumns = lineItemsSurface.mobileColumns?.length
    ? lineItemsSurface.mobileColumns
    : undefined;
  const lineFieldChangeResolver = useCallback<LineFieldChangeResolver>(async (input) => {
    if (!workspaceAvailable || !editCoordinator || !lineItemsSurface.entityCode) return;
    const clientSeq = lineResolveSeqRef.current + 1;
    lineResolveSeqRef.current = clientSeq;
    const lineId = input.lineId ?? "new";
    const currentDraft = {
      ...input.draft,
      __documentEditScope: "line",
      __collectionKey: "items",
      __lineEntityCode: input.lineEntityCode,
      __lineId: lineId,
      __panelKey: input.panelKey ?? "",
      __mode: input.mode,
    };
    const response = await editCoordinator.resolveFieldChange({
      entityCode: editCoordinator.entityCode,
      recordId: editCoordinator.recordId,
      sourceField: input.fieldName,
      newValue: input.newValue,
      currentDraft,
      draftVersion: `line_${safeIdentifierToken(lineId)}_${clientSeq}`,
      sectionVersions: buildLineSectionVersionMap(editCoordinator.contract),
      tabId: lineResolveTabIdRef.current,
      clientSeq,
      idempotencyKey: createLineResolveIdempotencyKey(
        lineResolveTabIdRef.current,
        clientSeq,
        lineId,
        input.fieldName,
      ),
    });
    if (response.invalidations.length > 0) {
      await editCoordinator.applyInvalidations(response.invalidations, currentDraft);
    }
    return {
      accepted: response.accepted,
      patch: response.patch,
      clearedFields: response.clearedFields,
    };
  }, [editCoordinator, lineItemsSurface.entityCode, workspaceAvailable]);
  const submitWorkspaceChanges = useCallback<DocumentWorkspaceLineSubmit>(async (input) => {
    const response = await editCoordinator!.submitWorkspaceChanges({
      etag: input.etag,
      changes: { lines: input.lines },
    });
    return { etag: response.etag, record: response.record };
  }, [editCoordinator]);

  return (
    <LineItemsSurface
      surface={lineItemsSurface}
      entityCode={contract.entityCode}
      recordId={recordId}
      currencyCode={currencyCode}
      companyCodeId={companyCodeId}
      record={record}
      editMode={editMode}
      mobileColumns={mobileColumns}
      lineFieldChangeResolver={workspaceAvailable ? lineFieldChangeResolver : undefined}
      submitWorkspaceChanges={workspaceAvailable ? submitWorkspaceChanges : undefined}
    />
  );
}

function ChildRecordsTable({
  surface,
  recordId,
}: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "child_records") return null;
  const childSurface = surface as MetaEntityChildRecordsSurface;
  const { entityCode, parentField, parentIdField, canCreate, canDelete, canEdit } = childSurface;

  const linkField = parentIdField ?? parentField ?? deriveLinkField(entityCode);
  const queryKey = ["child-records", entityCode, linkField, recordId] as const;
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: (childRecordId: string) => deleteRelatedRecord(entityCode, childRecordId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const { data, isLoading, isError } = useQuery<RelatedRecord[]>({
    queryKey,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ [linkField]: recordId });
      const res = await fetch(
        `${runtimePath.list(entityCode)}?${params}`,
        { signal, cache: "no-store" },
      );
      if (!res.ok) throw new Error(`Failed to load child records (${res.status})`);
      const body = await res.json() as unknown;
      const records = isApiListResponse(body) ? body.records : [];
      return records.map(flattenRecord);
    },
    staleTime: 30_000,
    enabled: !!recordId,
  });

  const createHref = canCreate ? buildCreateHref(entityCode, linkField, recordId) : null;
  const childLabel = childSurface.label ?? "Related Records";
  const collection: MetaEntityCollectionConfig = {
    ...childSurface.collection,
    title: {
      showCount: true,
      ...childSurface.collection?.title,
    },
    toolbar: {
      search: true,
      columns: true,
      primaryAction: createHref ? "create" : "none",
      ...childSurface.collection?.toolbar,
    },
    table: {
      pagination: "none",
      ...childSurface.collection?.table,
    },
    row: {
      selection: false,
      clickAction: canEdit ? "edit" : "none",
      ...childSurface.collection?.row,
    },
  };

  const deleteError = deleteMutation.error
    ? deleteMutation.error instanceof Error
      ? deleteMutation.error.message
      : "Unable to delete record."
    : null;

  const primaryActionSlot = createHref ? (
    <a
      href={createHref}
      className={cn(headerPrimaryActionClass, "gap-1.5 whitespace-nowrap")}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden />
      Add
    </a>
  ) : undefined;

  const summarySlot = deleteError ? (
    <span role="alert" className="ml-2 text-xs font-medium text-destructive">
      {deleteError}
    </span>
  ) : undefined;

  return (
    <ChildCollectionGrid
      entityCode={entityCode}
      label={childLabel}
      count={data?.length}
      collection={collection}
      scope={{ parent_id: recordId }}
      dataOverride={data ?? []}
      loading={isLoading}
      error={isError}
      errorMessage="Failed to load records. Try refreshing the page."
      emptyMessage={`No ${toInlineLabel(childLabel)} yet.`}
      primaryActionSlot={primaryActionSlot}
      summarySlot={summarySlot}
      onRowClick={canEdit
        ? (row) => {
            const href = buildEditHref(entityCode, row);
            if (href) window.location.assign(href);
          }
        : undefined}
      rowActions={canEdit || canDelete
        ? (row) => (
            <div className="inline-flex items-center gap-1">
              {canEdit ? (
                <a
                  href={buildEditHref(entityCode, row) ?? undefined}
                  aria-disabled={!buildEditHref(entityCode, row)}
                  aria-label="Edit"
                  title="Edit"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-40"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </a>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  disabled={deleteMutation.isPending || !readRowId(row)}
                  onClick={() => {
                    const id = readRowId(row);
                    if (!id || !window.confirm("Delete this record?")) return;
                    deleteMutation.mutate(id);
                  }}
                  aria-label="Delete"
                  title="Delete"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              ) : null}
            </div>
          )
        : undefined}
    />
  );
}

export { ChildRecordsTable as ChildRecordsSurfaceRenderer };

type RelatedRecord = Record<string, unknown>;

function flattenRecord(record: unknown): RelatedRecord {
  if (!isRecord(record)) return {};
  const nested = isRecord(record["data"]) ? record["data"] : {};
  return { ...record, ...nested };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isApiListResponse(value: unknown): value is { records: unknown[] } {
  return isRecord(value) && Array.isArray(value["records"]);
}

function deriveLinkField(entityCode: string): string {
  const base = entityCode.replace(/_line$|_item$|_line_item$/, "");
  return `${base}_id`;
}

function buildCreateHref(entityCode: string, linkField: string, recordId: string): string {
  const params = new URLSearchParams({ [linkField]: recordId });
  return `/app/${encodeURIComponent(entityCode)}/new?${params.toString()}`;
}

function buildEditHref(entityCode: string, row: RelatedRecord): string | null {
  const id = readRowId(row);
  return id ? `/app/${encodeURIComponent(entityCode)}/${encodeURIComponent(id)}/edit` : null;
}

function readRowId(row: RelatedRecord): string | null {
  const id = row["id"] ?? (isRecord(row["data"]) ? row["data"]["id"] : undefined);
  return typeof id === "string" && id.trim() ? id : null;
}

function toInlineLabel(label: string): string {
  return /^[A-Z]+$/.test(label) ? label : label.toLowerCase();
}

function buildLineSectionVersionMap(contract: DocumentEditRuntimeContract): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const section of contract.sections) {
    if (section.versionRef) versions[section.key] = section.versionRef;
  }
  return versions;
}

function createLineResolveTabId(): string {
  return `line_tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function createLineResolveIdempotencyKey(
  tabId: string,
  clientSeq: number,
  lineId: string,
  fieldName: string,
): string {
  return `line_chg_${tabId}_${clientSeq}_${safeIdentifierToken(lineId)}_${safeIdentifierToken(fieldName)}`;
}

function safeIdentifierToken(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return safe.length > 0 ? safe.slice(0, 96) : "unknown";
}

async function deleteRelatedRecord(entityCode: string, recordId: string): Promise<void> {
  const response = await fetch(
    runtimePath.detail(entityCode, recordId),
    { method: "DELETE", cache: "no-store" },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null) as unknown;
    const message = isRecord(body) && typeof body["message"] === "string"
      ? body["message"]
      : `Delete failed with status ${response.status}.`;
    throw new Error(message);
  }
}
