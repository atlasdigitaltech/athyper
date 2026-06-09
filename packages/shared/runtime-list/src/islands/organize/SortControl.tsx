"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Plus,
  Trash2,
} from "lucide-react";
import type { RuntimeField, SortEntry } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { PaletteButton } from "./PaletteButton";
import { PaletteDrawerActions } from "./PaletteDrawerActions";
import { PaletteDrawer } from "./PaletteDrawer";
import { ReorderActionsBar, ReorderHandle } from "./ReorderHandle";
import { serializeOrganizeState, sortEntriesToParam } from "./organizeUrl";
import { useOrganizePanel } from "./organizeState";
import { ORGANIZE_ICON_BUTTON_CLASS } from "./paletteStyles";
import { FieldCombobox } from "./FieldCombobox";

type DropPlacement = "before" | "after";

interface DropIndicator {
  key:       string;
  placement: DropPlacement;
}

interface SortControlProps {
  activeSort:      SortEntry[];
  sortableFields:  RuntimeField[];
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
  multiSort?:      boolean;
  maxSortLevels?:  number;
  trigger?:        "button" | "hidden";
}

export function SortControl({
  activeSort,
  sortableFields,
  listBaseHref,
  rawSearchParams,
  multiSort = false,
  maxSortLevels,
  trigger = "button",
}: SortControlProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panel = useOrganizePanel("sort");
  const effectiveMaxSortLevels = normalizeSortLevelLimit(maxSortLevels, multiSort);
  const fieldByName = useMemo(() => new Map(sortableFields.map((field) => [field.name, field])), [sortableFields]);
  const [draft, setDraft] = useState<SortEntry[]>(() => (
    cleanSortEntries(activeSort, fieldByName, effectiveMaxSortLevels)
  ));
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [mobileReorderKey, setMobileReorderKey] = useState<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const cleanDraft = useMemo(
    () => cleanSortEntries(draft, fieldByName, effectiveMaxSortLevels),
    [draft, effectiveMaxSortLevels, fieldByName],
  );
  const cleanActiveSort = useMemo(
    () => cleanSortEntries(activeSort, fieldByName, effectiveMaxSortLevels),
    [activeSort, effectiveMaxSortLevels, fieldByName],
  );
  const selectedKeys = new Set(cleanDraft.map((entry) => entry.key));
  const availableFields = sortableFields.filter((field) => !selectedKeys.has(field.name));
  const canAddSort = cleanDraft.length < effectiveMaxSortLevels && availableFields.length > 0;
  const hasChanges = !sortEntriesEqual(cleanDraft, cleanActiveSort);

  useEffect(() => {
    if (panel.open) {
      setDraft(cleanActiveSort);
      setDraggingKey(null);
      setDropIndicator(null);
      setMobileReorderKey(null);
      draggingKeyRef.current = null;
    }
  }, [cleanActiveSort, panel.open]);

  useEffect(() => {
    if (!draggingKey) return;

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const sourceKey = draggingKeyRef.current;
      if (!sourceKey) return;

      const nextIndicator = resolveSortDropIndicator(event.clientY, sourceKey);
      if (!nextIndicator) return;

      setDropIndicator(nextIndicator);
      setDraft((prev) => moveSortEntry(prev, sourceKey, nextIndicator.key, nextIndicator.placement));
    };

    const handlePointerEnd = () => {
      draggingKeyRef.current = null;
      setDraggingKey(null);
      setDropIndicator(null);
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerEnd);
    document.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerEnd);
      document.removeEventListener("pointercancel", handlePointerEnd);
      document.body.style.cursor = originalCursor;
      document.body.style.userSelect = originalUserSelect;
    };
  }, [draggingKey]);

  if (sortableFields.length === 0) return null;

  const apply = () => {
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.SORT]: sortEntriesToParam(cleanDraft),
    }));
    panel.close();
  };

  const addSort = (fieldName: string) => {
    if (!fieldName || !fieldByName.has(fieldName)) return;
    setDraft((prev) => {
      const clean = cleanSortEntries(prev, fieldByName, effectiveMaxSortLevels);
      if (clean.length >= effectiveMaxSortLevels || clean.some((entry) => entry.key === fieldName)) return clean;
      return [...clean, { key: fieldName, dir: "asc" }];
    });
  };

  const updateSortField = (index: number, fieldName: string) => {
    if (!fieldName || !fieldByName.has(fieldName)) return;
    setDraft((prev) => {
      const clean = cleanSortEntries(prev, fieldByName, effectiveMaxSortLevels);
      if (clean.some((entry, entryIndex) => entryIndex !== index && entry.key === fieldName)) return clean;
      return clean.map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, key: fieldName } : entry
      ));
    });
  };

  const updateDirection = (index: number, dir: SortEntry["dir"]) => {
    setDraft((prev) => cleanSortEntries(prev, fieldByName, effectiveMaxSortLevels).map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, dir } : entry
    )));
  };

  const removeSort = (index: number) => {
    const removedKey = cleanDraft[index]?.key;
    setMobileReorderKey((current) => current === removedKey ? null : current);
    setDraft((prev) => cleanSortEntries(prev, fieldByName, effectiveMaxSortLevels).filter((_, entryIndex) => entryIndex !== index));
  };

  const startDrag = (key: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (!multiSort || cleanDraft.length <= 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingKeyRef.current = key;
    setDraggingKey(key);
    setDropIndicator(null);
    setMobileReorderKey(null);
  };

  const moveWithKeyboard = (key: string, direction: "up" | "down") => {
    const currentIndex = cleanDraft.findIndex((entry) => entry.key === key);
    if (currentIndex < 0) return;
    const target = cleanDraft[direction === "up" ? currentIndex - 1 : currentIndex + 1];
    if (!target) return;
    setDraft((prev) => moveSortEntry(prev, key, target.key, direction === "up" ? "before" : "after"));
  };

  const moveToEdge = (key: string, edge: "top" | "bottom") => {
    const target = edge === "top" ? cleanDraft[0] : cleanDraft.at(-1);
    if (!target || target.key === key) return;
    setDraft((prev) => moveSortEntry(prev, key, target.key, edge === "top" ? "before" : "after"));
  };

  return (
    <>
      {trigger === "button" ? (
        <PaletteButton
          ref={buttonRef}
          icon={ArrowUpDown}
          label="Sort"
          active={cleanActiveSort.length > 0}
          badge={cleanActiveSort.length}
          expanded={panel.open}
          onClick={panel.toggle}
        />
      ) : (
        <button ref={buttonRef} type="button" aria-hidden="true" tabIndex={-1} className="sr-only" />
      )}
      {panel.open && (
        <PaletteDrawer
          anchorRef={buttonRef}
          title={`Sort${cleanDraft.length > 0 ? ` ${cleanDraft.length}` : ""}`}
          icon={ArrowUpDown}
          onClose={panel.close}
          footer={(
            <PaletteDrawerActions
              onApply={apply}
              onReset={() => setDraft([])}
              onDiscard={panel.close}
              hasChanges={hasChanges}
            />
          )}
        >
          <div className="flex flex-col gap-3">
            {cleanDraft.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sort fields selected.</p>
            ) : (
              <div className="space-y-2">
                {cleanDraft.map((entry, index) => (
                  <Fragment key={entry.key}>
                    {dropIndicator?.key === entry.key && dropIndicator.placement === "before" && <DropLine />}
                    <SortLevelRow
                      entry={entry}
                      index={index}
                      fields={sortableFields.filter((field) => (
                        field.name === entry.key || !cleanDraft.some((sort, sortIndex) => sortIndex !== index && sort.key === field.name)
                      ))}
                      canReorder={multiSort && cleanDraft.length > 1}
                      canMoveUp={index > 0}
                      canMoveDown={index < cleanDraft.length - 1}
                      dragging={draggingKey === entry.key}
                      mobileReorderActive={mobileReorderKey === entry.key}
                      onDragStart={(event) => startDrag(entry.key, event)}
                      onMobileToggle={() => setMobileReorderKey((current) => current === entry.key ? null : entry.key)}
                      onFieldChange={(fieldName) => updateSortField(index, fieldName)}
                      onDirectionChange={(dir) => updateDirection(index, dir)}
                      onMoveUp={() => moveWithKeyboard(entry.key, "up")}
                      onMoveDown={() => moveWithKeyboard(entry.key, "down")}
                      onRemove={() => removeSort(index)}
                    />
                    {mobileReorderKey === entry.key && (
                      <ReorderActionsBar
                        label={sortableFields.find((field) => field.name === entry.key)?.label ?? entry.key}
                        canMoveUp={index > 0}
                        canMoveDown={index < cleanDraft.length - 1}
                        onMoveTop={() => moveToEdge(entry.key, "top")}
                        onMoveUp={() => moveWithKeyboard(entry.key, "up")}
                        onMoveDown={() => moveWithKeyboard(entry.key, "down")}
                        onMoveBottom={() => moveToEdge(entry.key, "bottom")}
                        onClose={() => setMobileReorderKey(null)}
                      />
                    )}
                    {dropIndicator?.key === entry.key && dropIndicator.placement === "after" && <DropLine />}
                  </Fragment>
                ))}
              </div>
            )}

            {canAddSort && (
              <div className="flex min-h-11 items-center gap-2 rounded-md border border-dashed bg-background px-2 py-1 text-sm transition-colors hover:bg-muted/60">
                <span className="flex w-8 shrink-0 justify-center">
                  <Plus aria-hidden="true" className="size-4 text-foreground" />
                </span>
                <FieldCombobox
                  fields={availableFields}
                  value={null}
                  placeholder="Add sort field"
                  ariaLabel="Add sort field"
                  searchPlaceholder="Search sortable fields..."
                  noResultsMessage="No sortable fields found."
                  onChange={addSort}
                />
              </div>
            )}
          </div>
        </PaletteDrawer>
      )}
    </>
  );
}

function SortLevelRow({
  entry,
  index,
  fields,
  canReorder,
  canMoveUp,
  canMoveDown,
  dragging,
  mobileReorderActive,
  onDragStart,
  onMobileToggle,
  onFieldChange,
  onDirectionChange,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  entry:             SortEntry;
  index:             number;
  fields:            RuntimeField[];
  canReorder:        boolean;
  canMoveUp:         boolean;
  canMoveDown:       boolean;
  dragging:          boolean;
  mobileReorderActive:boolean;
  onDragStart:       (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMobileToggle:    () => void;
  onFieldChange:     (fieldName: string) => void;
  onDirectionChange: (dir: SortEntry["dir"]) => void;
  onMoveUp:          () => void;
  onMoveDown:        () => void;
  onRemove:          () => void;
}) {
  const fieldLabel = fields.find((field) => field.name === entry.key)?.label ?? entry.key;

  return (
    <div
      data-sort-drop-target="true"
      data-sort-key={entry.key}
      className={`flex min-h-11 items-center gap-2 rounded-md border bg-background px-2 py-1 text-sm shadow-sm transition-colors ${
        dragging ? "bg-muted/70" : ""
      }`}
    >
      <ReorderHandle
        label={`${fieldLabel} sort`}
        disabled={!canReorder}
        active={mobileReorderActive}
        canMoveUp={canMoveUp}
        canMoveDown={canMoveDown}
        onDragStart={onDragStart}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onMobileToggle={onMobileToggle}
      />

      <span className="w-6 shrink-0 text-center text-sm text-muted-foreground">{index + 1}</span>

      <FieldCombobox
        fields={fields}
        value={entry.key}
        placeholder="Select field"
        ariaLabel={`Change ${fieldLabel} sort field`}
        searchPlaceholder="Search sortable fields..."
        noResultsMessage="No sortable fields found."
        onChange={onFieldChange}
      />

      <DirectionSegmentedControl
        dir={entry.dir}
        onChange={onDirectionChange}
      />

      <button
        type="button"
        aria-label={`Remove ${fieldLabel} sort`}
        onClick={onRemove}
        className={`${ORGANIZE_ICON_BUTTON_CLASS} size-9`}
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}


function DirectionSegmentedControl({
  dir,
  onChange,
}: {
  dir:      SortEntry["dir"];
  onChange: (dir: SortEntry["dir"]) => void;
}) {
  return (
    <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-md border bg-background p-0.5">
      <button
        type="button"
        aria-label="Ascending"
        title="Ascending"
        aria-pressed={dir === "asc"}
        onClick={() => onChange("asc")}
        className={`inline-flex h-7 w-9 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          dir === "asc"
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <ArrowUpNarrowWide aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Descending"
        title="Descending"
        aria-pressed={dir === "desc"}
        onClick={() => onChange("desc")}
        className={`inline-flex h-7 w-9 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          dir === "desc"
            ? "bg-foreground text-background shadow-sm"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <ArrowDownWideNarrow aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

function DropLine() {
  return (
    <div aria-hidden="true" className="relative z-20 h-0">
      <span className="absolute left-0 right-0 top-[-2px] h-1 bg-foreground shadow-sm" />
    </div>
  );
}

function normalizeSortLevelLimit(value: number | undefined, multiSort: boolean): number {
  if (!multiSort) return 1;
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  return Math.min(5, Math.max(2, Math.trunc(value)));
}

function cleanSortEntries(
  entries:      SortEntry[],
  fieldByName:  Map<string, RuntimeField>,
  maxSortLevels:number,
): SortEntry[] {
  const seen = new Set<string>();
  const clean: SortEntry[] = [];
  for (const entry of entries) {
    if (!fieldByName.has(entry.key) || seen.has(entry.key)) continue;
    seen.add(entry.key);
    clean.push({
      key: entry.key,
      dir: entry.dir === "desc" ? "desc" : "asc",
    });
    if (clean.length >= maxSortLevels) break;
  }
  return clean;
}

function sortEntriesEqual(left: SortEntry[], right: SortEntry[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry.key === right[index]?.key && entry.dir === right[index]?.dir);
}

function moveSortEntry(
  entries:   SortEntry[],
  fromKey:   string,
  toKey:     string,
  placement: DropPlacement,
): SortEntry[] {
  if (fromKey === toKey) return entries;
  const source = entries.find((entry) => entry.key === fromKey);
  if (!source) return entries;
  const withoutSource = entries.filter((entry) => entry.key !== fromKey);
  const targetIndex = withoutSource.findIndex((entry) => entry.key === toKey);
  if (targetIndex < 0) return entries;
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertIndex),
    source,
    ...withoutSource.slice(insertIndex),
  ];
}

function resolveSortDropIndicator(pointerY: number, sourceKey: string): DropIndicator | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-sort-drop-target]"))
    .filter((row) => row.dataset.sortKey && row.dataset.sortKey !== sourceKey);
  if (rows.length === 0) return null;

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const targetKey = row.dataset.sortKey;
    if (!targetKey) continue;
    if (pointerY < rect.top + rect.height / 2) {
      return { key: targetKey, placement: "before" };
    }
  }

  const lastRow = rows[rows.length - 1];
  const lastKey = lastRow?.dataset.sortKey;
  return lastKey ? { key: lastKey, placement: "after" } : null;
}
