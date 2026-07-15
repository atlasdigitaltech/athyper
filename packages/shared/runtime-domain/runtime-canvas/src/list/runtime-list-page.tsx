import type { PlaneKey } from "@athyper/session-plane";
import { getPlaneConfig } from "@athyper/session-plane";
import { PageFrame, ToolbarButton, WorkPanel } from "@athyper/surface-kit";
import type {
  MetaEntityField,
  MetaEntityOperation,
  MetaEntityRuntimeDescriptor,
} from "@athyper/runtime-contracts";
import { resolveRuntimeOperations } from "@athyper/runtime-contracts";
import {
  currentModeHref,
  isCanonicalAction,
  operationHref,
  operationIntent,
} from "../operation-utils";
import {
  formatFieldTitle,
  formatFieldValue,
  toNonBlankString,
} from "@athyper/runtime-shared/meta-entity";
import type { RuntimeListPagination, RuntimeListState, RuntimeRecordRow } from "@athyper/runtime-shared/core";
import { RuntimeEditState } from "../edit/runtime-edit-form";

type RuntimeListSearchParams = Record<string, string | string[] | undefined>;

interface RuntimeListPageProps {
  plane: PlaneKey;
  entity: string;
  descriptor: MetaEntityRuntimeDescriptor;
  records: RuntimeRecordRow[];
  listState?: RuntimeListState;
  pagination?: RuntimeListPagination;
  searchParams?: RuntimeListSearchParams;
}

const DEFAULT_PAGE_SIZE = 20;
const LIST_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
const SYSTEM_LIST_FIELDS = new Set([
  "tenant_id",
  "metadata",
  "row_version",
  "deleted_at",
  "deleted_by",
]);

export function RuntimeListPage({
  plane,
  entity: _entity,
  descriptor,
  records,
  listState,
  pagination,
  searchParams = {},
}: RuntimeListPageProps) {
  const config = getPlaneConfig(plane);
  const columns = resolveListColumns(descriptor, searchParams);
  const page = pagination?.page ?? positiveIntParam(searchParams["page"], 1);
  const pageSize = pagination?.pageSize ?? positiveIntParam(searchParams["page_size"], DEFAULT_PAGE_SIZE);
  const total = pagination?.total;
  const totalPages = pagination?.totalPages;
  const searchValue = firstSearchParam(searchParams["q"]) ?? "";
  const filterEntries = activeFilterEntries(searchParams);
  const disabledCreate = !descriptor.capabilities.canCreate || config.mutationMode === "read-only";

  return (
    <PageFrame
      eyebrow={`${config.appName} / ${descriptor.entityCode}`}
      title={descriptor.entityName}
      description={listDescription(descriptor, records.length, total)}
      actions={<RuntimeListActions contract={descriptor} disabledCreate={disabledCreate} />}
    >
      <section className="flex flex-col gap-2.5">
        <WorkPanel title="Records">
          <div className="flex flex-col gap-3">
            <RuntimeListToolbar
              contract={descriptor}
              searchValue={searchValue}
              searchParams={searchParams}
              pageSize={pageSize}
            />

            {filterEntries.length > 0 ? (
              <div className="flex flex-wrap gap-2 text-xs">
                {filterEntries.map(([key, value]) => (
                  <span
                    key={key}
                    className="inline-flex h-7 max-w-full items-center rounded-md border bg-muted px-2 font-medium text-muted-foreground"
                    title={`${key}: ${value}`}
                  >
                    <span className="truncate">
                      <span className="text-foreground">{fieldLabel(descriptor, key)}</span>: {value}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}

            {listState?.status === "unavailable" ? (
              <RuntimeEditState
                title="Records unavailable"
                message={listState.message ?? "Records could not be loaded in the active organization scope."}
              />
            ) : records.length === 0 ? (
              <RuntimeEditState
                title="No records found"
                message={searchValue || filterEntries.length > 0
                  ? "Try changing the search or filters for this list."
                  : "This entity does not have records in the active scope yet."}
              />
            ) : (
              <RuntimeListTable
                contract={descriptor}
                records={records}
                columns={columns}
                searchParams={searchParams}
              />
            )}

            <RuntimeListPaginationBar
              contract={descriptor}
              page={page}
              pageSize={pageSize}
              total={total}
              totalPages={totalPages}
              rowCount={records.length}
              searchParams={searchParams}
            />
          </div>
        </WorkPanel>
      </section>
    </PageFrame>
  );
}

function RuntimeListActions({
  contract,
  disabledCreate,
}: {
  contract: MetaEntityRuntimeDescriptor;
  disabledCreate: boolean;
}) {
  const actions = [];
  if (!disabledCreate) {
    actions.push(
      <ToolbarButton key="new" href={resolveCreateHref(contract)}>
        New
      </ToolbarButton>,
    );
  }

  const overflow = resolveRuntimeOperations({
    descriptor: contract,
    mode: "list",
    includeDisabled: false,
    includeWorkflowTaskOperations: false,
  })
    .map((resolved) => resolved.operation)
    .filter((operation) => operation.placement === "PRIMARY" || operation.placement === "TOOLBAR")
    .filter((operation) => !isCanonicalAction(operation, "list"))
    .slice(0, 3);

  for (const operation of overflow) {
    if (operation.disabledReason) continue;
    actions.push(
      <ToolbarButton key={operation.key} href={operationHref(contract, operation, "list")}>
        {operation.label ?? operationLabel(operation)}
      </ToolbarButton>,
    );
  }

  return actions.length > 0 ? <>{actions}</> : undefined;
}

function RuntimeListToolbar({
  contract,
  searchValue,
  searchParams,
  pageSize,
}: {
  contract: MetaEntityRuntimeDescriptor;
  searchValue: string;
  searchParams: RuntimeListSearchParams;
  pageSize: number;
}) {
  const hiddenParams = hiddenSearchParams(searchParams, new Set(["q", "page", "page_size"]));

  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <form action={currentModeHref(contract, "list")} method="get" className="flex min-w-0 flex-1 flex-wrap gap-2">
        {hiddenParams.map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}
        <input
          type="search"
          name="q"
          defaultValue={searchValue}
          placeholder={`Search ${contract.entityName.toLowerCase()}`}
          className="h-9 min-w-52 flex-1 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <select
          name="page_size"
          defaultValue={String(pageSize)}
          className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Rows per page"
        >
          {LIST_PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>{option} rows</option>
          ))}
        </select>
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border bg-foreground px-3 text-sm font-medium text-background hover:opacity-90"
        >
          Apply
        </button>
        {searchValue ? (
          <a
            href={listHref(contract, searchParams, { q: null, page: null })}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium text-foreground hover:bg-muted"
          >
            Clear
          </a>
        ) : null}
      </form>
    </div>
  );
}

function RuntimeListTable({
  contract,
  records,
  columns,
  searchParams,
}: {
  contract: MetaEntityRuntimeDescriptor;
  records: RuntimeRecordRow[];
  columns: MetaEntityField[];
  searchParams: RuntimeListSearchParams;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="min-w-full divide-y divide-border text-sm">
        <thead className="bg-muted/30">
          <tr>
            {columns.map((field) => (
              <th
                key={field.key}
                scope="col"
                className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {field.isSortable ? (
                  <a href={sortHref(contract, searchParams, field.name)} className="hover:text-foreground">
                    {field.label}
                    {sortIndicator(searchParams, field.name)}
                  </a>
                ) : field.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border bg-background">
          {records.map((record, rowIndex) => {
            const href = recordHref(contract, record);
            return (
              <tr key={recordKey(record, rowIndex)} className="hover:bg-muted/20">
                {columns.map((field, columnIndex) => {
                  const content = formatFieldValue(record, field);
                  const title = formatFieldTitle(record, field) ?? content;
                  return (
                    <td key={field.key} className="max-w-72 whitespace-nowrap px-3 py-2 text-foreground">
                      {columnIndex === 0 && href ? (
                        <a href={href} title={title} className="block truncate font-medium underline-offset-4 hover:underline">
                          {content}
                        </a>
                      ) : (
                        <span title={title} className="block truncate">
                          {content}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RuntimeListPaginationBar({
  contract,
  page,
  pageSize,
  total,
  totalPages,
  rowCount,
  searchParams,
}: {
  contract: MetaEntityRuntimeDescriptor;
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  rowCount: number;
  searchParams: RuntimeListSearchParams;
}) {
  const hasPrevious = page > 1;
  const hasNext = totalPages !== undefined ? page < totalPages : rowCount >= pageSize;
  const start = rowCount === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const end = rowCount === 0 ? 0 : start + rowCount - 1;

  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p>
        {total !== undefined
          ? <>Showing <strong className="font-medium text-foreground">{start}-{end}</strong> of <strong className="font-medium text-foreground">{total}</strong></>
          : <>Showing <strong className="font-medium text-foreground">{rowCount}</strong> records</>}
      </p>
      <div className="flex items-center gap-2">
        {hasPrevious ? (
          <a className="inline-flex h-8 items-center rounded-md border px-3 font-medium text-foreground hover:bg-muted" href={listHref(contract, searchParams, { page: String(page - 1) })}>
            Previous
          </a>
        ) : (
          <span className="inline-flex h-8 items-center rounded-md border px-3 font-medium opacity-40">Previous</span>
        )}
        <span className="text-xs">
          Page {page}{totalPages ? ` of ${totalPages}` : ""}
        </span>
        {hasNext ? (
          <a className="inline-flex h-8 items-center rounded-md border px-3 font-medium text-foreground hover:bg-muted" href={listHref(contract, searchParams, { page: String(page + 1) })}>
            Next
          </a>
        ) : (
          <span className="inline-flex h-8 items-center rounded-md border px-3 font-medium opacity-40">Next</span>
        )}
      </div>
    </div>
  );
}

function resolveListColumns(
  contract: MetaEntityRuntimeDescriptor,
  searchParams: RuntimeListSearchParams,
): MetaEntityField[] {
  const fieldsByName = new Map(contract.fields.map((field) => [field.name, field]));
  const requestedColumns = firstSearchParam(searchParams["columns"])
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const configuredColumns = requestedColumns && requestedColumns.length > 0
    ? requestedColumns
    : displayListColumns(contract);
  const columns = uniqueFieldNames(configuredColumns)
    .map((name) => fieldsByName.get(name))
    .filter((field): field is MetaEntityField => Boolean(field));

  if (columns.length > 0) return columns.slice(0, 12);

  const descriptive = contract.fields
    .filter((field) => !SYSTEM_LIST_FIELDS.has(field.name))
    .filter((field) => field.isSearchable || field.isFilterable || field.isSortable || identityCandidate(field.name))
    .sort((left, right) => left.order - right.order);
  return (descriptive.length > 0 ? descriptive : contract.fields)
    .filter((field) => !SYSTEM_LIST_FIELDS.has(field.name))
    .slice(0, 8);
}

function displayListColumns(contract: MetaEntityRuntimeDescriptor): string[] {
  const displayConfig = contract.extensions?.["displayConfig"];
  const listColumns = isRecord(displayConfig) ? displayConfig["list_columns"] : undefined;
  if (Array.isArray(listColumns)) {
    return listColumns.filter((column): column is string => typeof column === "string" && column.trim().length > 0);
  }
  return [
    "code",
    "document_no",
    "number",
    "name",
    "display_name",
    "title",
    "status",
    "updated_at",
  ];
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

function sortHref(
  contract: MetaEntityRuntimeDescriptor,
  searchParams: RuntimeListSearchParams,
  fieldName: string,
): string {
  const current = firstSort(searchParams["sort"]);
  const nextDir = current?.key === fieldName && current.dir === "asc" ? "desc" : "asc";
  return listHref(contract, searchParams, {
    sort: `${fieldName}:${nextDir}`,
    page: null,
  });
}

function sortIndicator(searchParams: RuntimeListSearchParams, fieldName: string): string {
  const current = firstSort(searchParams["sort"]);
  if (current?.key !== fieldName) return "";
  return current.dir === "desc" ? " ↓" : " ↑";
}

function firstSort(value: string | string[] | undefined): { key: string; dir: "asc" | "desc" } | null {
  const raw = firstSearchParam(value);
  if (!raw) return null;
  const [key, dir] = raw.split(":");
  if (!key) return null;
  return { key, dir: dir === "desc" ? "desc" : "asc" };
}

function listHref(
  contract: MetaEntityRuntimeDescriptor,
  searchParams: RuntimeListSearchParams,
  overrides: Record<string, string | null>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const item = firstSearchParam(value);
    if (item !== undefined) params.set(key, item);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  return query ? `${currentModeHref(contract, "list")}?${query}` : currentModeHref(contract, "list");
}

function hiddenSearchParams(
  searchParams: RuntimeListSearchParams,
  exclude: Set<string>,
): Array<[string, string]> {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(searchParams)) {
    if (exclude.has(key)) continue;
    const item = firstSearchParam(value);
    if (item !== undefined) entries.push([key, item]);
  }
  return entries;
}

function activeFilterEntries(searchParams: RuntimeListSearchParams): Array<[string, string]> {
  return Object.entries(searchParams)
    .filter(([key]) => key.startsWith("filter."))
    .map(([key, value]) => [key.slice("filter.".length), firstSearchParam(value) ?? ""] as [string, string])
    .filter(([, value]) => value.length > 0);
}

function recordHref(contract: MetaEntityRuntimeDescriptor, record: RuntimeRecordRow): string | null {
  const id = recordId(record);
  return id ? currentModeHref(contract, "detail", id) : null;
}

function recordId(record: RuntimeRecordRow): string | null {
  const id = record.id ?? (isRecord(record.data) ? record.data["id"] : undefined);
  return toNonBlankString(id);
}

function recordKey(record: RuntimeRecordRow, rowIndex: number): string {
  return recordId(record) ?? `row-${rowIndex}`;
}

function fieldLabel(contract: MetaEntityRuntimeDescriptor, fieldName: string): string {
  return contract.fields.find((field) => field.name === fieldName || field.columnName === fieldName)?.label
    ?? toTitleLabel(fieldName);
}

function listDescription(
  contract: MetaEntityRuntimeDescriptor,
  rowCount: number,
  total: number | undefined,
): string {
  const count = total ?? rowCount;
  const source = `${contract.source.tableSchema}.${contract.source.tableName}`;
  return count > 0 ? `${count.toLocaleString()} records from ${source}` : source;
}

function operationLabel(operation: MetaEntityOperation): string {
  const parts = operation.permissionCode.split(/[.:_/-]+/).filter(Boolean);
  return toTitleLabel(parts.at(-1) ?? operation.permissionCode);
}

function positiveIntParam(value: string | string[] | undefined, fallback: number): number {
  const item = Number(firstSearchParam(value));
  return Number.isFinite(item) && item > 0 ? Math.floor(item) : fallback;
}

function firstSearchParam(value: string | string[] | undefined): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  return item && item.trim() ? item.trim() : undefined;
}

function uniqueFieldNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function identityCandidate(name: string): boolean {
  return name === "id"
    || name === "code"
    || name === "name"
    || name === "display_name"
    || name === "document_no"
    || name === "number"
    || name === "status";
}

function toTitleLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
