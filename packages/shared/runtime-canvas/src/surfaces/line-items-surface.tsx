"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WorkPanel } from "@athyper/surface-kit";
import type {
  MetaEntityLifecycleStateMask,
  MetaEntityLineItemsSurface,
  MetaEntityRuntimeDescriptor,
  MetaEntitySurface,
} from "@athyper/runtime-contracts";
import { LineItemsSurface } from "@athyper/line-item-runtime/surface";
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
}: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "line_items") return null;
  const lineItemsSurface = surface as MetaEntityLineItemsSurface;

  const currencyCode = typeof record?.["currency_code"] === "string" ? record["currency_code"] : undefined;
  const companyCodeId = typeof record?.["company_code_id"] === "string" ? record["company_code_id"] : undefined;

  // Gate editing on document status. Prefer the descriptor's lifecycle masks
  // (control.entity_lifecycle_state_mask) when present; fall back to the
  // legacy draft/proforma allowlist for entities that have not yet been
  // migrated to the mask table.
  const docStatus = typeof record?.["status"] === "string" ? record["status"] : null;
  const statusMask = resolveStatusMask(contract, docStatus);
  const statusAllowsEdit = statusMask
    ? statusMask.canEdit
    : docStatus === null || LEGACY_EDITABLE_STATUSES.has(docStatus);
  const editMode = lineItemsSurface.canEdit && statusAllowsEdit;

  return (
    // `entity` (CompiledEntity) isn't available at this layer — `contract`
    // is the runtime descriptor (camelCase MetaEntityRuntimeDescriptor), not
    // the snake_case CompiledEntity the downstream column-catalog resolver
    // expects. Omitting falls back to the entity-code heuristic in
    // LinesGrid.resolveColumnCatalog, which is the correct degradation
    // until the descriptor → CompiledEntity adapter lands.
    <LineItemsSurface
      surface={lineItemsSurface}
      entityCode={contract.entityCode}
      recordId={recordId}
      currencyCode={currencyCode}
      companyCodeId={companyCodeId}
      record={record}
      editMode={editMode}
    />
  );
}

function ChildRecordsTable({
  surface,
  record: _record,
  recordId,
}: RuntimeSurfaceRendererProps) {
  if (surface.kind !== "child_records") return null;
  const childSurface = surface as Extract<MetaEntitySurface, { kind: "child_records" }>;
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
        `/api/runtime-records/${encodeURIComponent(entityCode)}?${params}`,
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

  const columns = deriveColumns(data);
  const createHref = canCreate ? buildCreateHref(entityCode, linkField, recordId) : null;

  return (
    <WorkPanel title={childSurface.label ?? "Related Records"}>
      <div className="flex flex-col gap-3">
        {createHref || deleteMutation.error ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {createHref ? (
              <a
                href={createHref}
                className="inline-flex h-8 items-center rounded-md border bg-foreground px-3 text-xs font-medium text-background hover:opacity-90"
              >
                New
              </a>
            ) : <span />}
            {deleteMutation.error ? (
              <p role="alert" className="text-xs font-medium text-destructive">
                {deleteMutation.error instanceof Error ? deleteMutation.error.message : "Unable to delete record."}
              </p>
            ) : null}
          </div>
        ) : null}

        {isLoading ? (
          <LoadingState />
        ) : isError ? (
          <ErrorState />
        ) : !data || data.length === 0 ? (
          <EmptyState label={childSurface.label ?? "records"} />
        ) : (
          <RelatedRecordsTable
            columns={columns}
            rows={data}
            totals={null}
            actions={{
              canEdit,
              canDelete,
              entityCode,
              deleteDisabled: deleteMutation.isPending,
              onDelete: (row) => {
                const id = readRowId(row);
                if (!id || !window.confirm("Delete this record?")) return;
                deleteMutation.mutate(id);
              },
            }}
          />
        )}
      </div>
    </WorkPanel>
  );
}

export { ChildRecordsTable as ChildRecordsSurfaceRenderer };

// ─── Internal helpers ────────────────────────────────────────────────────────

const OMIT_COLUMNS = new Set([
  "tenant_id",
  "is_deleted",
  "deleted_at",
  "deleted_by",
  "metadata",
  "row_version",
]);

type RelatedRecord = Record<string, unknown>;

interface ColumnDef {
  key: string;
  label: string;
}

interface RelatedRecordActions {
  canEdit: boolean;
  canDelete: boolean;
  entityCode: string;
  deleteDisabled: boolean;
  onDelete: (row: RelatedRecord) => void;
}

function deriveColumns(records: RelatedRecord[] | undefined): ColumnDef[] {
  if (!records || records.length === 0) return [];
  const keyFrequency = new Map<string, number>();
  for (const row of records) {
    for (const key of Object.keys(row)) {
      keyFrequency.set(key, (keyFrequency.get(key) ?? 0) + 1);
    }
  }

  return [...keyFrequency.entries()]
    .filter(([key]) => !OMIT_COLUMNS.has(key))
    .sort(([aKey, aCount], [bKey, bCount]) => {
      const aScore = columnScore(aKey, aCount);
      const bScore = columnScore(bKey, bCount);
      return bScore - aScore;
    })
    .slice(0, 10)
    .map(([key]) => ({ key, label: toColumnLabel(key) }));
}

function columnScore(key: string, frequency: number): number {
  const PRIORITY_KEYS = ["line_no", "description", "quantity", "unit_price", "amount", "total", "name", "code", "status"];
  const DEPRIORITY_KEYS = ["id", "created_at", "updated_at", "created_by", "updated_by", "tenant_id", "is_active", "status_changed_at"];
  if (DEPRIORITY_KEYS.includes(key)) return frequency - 100;
  const priorityIndex = PRIORITY_KEYS.indexOf(key);
  if (priorityIndex >= 0) return frequency + 100 - priorityIndex;
  return frequency;
}

function toColumnLabel(key: string): string {
  return key
    .replace(/_id$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function computeTotals(rows: RelatedRecord[], columns: ColumnDef[]): Record<string, number | null> {
  const totals: Record<string, number | null> = {};
  for (const col of columns) {
    const values = rows.map((r) => r[col.key]).filter((v): v is number => typeof v === "number");
    totals[col.key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) : null;
  }
  return totals;
}

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

async function deleteRelatedRecord(entityCode: string, recordId: string): Promise<void> {
  const response = await fetch(
    `/api/runtime-records/${encodeURIComponent(entityCode)}/${encodeURIComponent(recordId)}`,
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

// ─── Table & state components ─────────────────────────────────────────────────

function RelatedRecordsTable({
  columns,
  rows,
  totals,
  actions,
}: {
  columns: ColumnDef[];
  rows: RelatedRecord[];
  totals: Record<string, number | null> | null;
  actions?: RelatedRecordActions;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/30">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {col.label}
              </th>
            ))}
            {actions && (actions.canEdit || actions.canDelete) ? (
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">
                Actions
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {rows.map((row, rowIndex) => (
            <tr key={String(row["id"] ?? rowIndex)} className="hover:bg-muted/20">
              {columns.map((col) => (
                <td key={col.key} className="whitespace-nowrap px-3 py-2 text-foreground">
                  {formatCellValue(row[col.key])}
                </td>
              ))}
              {actions && (actions.canEdit || actions.canDelete) ? (
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-2">
                    {actions.canEdit ? (
                      <a
                        href={buildEditHref(actions.entityCode, row) ?? undefined}
                        aria-disabled={!buildEditHref(actions.entityCode, row)}
                        className="text-xs font-medium text-foreground underline-offset-4 hover:underline aria-disabled:pointer-events-none aria-disabled:opacity-40"
                      >
                        Edit
                      </a>
                    ) : null}
                    {actions.canDelete ? (
                      <button
                        type="button"
                        disabled={actions.deleteDisabled || !readRowId(row)}
                        onClick={() => actions.onDelete(row)}
                        className="text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:pointer-events-none disabled:opacity-40"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot className="border-t bg-muted/20">
            <tr>
              {columns.map((col, index) => {
                const total = totals[col.key];
                return (
                  <td key={col.key} className="px-3 py-2 text-xs font-medium text-foreground">
                    {index === 0 ? "Total" : total !== null && total !== undefined ? formatNumber(total) : ""}
                  </td>
                );
              })}
              {actions && (actions.canEdit || actions.canDelete) ? (
                <td className="px-3 py-2" />
              ) : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "–";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(value));
      } catch {
        return value;
      }
    }
    return value;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function LoadingState() {
  return (
    <div className="flex min-h-24 items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-md border border-destructive/20 bg-destructive/5 p-4 text-center">
      <p className="text-sm text-destructive">Failed to load records. Try refreshing the page.</p>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-24 items-center justify-center text-center">
      <p className="text-sm text-muted-foreground">No {label} found.</p>
    </div>
  );
}
