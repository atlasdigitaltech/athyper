import { Skeleton } from "@athyper/ui/primitives";
import { resolveColumns } from "../core/columns";
import type { ResolvedColumn, RuntimeDescriptor } from "../core/types";

const DEFAULT_COLUMN_TYPES = ["string", "string", "status", "number", "number"] as const;

export interface MetaEntityListSkeletonProps {
  descriptor?: RuntimeDescriptor | null;
  rowCount?: number;
}

/** Stable table fallback before records are available. */
export function MetaEntityListSkeleton({
  descriptor,
  rowCount = 10,
}: MetaEntityListSkeletonProps) {
  const resolved = descriptor ? resolveColumns(descriptor, undefined) : fallbackColumns();
  const columns = resolved.length > 0 ? resolved.slice(0, 8) : fallbackColumns();
  const gridTemplateColumns = buildGridTemplateColumns(columns);

  return (
    <section
      className="flex h-full min-h-[60vh] min-w-0 flex-1 flex-col gap-2.5"
      aria-busy="true"
      aria-label={descriptor ? `Loading ${descriptor.entityName} records` : "Loading records"}
      data-runtime-list-skeleton
      data-skeleton-level={descriptor ? "descriptor" : "universal"}
      data-skeleton-columns={columns.length}
    >
      <div className="shrink-0 overflow-hidden rounded-xl border bg-card px-3 py-3 shadow-sm sm:px-4">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex h-11 min-w-48 items-center overflow-hidden rounded-lg border bg-background">
            <Skeleton className="mx-3 h-4 w-4 rounded-sm" />
            <div className="h-full border-l" />
            {descriptor ? (
              <span className="px-4 text-lg font-semibold text-foreground">{descriptor.entityName}</span>
            ) : (
              <Skeleton className="mx-4 h-6 w-40" />
            )}
          </div>

          <div className="flex h-11 min-w-64 flex-1 items-center overflow-hidden rounded-lg border bg-background md:max-w-xl">
            <Skeleton className="mx-3 h-5 w-5 rounded-full" />
            <Skeleton className="h-4 min-w-24 flex-1" />
            <div className="ml-3 hidden h-full items-center gap-4 border-l px-4 sm:flex">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-5 w-5 rounded-sm" />
              ))}
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <div className="hidden min-w-[760px] md:block">
          <div className="grid min-h-14 items-center gap-4 border-b bg-muted/45 px-3" style={{ gridTemplateColumns }}>
            <Skeleton className="h-5 w-5 rounded-sm" />
            {columns.map((column) => (
              <Skeleton
                key={column.name}
                className={headerWidthClass(column)}
                data-skeleton-column-type={columnKind(column)}
              />
            ))}
            <Skeleton className="ml-auto h-4 w-10" />
          </div>

          {Array.from({ length: rowCount }, (_, rowIndex) => (
            <div key={rowIndex} className="grid min-h-14 items-center gap-4 border-b px-3 last:border-b-0" style={{ gridTemplateColumns }}>
              <Skeleton className="h-5 w-5 rounded-sm" />
              {columns.map((column, columnIndex) => (
                <Skeleton key={column.name} className={cellWidthClass(column, rowIndex + columnIndex)} />
              ))}
              <div className="flex justify-end gap-3">
                <Skeleton className="h-3 w-7" />
                <Skeleton className="h-4 w-4 rounded-sm" />
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {Array.from({ length: Math.min(rowCount, 6) }, (_, index) => (
            <div key={index} className="space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-4/5" />
              <div className="flex gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>

        <div className="flex min-h-16 items-center justify-between gap-4 border-t bg-card px-4">
          <Skeleton className="h-4 w-44" />
          <div className="flex items-center gap-3">
            <Skeleton className="hidden h-9 w-24 sm:block" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-20" />
          </div>
        </div>
      </div>
    </section>
  );
}

function fallbackColumns(): ResolvedColumn[] {
  return DEFAULT_COLUMN_TYPES.map((dataType, index) => ({
    name: `fallback_${index}`,
    label: "",
    dataType,
    isSortable: false,
    isFilterable: false,
  }));
}

function buildGridTemplateColumns(columns: ResolvedColumn[]): string {
  return `32px ${columns.map(columnTrack).join(" ")} 72px`;
}

function columnTrack(column: ResolvedColumn): string {
  if (isNumeric(column)) return "minmax(110px, 0.8fr)";
  if (isStatus(column)) return "minmax(90px, 0.65fr)";
  if (isTemporal(column)) return "minmax(120px, 0.8fr)";
  if (isIdentifier(column)) return "minmax(180px, 1.2fr)";
  return "minmax(150px, 1fr)";
}

function headerWidthClass(column: ResolvedColumn): string {
  if (isNumeric(column)) return "ml-auto h-4 w-20";
  if (isStatus(column)) return "h-4 w-16";
  return "h-4 w-24";
}

function cellWidthClass(column: ResolvedColumn, seed: number): string {
  if (isNumeric(column)) return "ml-auto h-4 w-24";
  if (isStatus(column)) return "h-5 w-16 rounded-full";
  if (isTemporal(column)) return "h-4 w-24";
  if (isIdentifier(column)) return seed % 2 === 0 ? "h-4 w-4/5" : "h-4 w-3/4";
  return seed % 3 === 0 ? "h-4 w-11/12" : "h-4 w-4/5";
}

function normalizedType(column: ResolvedColumn): string {
  return `${column.dataType ?? ""} ${column.uiType ?? ""} ${column.display?.renderer ?? ""}`.toLowerCase();
}

function isNumeric(column: ResolvedColumn): boolean {
  return /number|numeric|decimal|integer|float|double|money|currency|amount/.test(normalizedType(column));
}

function isStatus(column: ResolvedColumn): boolean {
  return /status|state|boolean|badge|enum/.test(`${column.name} ${normalizedType(column)}`.toLowerCase());
}

function isTemporal(column: ResolvedColumn): boolean {
  return /date|time|timestamp/.test(normalizedType(column));
}

function isIdentifier(column: ResolvedColumn): boolean {
  return /(^|_)(id|code|number|no)$/.test(column.name.toLowerCase());
}

function columnKind(column: ResolvedColumn): "numeric" | "status" | "temporal" | "identifier" | "text" {
  if (isNumeric(column)) return "numeric";
  if (isStatus(column)) return "status";
  if (isTemporal(column)) return "temporal";
  if (isIdentifier(column)) return "identifier";
  return "text";
}
