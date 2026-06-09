"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Columns3, Eye, EyeOff, Search, X } from "lucide-react";
import type { ResolvedColumn } from "../../core/types";
import { LIST_URL_PARAMS as P } from "../../core/types";
import { PaletteButton } from "./PaletteButton";
import { PaletteDrawerActions } from "./PaletteDrawerActions";
import { PaletteDrawer } from "./PaletteDrawer";
import { ReorderActionsBar, ReorderHandle } from "./ReorderHandle";
import { serializeOrganizeState } from "./organizeUrl";
import { useOrganizePanel } from "./organizeState";
import { ORGANIZE_ICON_BUTTON_CLASS, ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS, ORGANIZE_SECTION_LABEL_CLASS } from "./paletteStyles";

type DropPlacement = "before" | "after";

interface DropIndicator {
  name:      string;
  placement: DropPlacement;
}

interface ColumnControlProps {
  columns:         ResolvedColumn[];
  allColumns:      ResolvedColumn[];
  defaultColumns:  ResolvedColumn[];
  listBaseHref:    string;
  rawSearchParams: Record<string, string | string[] | undefined>;
  enabled:         boolean;
  trigger?:        "button" | "hidden";
}

export function ColumnControl({
  columns,
  allColumns,
  defaultColumns,
  listBaseHref,
  rawSearchParams,
  enabled,
  trigger = "button",
}: ColumnControlProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panel = useOrganizePanel("columns");
  const currentNames = useMemo(() => columns.map((column) => column.name), [columns]);
  const defaultNames = useMemo(() => defaultColumns.map((column) => column.name), [defaultColumns]);
  const columnByName = useMemo(() => new Map(allColumns.map((column) => [column.name, column])), [allColumns]);
  const [draft, setDraft] = useState<string[]>(currentNames);
  const [query, setQuery] = useState("");
  const [draggingName, setDraggingName] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [mobileReorderName, setMobileReorderName] = useState<string | null>(null);
  const draggingNameRef = useRef<string | null>(null);
  const checked = new Set(draft);
  const hiddenCount = Math.max(0, allColumns.length - columns.length);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleColumns = draft
    .map((name) => columnByName.get(name))
    .filter((column): column is ResolvedColumn => Boolean(column))
    .filter((column) => matchesColumnQuery(column, normalizedQuery));
  const hiddenColumns = allColumns
    .filter((column) => !checked.has(column.name))
    .filter((column) => matchesColumnQuery(column, normalizedQuery));
  const orderedDraftNames = draft.filter((name) => columnByName.has(name));
  const hasChanges = !arraysEqual(orderedDraftNames, currentNames);

  useEffect(() => {
    if (panel.open) {
      setDraft(currentNames);
      setQuery("");
      setDraggingName(null);
      setDropIndicator(null);
      setMobileReorderName(null);
      draggingNameRef.current = null;
    }
  }, [currentNames, panel.open]);

  useEffect(() => {
    if (!draggingName) return;

    const originalCursor = document.body.style.cursor;
    const originalUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    const handlePointerMove = (event: PointerEvent) => {
      const sourceName = draggingNameRef.current;
      if (!sourceName) return;

      const nextIndicator = resolveDropIndicator(event.clientY, sourceName);
      if (!nextIndicator) return;

      setDropIndicator(nextIndicator);
      setDraft((prev) => moveItem(prev, sourceName, nextIndicator.name, nextIndicator.placement));
    };

    const handlePointerEnd = () => {
      draggingNameRef.current = null;
      setDraggingName(null);
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
  }, [draggingName]);

  if (!enabled || allColumns.length === 0) return null;

  const apply = () => {
    if (orderedDraftNames.length === 0) return;
    const matchesDefault = arraysEqual(orderedDraftNames, defaultNames);
    router.push(serializeOrganizeState(listBaseHref, rawSearchParams, {
      [P.COLUMNS]: matchesDefault ? null : orderedDraftNames.join(","),
    }));
    panel.close();
  };

  const reset = () => setDraft(defaultNames);

  const showAll = () => setDraft(allColumns.map((column) => column.name));

  const hideAll = () => {
    const fallback = draft[0] ?? allColumns[0]?.name;
    if (!fallback) return;
    setDraft([fallback]);
  };

  const toggle = (name: string) => {
    setMobileReorderName((current) => current === name ? null : current);
    setDraft((prev) => {
      if (prev.includes(name)) {
        if (prev.length <= 1) return prev;
        return prev.filter((item) => item !== name);
      }
      return [...prev, name];
    });
  };

  const startDrag = (name: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (draft.length <= 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingNameRef.current = name;
    setDraggingName(name);
    setDropIndicator(null);
    setMobileReorderName(null);
  };

  const moveWithKeyboard = (name: string, direction: "up" | "down") => {
    setDraft((prev) => {
      const currentIndex = prev.indexOf(name);
      if (currentIndex < 0) return prev;
      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const targetName = prev[targetIndex];
      if (!targetName) return prev;
      return moveItem(prev, name, targetName, direction === "up" ? "before" : "after");
    });
  };

  const moveToEdge = (name: string, edge: "top" | "bottom") => {
    setDraft((prev) => {
      const targetName = edge === "top" ? prev[0] : prev.at(-1);
      if (!targetName || targetName === name) return prev;
      return moveItem(prev, name, targetName, edge === "top" ? "before" : "after");
    });
  };

  return (
    <>
      {trigger === "button" ? (
        <PaletteButton
          ref={buttonRef}
          icon={Columns3}
          label="Columns"
          active={hiddenCount > 0}
          badge={hiddenCount}
          expanded={panel.open}
          onClick={panel.toggle}
        />
      ) : (
        <button ref={buttonRef} type="button" aria-hidden="true" tabIndex={-1} className="sr-only" />
      )}
      {panel.open && (
        <PaletteDrawer
          anchorRef={buttonRef}
          title={`List Columns ${orderedDraftNames.length}/${allColumns.length}`}
          icon={Columns3}
          onClose={panel.close}
          footer={(
            <PaletteDrawerActions
              onApply={apply}
              onReset={reset}
              onDiscard={panel.close}
              hasChanges={hasChanges}
              applyDisabled={orderedDraftNames.length === 0}
            />
          )}
        >
          <div className="flex flex-col gap-4">
            <label className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search columns..."
                className={ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear column search"
                  onClick={() => setQuery("")}
                  className={`absolute right-1.5 top-1/2 -translate-y-1/2 ${ORGANIZE_ICON_BUTTON_CLASS}`}
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              )}
            </label>

            <ColumnSection
              title={`Visible (${draft.length})`}
              actionLabel="Show all"
              actionDisabled={draft.length === allColumns.length}
              onAction={showAll}
            >
              {visibleColumns.length === 0 ? (
                <EmptySectionMessage text="No visible columns match the search." />
              ) : (
                <div className="overflow-hidden rounded-md border">
                  {visibleColumns.map((column, index) => {
                    const draftIndex = draft.indexOf(column.name);
                    return (
                    <Fragment key={column.name}>
                      {dropIndicator?.name === column.name && dropIndicator.placement === "before" && <DropLine />}
                      <ColumnRow
                        column={column}
                        visible
                        showTopBorder={index > 0}
                        disabled={draft.length <= 1}
                        dragging={draggingName === column.name}
                        mobileReorderActive={mobileReorderName === column.name}
                        canMoveUp={draftIndex > 0}
                        canMoveDown={draftIndex < draft.length - 1}
                        onDragStart={(event) => startDrag(column.name, event)}
                        onMobileToggle={() => setMobileReorderName((current) => current === column.name ? null : column.name)}
                        onMoveUp={() => moveWithKeyboard(column.name, "up")}
                        onMoveDown={() => moveWithKeyboard(column.name, "down")}
                        onToggle={() => toggle(column.name)}
                      />
                      {mobileReorderName === column.name && (
                        <ReorderActionsBar
                          label={column.label}
                          canMoveUp={draftIndex > 0}
                          canMoveDown={draftIndex < draft.length - 1}
                          onMoveTop={() => moveToEdge(column.name, "top")}
                          onMoveUp={() => moveWithKeyboard(column.name, "up")}
                          onMoveDown={() => moveWithKeyboard(column.name, "down")}
                          onMoveBottom={() => moveToEdge(column.name, "bottom")}
                          onClose={() => setMobileReorderName(null)}
                        />
                      )}
                      {dropIndicator?.name === column.name && dropIndicator.placement === "after" && <DropLine />}
                    </Fragment>
                    );
                  })}
                </div>
              )}
            </ColumnSection>

            <ColumnSection
              title={`Hidden (${allColumns.length - draft.length})`}
              actionLabel="Hide all"
              actionDisabled={draft.length <= 1}
              onAction={hideAll}
            >
              {hiddenColumns.length === 0 ? (
                <EmptySectionMessage text={query ? "No hidden columns match the search." : "No hidden columns."} />
              ) : (
                <div className="overflow-hidden rounded-md border">
                  {hiddenColumns.map((column, index) => (
                    <ColumnRow
                      key={column.name}
                      column={column}
                      visible={false}
                      showTopBorder={index > 0}
                      onToggle={() => toggle(column.name)}
                    />
                  ))}
                </div>
              )}
            </ColumnSection>
          </div>
        </PaletteDrawer>
      )}
    </>
  );
}

function ColumnSection({
  title,
  actionLabel,
  actionDisabled,
  onAction,
  children,
}: {
  title:          string;
  actionLabel:    string;
  actionDisabled: boolean;
  onAction:       () => void;
  children:       React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className={ORGANIZE_SECTION_LABEL_CLASS}>{title}</h3>
        <button
          type="button"
          disabled={actionDisabled}
          onClick={onAction}
          className="text-sm text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        >
          {actionLabel}
        </button>
      </div>
      {children}
    </section>
  );
}

function ColumnRow({
  column,
  visible,
  showTopBorder = false,
  disabled = false,
  dragging = false,
  mobileReorderActive = false,
  canMoveUp = false,
  canMoveDown = false,
  onDragStart,
  onMobileToggle,
  onMoveUp,
  onMoveDown,
  onToggle,
}: {
  column:       ResolvedColumn;
  visible:      boolean;
  showTopBorder?: boolean;
  disabled?:    boolean;
  dragging?:    boolean;
  mobileReorderActive?: boolean;
  canMoveUp?:   boolean;
  canMoveDown?: boolean;
  onDragStart?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMobileToggle?: () => void;
  onMoveUp?:    () => void;
  onMoveDown?:  () => void;
  onToggle:     () => void;
}) {
  return (
    <div
      data-column-drop-target={visible ? "true" : undefined}
      data-column-name={visible ? column.name : undefined}
      className={`relative flex min-h-10 items-center gap-3 px-3 py-1 text-sm transition-colors ${
        dragging ? "bg-muted/70" : "bg-background"
      } ${showTopBorder ? "border-t" : ""}`}
    >
      {visible ? (
        <ReorderHandle
          label={column.label}
          disabled={disabled}
          active={mobileReorderActive}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onDragStart={(event) => onDragStart?.(event)}
          onMoveUp={() => onMoveUp?.()}
          onMoveDown={() => onMoveDown?.()}
          onMobileToggle={() => onMobileToggle?.()}
        />
      ) : (
        <span className="inline-flex h-8 w-8" />
      )}
      <span className={visible ? "min-w-0 flex-1 truncate text-foreground" : "min-w-0 flex-1 truncate text-muted-foreground"}>
        {column.label}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        aria-label={`${visible ? "Hide" : "Show"} ${column.label}`}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        {visible ? <Eye aria-hidden="true" className="size-4" /> : <EyeOff aria-hidden="true" className="size-4" />}
      </button>
    </div>
  );
}

function EmptySectionMessage({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
      {text}
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

function arraysEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function matchesColumnQuery(column: ResolvedColumn, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return column.label.toLowerCase().includes(normalizedQuery) || column.name.toLowerCase().includes(normalizedQuery);
}

function moveItem(
  items:     string[],
  from:      string,
  to:        string,
  placement: "before" | "after",
): string[] {
  if (from === to) return items;
  const withoutSource = items.filter((item) => item !== from);
  const targetIndex = withoutSource.indexOf(to);
  if (targetIndex < 0) return items;
  const insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
  return [
    ...withoutSource.slice(0, insertIndex),
    from,
    ...withoutSource.slice(insertIndex),
  ];
}

function resolveDropIndicator(pointerY: number, sourceName: string): DropIndicator | null {
  const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-column-drop-target]"))
    .filter((row) => row.dataset.columnName && row.dataset.columnName !== sourceName);
  if (rows.length === 0) return null;

  for (const row of rows) {
    const rect = row.getBoundingClientRect();
    const targetName = row.dataset.columnName;
    if (!targetName) continue;
    if (pointerY < rect.top + rect.height / 2) {
      return { name: targetName, placement: "before" };
    }
  }

  const lastRow = rows[rows.length - 1];
  const lastName = lastRow?.dataset.columnName;
  return lastName ? { name: lastName, placement: "after" } : null;
}
