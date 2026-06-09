"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { runtimeListText } from "../../core/resources";
import { useRuntimeListSearch } from "../RuntimeListContext";
import { ORGANIZE_SEARCH_INPUT_CLASS } from "./paletteStyles";

interface SearchControlProps {
  searchValue:     string;
  pageSize:        number;
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
  size?:           "default" | "command";
  chrome?:         "standalone" | "merged";
}

export function SearchControl({
  searchValue,
  pageSize,
  listBaseHref,
  rawSearchParams,
  size = "default",
  chrome = "standalone",
}: SearchControlProps) {
  const {
    adapter,
    search,
    query,
    setQuery,
    runSearchAll,
  } = useRuntimeListSearch();

  const progressiveSearch = search.enabled;
  const [formQuery, setFormQuery] = useState(searchValue);

  useEffect(() => {
    if (!progressiveSearch) {
      setFormQuery(searchValue);
    }
  }, [progressiveSearch, searchValue]);

  const activeQuery = progressiveSearch ? query : formQuery;
  const trimmedQuery = activeQuery.trim();
  const canSearchAll = progressiveSearch && Boolean(trimmedQuery) && !search.isFullyLoaded && Boolean(adapter.recordsApiHref);

  const hiddenParams = Object.entries(rawSearchParams)
    .filter(([k]) => k !== "q" && k !== "page" && k !== "page_size" && k !== "size" && k !== "search_scope")
    .flatMap(([k, v]) => {
      const val = Array.isArray(v) ? v[0] : v;
      return val ? [[k, val] as [string, string]] : [];
    });

  return (
    <form
      action={listBaseHref}
      method="get"
      className={chrome === "merged" ? "relative min-w-0 flex-1" : size === "command" ? "relative min-w-72 flex-1" : "relative min-w-60 flex-1"}
      onSubmit={(event) => {
        if (!progressiveSearch || !trimmedQuery) return;
        event.preventDefault();
        if (canSearchAll) {
          runSearchAll({
            rawSearchParams,
            pageSize,
            reason:     "enter",
            debounceMs: 0,
          });
        }
      }}
    >
      {hiddenParams.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        name={progressiveSearch ? undefined : "q"}
        value={activeQuery}
        onChange={(event) => {
          if (progressiveSearch) {
            setQuery(event.currentTarget.value);
          } else {
            setFormQuery(event.currentTarget.value);
          }
        }}
        placeholder={runtimeListText.search.placeholder}
        autoComplete="off"
        className={[
          "runtime-search-input",
          chrome === "merged"
            ? "h-10 w-full rounded-none border-0 bg-transparent pl-10 pr-3 text-sm font-normal leading-5 text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:ring-0"
            : ORGANIZE_SEARCH_INPUT_CLASS,
          chrome !== "merged" && size === "command" ? "h-10 rounded-lg" : "",
        ].filter(Boolean).join(" ")}
      />
    </form>
  );
}
