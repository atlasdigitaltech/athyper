"use client";
import { useEntityI18n } from "@athyper/platform-i18n/entity-react";
import { fileFilterBody } from "./file-filter-body";

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
  }, [entityType, entityId, client, allowed]);
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
          body: { entityType, entityId, q: term, ...fileFilterBody(folderFilter, categoryFilter), ...(after ? { after } : {}) },
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
  creationAction,
}: {
  search: FileSearchState;
  nameQuery: string;
  onNameQuery: (value: string) => void;
  canSearch: boolean;
  onClear: () => void;
  actions?: ReactNode;
  creationAction?: ReactNode;
}) {
  const intl = useEntityI18n();
  const contents = search.scope === "contents";
  const query = contents ? search.query : nameQuery;
  return (
    <div className="a-file-search">
      <div className="a-file-search__control">
      <form
        role="search"
        aria-label={intl.message("files.searchRecord")}
        onSubmit={(event) => {
          event.preventDefault();
          if (contents) void search.search();
        }}
      >
        <SearchField className="a-file-search__input" label={contents ? intl.message("files.searchContents") : intl.message("files.searchNames")} enterKeyHint="search" value={query} maxLength={256} placeholder={contents ? intl.message("files.findWords") : intl.message("files.searchPlaceholder")} onValueChange={contents ? search.setQuery : onNameQuery} onClear={onClear}/>
        {contents ? (
          <button type="submit" disabled={search.busy || !query.trim()}>{intl.message("files.search")}</button>
        ) : null}
      </form>
      {canSearch ? (
        <fieldset className="a-file-search__scope">
          <legend className="a-file-search__label">{intl.message("files.searchIn")}</legend>
          {(
            [
              ["names", intl.message("files.names")],
              ["contents", intl.message("files.contents")],
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
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      </div>
      {creationAction ? <div className="a-file-search__create">{creationAction}</div> : null}
      {actions}
    </div>
  );
}

function excerpt(text: string, query: string, expanded = false) {
  const normalized = text.replace(/\s+/g, " ").trim();
  const position = normalized
    .toLocaleLowerCase()
    .indexOf(query.toLocaleLowerCase());
  const start = expanded ? 0 : Math.max(0, position - 75);
  const value = expanded ? normalized : normalized.slice(start, start + 280);
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
  const [clipped, setClipped] = useState(false);
  const paragraph = useRef<HTMLParagraphElement>(null);
  useEffect(() => { setExpanded(false); }, [text, query]);
  useEffect(() => {
    const element = paragraph.current;
    if (!element || expanded) return;
    const measure = () => setClipped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [text, query, expanded]);
  return (
    <>
      <p
        ref={paragraph}
        className="a-file-search-excerpt"
        data-expanded={expanded || undefined}
      >
        {excerpt(text, query, expanded)}
      </p>
      {expanded || clipped || text.replace(/\s+/g, " ").trim().length > 280 ? (
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
  downloading?: ReadonlySet<string>;
}) {
  const intl = useEntityI18n();
  return (
    <section
      className="a-file-search-results"
      aria-label={intl.message("files.contentResults")}
      aria-busy={search.busy}
    >
      {!search.submitted && !search.busy && !search.error ? <PanelEmptyState className="a-files-empty-state" role="status" icon={<FileTextIcon size={28}/>} title={intl.message("files.searchInside")} description={intl.message("files.searchHelp")} action={<Button variant="secondary" type="button" onClick={()=>search.setScope("names")}>{intl.message("files.show")}</Button>}/> : !search.error && (search.busy || search.hits.length > 0) ? <p role="status">
        {search.busy
            ? intl.message("files.searching")
            : search.submitted
              ? intl.message("files.queryCount", {count: search.hits.length, loaded: String(Boolean(search.cursor)), query: search.submitted})
              : intl.message("files.searchPrompt")}
      </p> : null}
      {search.error ? (
        <PanelEmptyState className="a-files-empty-state" role="alert"
          icon={<FileTextIcon size={28}/>}
          title={intl.message("files.contentUnavailable")}
          description={intl.message("files.searchError")}
          action={<><Button variant="secondary" type="button" disabled={search.busy}
            onClick={() => void search.search()}>{intl.message("files.retrySearch")}</Button>
            <Button variant="secondary" type="button" onClick={() => search.setScope("names")}>{intl.message("files.searchNames")}</Button></>}/>
      ) : null}
      {search.submitted &&
      !search.busy &&
      !search.error &&
      !search.cursor &&
      !search.hits.length ? (
        <PanelEmptyState className="a-files-empty-state" role="status" icon={<FileTextIcon size={22}/>} title={intl.message("files.noContents")} description={intl.message("files.tryWords")} action={<Button variant="secondary" type="button" onClick={()=>search.setScope("names")}>{intl.message("files.searchNames")}</Button>}/>
      ) : null}
      {search.submitted && !search.busy && !search.error && !search.hits.length && search.cursor
        ? <p role="status">{intl.message("files.noAccessibleMatches")}</p> : null}
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
                  <FileAction label={intl.message("files.previewFile")} icon={<EyeIcon size={18} aria-hidden="true"/>} onClick={()=>onPreview(hit)}>{intl.message("action.preview")}</FileAction>
                ) : null}
                {canDownload ? (
                  <FileAction label={intl.message("action.download")} icon={<DownloadIcon size={18} aria-hidden="true"/>}
                    disabled={downloading?.has(hit.attachmentId)}
                    onClick={() => onDownload(hit.attachmentId)}
                  >{intl.message("action.download")}</FileAction>
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
        >{intl.message("files.moreResults")}</button>
      ) : null}
    </section>
  );
}
