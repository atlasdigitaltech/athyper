import type { ActiveFilterEntry } from "../core/types";
import { runtimeListText } from "../core/resources";
import { serializeListState } from "../core/urlState";

interface RuntimeListFilterChipsProps {
  filters:         ActiveFilterEntry[];
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
}

export function RuntimeListFilterChips({
  filters,
  listBaseHref,
  rawSearchParams,
}: RuntimeListFilterChipsProps) {
  if (filters.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {filters.map((f) => {
        const clearHref = serializeListState(listBaseHref, rawSearchParams, {
          [`filter.${f.fieldName}`]: null,
          page: null,
        });
        return (
          <span
            key={f.fieldName}
            className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border bg-muted px-2 font-medium text-muted-foreground"
            title={`${f.label}: ${f.value}`}
          >
            <span className="truncate">
              <span className="text-foreground">{f.label}</span>: {f.value}
            </span>
            <a
              href={clearHref}
              aria-label={runtimeListText.aria.removeFilter(f.label)}
              className="shrink-0 rounded-sm opacity-70 hover:opacity-100"
            >
              &times;
            </a>
          </span>
        );
      })}
    </div>
  );
}
