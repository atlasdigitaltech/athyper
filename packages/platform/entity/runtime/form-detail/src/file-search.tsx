"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createOperation } from "@athyper/platform-api-client";
import { useApiClient } from "@athyper/platform-shell-app-foundation";
import { SearchField, Button, Card, PanelEmptyState } from "@athyper/platform-ui";
import { FileTypeIcon } from "./file-type";
import { FileAction } from "./file-action";
import { FileTextIcon, EyeIcon, DownloadIcon } from "@athyper/platform-icons";
import { AttachmentPreview } from "./attachment-preview";

export type FileSearchHit = {
  attachmentId: string;
  fileName: string;
  contentType?: string;
  snippet: string;
};

/** Search stays record scoped; results never depend on the currently loaded file page. */
export function useFileSearch(
  entityType: string,
  entityId: string,
  allowed: boolean,
  folderFilter = "",
  categoryFilter = "",
) {
  const client = useApiClient();
  const [scope, setScopeState] = useState<"names" | "contents">("names");
  const [query, setQueryState] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [hits, setHits] = useState<readonly FileSearchHit[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | undefined>(undefined);
  const reset = () => {
    pending.current?.abort();
    setQueryState("");
    setSubmitted("");
    setHits([]);
    setCursor(undefined);
    setError(undefined);
    setBusy(false);
  };
  useEffect(() => {
    reset();
    setScopeState("names");
    return () => pending.current?.abort();
  }, [entityType, entityId]);
  useEffect(() => {
    // Retain the typed query, but never mix result pages from different filters.
    pending.current?.abort();
    setBusy(false);
    setSubmitted("");
    setHits([]);
    setCursor(undefined);
    setError(undefined);
  }, [folderFilter, categoryFilter]);
  const setScope = (value: "names" | "contents") => {
    pending.current?.abort();
    setBusy(false);
    setScopeState(value);

  };
  const setQuery = (value: string) => {
    pending.current?.abort();
    setBusy(false);
    setQueryState(value);
    setSubmitted("");
    setHits([]);
    setCursor(undefined);
    setError(undefined);
  };
  const search = async (after?: string) => {
    if (!allowed || !query.trim()) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const term = query.trim();
    setBusy(true);
    setError(undefined);
    setSubmitted(term);
    if (!after) {
      setHits([]);
      setCursor(undefined);
    }
    try {
      const result = await client.request(
        createOperation<{
          hits: readonly FileSearchHit[];
          nextCursor?: string;
        }>({ method: "POST", path: () => "/api/attachments/search" }),
        {
          signal: controller.signal,
          body: { entityType, entityId, q: term, ...(folderFilter === "__unfiled" ? {unfiled:true} : folderFilter ? {folderId:folderFilter} : {}), ...(categoryFilter ? {category:categoryFilter} : {}), ...(after ? { after } : {}) },
        },
      );
      if (controller.signal.aborted) return;
      setHits((current) =>
        Array.from(
          new Map(
            [...(after ? current : []), ...result.hits].map((hit) => [
              hit.attachmentId,
              hit,
            ]),
          ).values(),
        ),
      );
      setCursor(result.nextCursor);
    } catch {
      if (!controller.signal.aborted)
        setError("File contents could not be searched. Try again.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return {
    scope: allowed ? scope : ("names" as const),
    setScope,
    query,
    setQuery,
    submitted,
    hits,
    cursor,
    busy,
    error,
    search,
    reset,
  };
}
export type FileSearchState = ReturnType<typeof useFileSearch>;

export function FileSearchInput({
  search,
  nameQuery,
  onNameQuery,
  canSearch,
  onClear,
  actions,
}: {
  search: FileSearchState;
  nameQuery: string;
  onNameQuery: (value: string) => void;
  canSearch: boolean;
  onClear: () => void;
  actions?: ReactNode;
}) {
  const contents = search.scope === "contents";
  const query = contents ? search.query : nameQuery;
  return (
    <div className="a-file-search">
      <form
        role="search"
        aria-label="Search record files"
        onSubmit={(event) => {
          event.preventDefault();
          if (contents) void search.search();
        }}
      >
        <SearchField className="a-file-search__input" label={contents ? "Search file contents" : "Search file names"} enterKeyHint="search" value={query} maxLength={256} placeholder={contents ? "Find words inside this record’s files" : "Search by file name or type"} onValueChange={contents ? search.setQuery : onNameQuery} onClear={onClear}/>
        {contents ? (
          <button type="submit" disabled={search.busy || !query.trim()}>
            Search
          </button>
        ) : null}
      </form>
      {canSearch ? (
        <fieldset className="a-file-search__scope">
          <legend className="a-file-search__label">Search in</legend>
          {(
            [
              ["names", "File names"],
              ["contents", "File contents"],
            ] as const
          ).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="file-search-scope"
                value={value}
                checked={search.scope === value}
                onChange={() => search.setScope(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
      {actions}
    </div>
  );
}

function excerpt(text: string, query: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const position = normalized
    .toLocaleLowerCase()
    .indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, position - 75);
  const value = normalized.slice(start, start + 280);
  const index = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return (
    <>
      {start ? "…" : ""}
      {index < 0 ? (
        value
      ) : (
        <>
          {value.slice(0, index)}
          <mark>{value.slice(index, index + query.length)}</mark>
          {value.slice(index + query.length)}
        </>
      )}
      {start + value.length < normalized.length ? "…" : ""}
    </>
  );
}

function SearchExcerpt({ text, query }: { text: string; query: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <p
        className="a-file-search-excerpt"
        data-expanded={expanded || undefined}
      >
        {excerpt(text, query)}
      </p>
      {text.length > 140 ? (
        <button
          className="a-file-search-excerpt__toggle"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </>
  );
}

export function FileSearchResults({
  search,
  canPreview,
  canDownload,
  onPreview,
  onDownload,
  selected,
  downloading,
}: {
  search: FileSearchState;
  canPreview: boolean;
  canDownload: boolean;
  onPreview: (hit: FileSearchHit) => void;
  onDownload: (id: string) => void;
  selected?: string;
  downloading?: string;
}) {
  return (
    <section
      className="a-file-search-results"
      aria-label="Content search results"
      aria-busy={search.busy}
    >
      {!search.submitted && !search.busy && !search.error ? <PanelEmptyState className="a-files-empty-state" role="status" icon={<FileTextIcon size={28}/>} title="Search inside files" description="Enter a word or phrase to search inside files, or show the file list." action={<Button variant="secondary" type="button" onClick={()=>search.setScope("names")}>Show files</Button>}/> : search.busy || search.error || search.hits.length > 0 ? <p role="status">
        {search.error
          ? "Search unavailable"
          : search.busy
            ? "Searching file contents…"
            : search.submitted
              ? `${search.hits.length} matching ${search.hits.length === 1 ? "file" : "files"}${search.cursor ? " loaded" : ""} for “${search.submitted}”`
              : "Search for a word or phrase inside this record’s files."}
      </p> : null}
      {search.error ? (
        <div role="alert">
          <p>{search.error}</p>
          <button
            type="button"
            disabled={search.busy}
            onClick={() => void search.search()}
          >
            Retry search
          </button>
        </div>
      ) : null}
      {search.submitted &&
      !search.busy &&
      !search.error &&
      !search.hits.length ? (
        <PanelEmptyState className="a-files-empty-state" role="status" icon={<FileTextIcon size={22}/>} title="No matching file contents" description="Try different words or search file names." action={<Button variant="secondary" type="button" onClick={()=>search.setScope("names")}>Search file names</Button>}/>
      ) : null}
      <ul>
        {search.hits.map((hit) => (
          <li
            key={hit.attachmentId}
            className="a-file-search-result"
            data-selected={selected === hit.attachmentId || undefined}
          >
            <div className="a-file-search-result__thumbnail">
              {canPreview ? (
                <AttachmentPreview attachmentId={hit.attachmentId} thumbnail />
              ) : (
                <FileTypeIcon name={hit.fileName} contentType={hit.contentType}/>
              )}
            </div>
            <div className="a-file-search-result__body">
              <strong>{hit.fileName}</strong>
              {hit.contentType ? (
                <small>
                  {hit.contentType === "application/pdf"
                    ? "PDF"
                    : hit.contentType.startsWith("image/")
                      ? hit.contentType.slice(6).toUpperCase()
                      : hit.contentType}
                </small>
              ) : null}
              <SearchExcerpt text={hit.snippet} query={search.submitted} />
              <div className="a-file-search-result__actions">
                {canPreview ? (
                  <FileAction label="Preview file" icon={<EyeIcon size={18} aria-hidden="true"/>} onClick={()=>onPreview(hit)}>Preview</FileAction>
                ) : null}
                {canDownload ? (
                  <FileAction label="Download" icon={<DownloadIcon size={18} aria-hidden="true"/>}
                    disabled={downloading === hit.attachmentId}
                    onClick={() => onDownload(hit.attachmentId)}
                  >
                    Download
                  </FileAction>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {search.cursor ? (
        <button
          type="button"
          disabled={search.busy}
          onClick={() => void search.search(search.cursor)}
        >
          More results
        </button>
      ) : null}
    </section>
  );
}
