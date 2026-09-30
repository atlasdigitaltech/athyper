import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
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
  onFirst,
  onPrevious,
  onNext,
  onPageSize,
}: {
  readonly descriptor: EntityListDescriptorV1;
  readonly state: ListLocationStateV1;
  readonly page: EntityListResultV1;
  readonly loading: boolean;
  readonly cursorHistory: readonly (string | undefined)[];
  readonly onFirst: () => void;
  readonly onPrevious: () => void;
  readonly onNext: () => void;
  readonly onPageSize: (value: number) => void;
}) {
  const intl = useEntityI18n();
  const recoverFirst = !cursorHistory.length && Boolean(state.cursor || state.pageIndex);
  if (!page.rows.length && !recoverFirst) return null;
  const pageSize = state.pageSize ?? descriptor.limits.defaultPageSize,
    start = page.rows.length ? (state.pageIndex ?? cursorHistory.length) * pageSize + 1 : 0,
    end = page.rows.length ? start + page.rows.length - 1 : 0,
    formattedRange = `${intl.number(start)}–${intl.number(end)}`,
    total = page.pagination.total,
    countPrefix = page.pagination.countMode === "approximate" ? "≈" : "",
    summary =
      total === undefined
        ? `Showing ${formattedRange}${page.pagination.hasNext ? " · more available" : ""}`
        : `Showing ${formattedRange} of ${countPrefix}${intl.number(total)}`;
  return (
    <nav className="a-entity-list__pagination" aria-label="List pagination">
      <span aria-live="polite" title={page.pagination.countMode === "cached" ? "Recently calculated result count" : undefined}>{summary}</span>
      <div className="a-entity-list__page-controls">
        <Label>
          <span>Rows per page</span>
          <Select disabled={loading} value={pageSize} onChange={(event) => onPageSize(Number(event.currentTarget.value))}>
            {descriptor.limits.allowedPageSizes.map((size) => <option value={size} key={size}>{size}</option>)}
          </Select>
        </Label>
        <div className="a-entity-list__page-buttons">
          {recoverFirst ? <Button size="small" variant="secondary" disabled={loading} onClick={onFirst}>{intl.message("list.firstPage")}</Button> : <Button size="small" variant="secondary" disabled={!cursorHistory.length || loading} onClick={onPrevious}>Previous</Button>}
          <Button size="small" variant="secondary" disabled={!page.pagination.hasNext || !page.pagination.nextCursor || loading} onClick={onNext}>Next</Button>
        </div>
      </div>
    </nav>
  );
}
