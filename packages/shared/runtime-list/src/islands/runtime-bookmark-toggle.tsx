"use client";

import { useCallback, useMemo } from "react";
import { Star } from "lucide-react";
import { useRecordBookmarks, type BookmarkSnapshot } from "@athyper/query/hooks";
import type { ResolvedColumn, RuntimeRecordRow } from "../core/types";
import { formatRuntimeColumnValue, resolveRecordId } from "../core/formatters";

export const RUNTIME_FAVORITE_COLUMN_WIDTH = 34;

interface RuntimeBookmarkState {
  bookmarkedIds: Set<string>;
  isPending: boolean;
  toggle: (row: RuntimeRecordRow) => void;
  markRowsAsFavourite: (rows: RuntimeRecordRow[]) => void;
  removeRowsFromFavourite: (rows: RuntimeRecordRow[]) => void;
}

export function useRuntimeBookmarkState(
  entityCode: string,
  rows:       RuntimeRecordRow[],
  columns:    ResolvedColumn[],
): RuntimeBookmarkState {
  const recordIds = useMemo(
    () => rows.map((row) => resolveRecordId(row)).filter((id): id is string => Boolean(id)),
    [rows],
  );
  const { bookmarkedIds, toggle, isPending } = useRecordBookmarks(entityCode, recordIds);

  const toggleRow = useCallback(
    (row: RuntimeRecordRow) => {
      const recordId = resolveRecordId(row);
      if (!recordId) return;
      toggle(recordId, buildBookmarkSnapshot(row, columns, recordId));
    },
    [columns, toggle],
  );

  const markRowsAsFavourite = useCallback(
    (rowsToMark: RuntimeRecordRow[]) => {
      for (const row of rowsToMark) {
        const recordId = resolveRecordId(row);
        if (!recordId || bookmarkedIds.has(recordId)) continue;
        toggle(recordId, buildBookmarkSnapshot(row, columns, recordId));
      }
    },
    [bookmarkedIds, columns, toggle],
  );

  const removeRowsFromFavourite = useCallback(
    (rowsToRemove: RuntimeRecordRow[]) => {
      for (const row of rowsToRemove) {
        const recordId = resolveRecordId(row);
        if (!recordId || !bookmarkedIds.has(recordId)) continue;
        toggle(recordId, buildBookmarkSnapshot(row, columns, recordId));
      }
    },
    [bookmarkedIds, columns, toggle],
  );

  return { bookmarkedIds, isPending, toggle: toggleRow, markRowsAsFavourite, removeRowsFromFavourite };
}

export function RuntimeFavouriteHeaderCell() {
  return (
    <span
      title="Favourites"
      aria-label="Favourites"
      className="inline-flex size-5 items-center justify-center text-muted-foreground/45"
    >
      <Star aria-hidden="true" className="size-3.5" />
    </span>
  );
}

export function RuntimeBookmarkToggle({
  bookmarked,
  disabled,
  onToggle,
}: {
  bookmarked: boolean;
  disabled?:  boolean;
  onToggle:   () => void;
}) {
  return (
    <button
      data-row-action
      type="button"
      aria-label={bookmarked ? "Remove from favourites" : "Add to favourites"}
      title={bookmarked ? "Remove from favourites" : "Add to favourites"}
      aria-pressed={bookmarked}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onToggle();
      }}
      className={cx(
        "inline-flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        "disabled:cursor-not-allowed disabled:opacity-45",
        bookmarked
          ? "text-primary hover:text-primary/75"
          : "text-muted-foreground/35 hover:text-primary/70",
      )}
    >
      <Star
        aria-hidden="true"
        className={cx("size-3.5 transition-all", bookmarked ? "fill-current" : "")}
      />
    </button>
  );
}

function buildBookmarkSnapshot(
  row:      RuntimeRecordRow,
  columns:  ResolvedColumn[],
  recordId: string,
): BookmarkSnapshot {
  const displayName =
    firstColumnDisplay(row, columns, (column) => isNameLikeColumn(column)) ??
    firstColumnDisplay(row, columns, (_column, index) => index === 0) ??
    recordId;
  const recordCode = firstColumnDisplay(row, columns, (column) => isCodeLikeColumn(column));
  return { displayName, recordCode };
}

function firstColumnDisplay(
  row:       RuntimeRecordRow,
  columns:   ResolvedColumn[],
  predicate: (column: ResolvedColumn, index: number) => boolean,
): string | null {
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (!column || !predicate(column, index)) continue;
    const display = formatRuntimeColumnValue(row, column).display.trim();
    if (display) return display;
  }
  return null;
}

function isNameLikeColumn(column: ResolvedColumn): boolean {
  const name = column.name.toLowerCase();
  return name === "name" ||
    name === "title" ||
    name === "display_name" ||
    name.endsWith("_name") ||
    name.endsWith("_title");
}

function isCodeLikeColumn(column: ResolvedColumn): boolean {
  const name = column.name.toLowerCase();
  return name === "code" ||
    name === "record_code" ||
    name.endsWith("_code");
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
