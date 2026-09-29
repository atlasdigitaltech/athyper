import type {
  EntityListDescriptorV1,
  EntityListResultV1,
  ListLocationStateV1,
} from "@athyper/contract-platform-entity-list";
import { Button, Label, Select } from "@athyper/platform-ui";

/** Shared cursor-pagination controls for every Entity Framework list surface. */
export function EntityListPagination({
  descriptor,
  state,
  page,
  loading,
  cursorHistory,
  onPrevious,
  onNext,
  onPageSize,
}: {
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly page: EntityListResultV1;
  readonly loading: boolean;
  readonly cursorHistory: readonly (string | undefined)[];
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onPageSize: (value: number) => void;
}) {
  if (!page.rows.length) return null;
  const pageSize = state.pageSize ?? descriptor.limits.defaultPageSize,
    start = (state.pageIndex ?? cursorHistory.length) * pageSize + 1,
    end = start + page.rows.length - 1,
    formattedRange = `${new Intl.NumberFormat().format(start)}–${new Intl.NumberFormat().format(end)}`,
    total = page.pagination.total,
    countPrefix = page.pagination.countMode === "approximate" ? "≈" : "",
    summary =
      total === undefined
        ? `Showing ${formattedRange}${page.pagination.hasNext ? " · more available" : ""}`
        : `Showing ${formattedRange} of ${countPrefix}${new Intl.NumberFormat().format(total)}`;
  return (
    <nav className="a-entity-list__pagination" aria-label="List pagination">
      <span aria-live="polite" title={page.pagination.countMode === "cached" ? "Recently calculated result count" : undefined}>{summary}</span>
      <div className="a-entity-list__page-controls">
        <Label>
          <span>Rows per page</span>
          <Select value={pageSize} onChange={(event) => onPageSize(Number(event.currentTarget.value))}>
            {descriptor.limits.allowedPageSizes.map((size) => <option value={size} key={size}>{size}</option>)}
          </Select>
        </Label>
        <div className="a-entity-list__page-buttons">
          <Button size="small" variant="secondary" disabled={!cursorHistory.length || loading} onClick={onPrevious}>Previous</Button>
          <Button size="small" variant="secondary" disabled={!page.pagination.hasNext || !page.pagination.nextCursor || loading} onClick={onNext}>Next</Button>
        </div>
      </div>
    </nav>
  );
}
