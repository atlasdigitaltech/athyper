import { runtimeListText } from "../core/resources";
import { runtimeTableChrome } from "../core/table-chrome";
import { serializeListState } from "../core/url-state";
import { RuntimePaginationControls } from "./runtime-pagination-controls";

interface RuntimeListPaginationProps {
  page:            number;
  pageSize:        number;
  total?:          number;
  totalPages?:     number;
  rowCount:        number;
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
  attached?:       boolean;
}

export function RuntimeListPagination({
  page,
  pageSize,
  total,
  totalPages,
  rowCount,
  listBaseHref,
  rawSearchParams,
  attached = false,
}: RuntimeListPaginationProps) {
  const hasPrevious = page > 1;
  const hasNext     = totalPages !== undefined ? page < totalPages : rowCount >= pageSize;
  const start       = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  // Clamp end to total so a stale/buggy rowCount never shows "81–105 of 100 records".
  const end         = rowCount === 0 ? 0 : Math.min(start + rowCount - 1, total ?? start + rowCount - 1);

  const prevHref = serializeListState(listBaseHref, rawSearchParams, { page: String(page - 1) });
  const nextHref = serializeListState(listBaseHref, rawSearchParams, { page: String(page + 1) });

  const footerClassName = [
    runtimeTableChrome.footer,
    attached ? runtimeTableChrome.footerAttached : runtimeTableChrome.footerDetached,
  ].join(" ");

  return (
    <div
      className={footerClassName}
      data-runtime-data-footer
      data-attached={attached ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span className="text-sm font-medium leading-5 text-foreground" aria-live="polite">
          {total !== undefined
            ? runtimeListText.summary.showingRecordRange(start, end, total)
            : runtimeListText.summary.showingRecordCount(rowCount)}
        </span>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 md:ml-auto md:w-auto md:justify-end">
        <RuntimePaginationControls
          previous={hasPrevious ? { kind: "link", href: prevHref } : { kind: "disabled" }}
          pageLabel={runtimeListText.summary.page(page, totalPages)}
          next={hasNext ? { kind: "link", href: nextHref } : { kind: "disabled" }}
        />
      </div>
    </div>
  );
}
