"use client";

/**
 * AdvancedEntityCombobox — Popover wrapper around AdvancedEntityChooserPanel.
 *
 * Combines a trigger button (shows current selection) with a floating
 * AdvancedEntityChooserPanel inside a Radix Popover. Persists the panel's
 * expanded/density state in localStorage so repeat sessions feel consistent.
 *
 * Caller responsibilities:
 *   - Fetch options and set `loading` state
 *   - Respond to `onQueryChange` to trigger a new server search
 *   - Optionally pass `meta` to configure density, controls, tree, sections
 *
 * Usage:
 *   <AdvancedEntityCombobox
 *     value={supplierId}
 *     displayLabel={supplierName}
 *     onChange={setSupplierId}
 *     options={supplierOptions}
 *     loading={isLoading}
 *     onQueryChange={setQuery}
 *     meta={{ density: "compact", placeholder: "Search suppliers…" }}
 *   />
 */

import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  AdvancedEntityChooserPanel,
  type AdvancedEntityChooserControl,
  type AdvancedEntityChooserMetaConfig,
  type AdvancedEntityChooserOption,
} from "./advanced-entity-chooser";

// localStorage helpers

const STORAGE_PREFIX = "athyper:picker-size:";
const PANEL_SELECTOR = "[data-advanced-entity-chooser-panel]";
const LIST_SELECTOR = "[data-advanced-entity-chooser-list]";
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 1100;
const MIN_LIST_HEIGHT = 120;
const MAX_LIST_HEIGHT = 900;
const DEFAULT_PANEL_WIDTH = 420;
const DEFAULT_LIST_HEIGHT = 320;
const EXPANDED_PANEL_WIDTH = "min(720px, calc(100vw - 32px))";
const EXPANDED_LIST_HEIGHT = "min(64dvh, 560px)";
const MODAL_PORTAL_ROOT_SELECTOR = [
  "[data-advanced-picker-portal-root='true']",
  "[data-drawer-shell-content='true']",
  "[role='dialog']",
].join(", ");

function loadSize(key: string | null | undefined): { w: number; h: number } | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed !== null && typeof parsed === "object" &&
      typeof (parsed as Record<string, unknown>).w === "number" &&
      typeof (parsed as Record<string, unknown>).h === "number"
    ) {
      return parsed as { w: number; h: number };
    }
  } catch { /* ignore quota/parse errors */ }
  return null;
}

function saveSize(key: string | null | undefined, w: number, h: number): void {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ w, h }));
  } catch { /* ignore quota errors */ }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Density fallbacks used for resize origin calculation

const DENSITY_DEFAULTS: Record<string, { w: number; h: number }> = {
  mini:        { w: DEFAULT_PANEL_WIDTH, h: DEFAULT_LIST_HEIGHT },
  compact:     { w: DEFAULT_PANEL_WIDTH, h: DEFAULT_LIST_HEIGHT },
  comfortable: { w: DEFAULT_PANEL_WIDTH, h: DEFAULT_LIST_HEIGHT },
  mobile:      { w: DEFAULT_PANEL_WIDTH, h: DEFAULT_LIST_HEIGHT },
};

function viewportAwareListHeight(maxListHeight: AdvancedEntityChooserMetaConfig["maxListHeight"]): string {
  const availableHeight = "max(128px, calc(var(--radix-popover-content-available-height) - 104px))";
  if (typeof maxListHeight === "number") return `min(${maxListHeight}px, ${availableHeight})`;
  if (typeof maxListHeight === "string" && maxListHeight.trim()) {
    return `min(${maxListHeight.trim()}, ${availableHeight})`;
  }
  return `min(${DEFAULT_LIST_HEIGHT}px, ${availableHeight})`;
}

function viewportAwarePanelWidth(width: AdvancedEntityChooserMetaConfig["width"]): string {
  let preferredWidth = `${DEFAULT_PANEL_WIDTH}px`;
  if (typeof width === "number") {
    preferredWidth = `${width}px`;
  } else if (typeof width === "string" && width.trim()) {
    preferredWidth = width.trim();
  }
  return `min(${preferredWidth}, calc(100vw - 32px))`;
}

// Types

type InteractionState = {
  type: "drag" | "resize";
  startX: number;
  startY: number;
  /** Drag: committed offset at drag start. Resize: unused. */
  originOffsetX: number;
  originOffsetY: number;
  /** Resize: panel dimensions at resize start. Drag: unused. */
  originW: number;
  originH: number;
};

export interface AdvancedEntityComboboxProps {
  value?: string | null;
  displayLabel?: string | null;
  onChange?: (value: string | null) => void;
  options: AdvancedEntityChooserOption[];
  loading?: boolean;
  onQueryChange?: (query: string) => void;
  onOpen?: () => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
  id?: string;
  meta?: AdvancedEntityChooserMetaConfig;
  optionActionLabel?: string;
  loadedCount?: number;
  totalCount?: number;
  resultLabel?: string;
  onLoadMore?: () => void;
  loadMoreLoading?: boolean;
  treeEnabled?: boolean;
  onTreeEnabledChange?: (enabled: boolean) => void;
  defaultSearchMode?: "server" | "instant";
  activeControlValue?: string | null;
  onControlChange?: (control: AdvancedEntityChooserControl, query: string) => void;
  /**
   * Key used to persist the user's resized panel dimensions in localStorage.
   * Pass the entity code (e.g. "gl_account", "supplier") so each entity
   * remembers its own preferred size independently.
   */
  storageKey?: string | null;
}

export const AdvancedEntityCombobox = forwardRef<HTMLDivElement, AdvancedEntityComboboxProps>(
  (
    {
      value,
      displayLabel,
      onChange,
      options,
      loading = false,
      onQueryChange,
      onOpen,
      placeholder = "Select...",
      disabled,
      clearable = true,
      error,
      className,
      id: externalId,
      meta,
      optionActionLabel,
      loadedCount,
      totalCount,
      resultLabel,
      onLoadMore,
      loadMoreLoading,
      treeEnabled = false,
      onTreeEnabledChange,
      defaultSearchMode = "server",
      activeControlValue,
      onControlChange,
      storageKey,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const defaultInstantSearch = defaultSearchMode === "instant";
    const [instantSearch, setInstantSearch] = useState(defaultInstantSearch);
    const [expanded, setExpanded] = useState(false);
    const [expandedPortalContainer, setExpandedPortalContainer] = useState<HTMLElement | null>(null);
    const triggerRef = useRef<HTMLDivElement | null>(null);

    // Drag & resize state

    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [userSize, setUserSize] = useState<{ w: number; h: number } | null>(
      () => loadSize(storageKey),
    );

    // Refs for reading latest values in stable event-handler closures.
    const dragOffsetRef = useRef(dragOffset);
    const userSizeRef   = useRef(userSize);
    useEffect(() => { dragOffsetRef.current = dragOffset; }, [dragOffset]);
    useEffect(() => { userSizeRef.current   = userSize;   }, [userSize]);

    const interactionRef = useRef<InteractionState | null>(null);

    useEffect(() => {
      const nextSize = loadSize(storageKey);
      userSizeRef.current = nextSize;
      setUserSize(nextSize);
    }, [storageKey]);

    useEffect(() => {
      if (!open) {
        setExpandedPortalContainer(null);
        return;
      }
      setExpandedPortalContainer(
        triggerRef.current?.closest<HTMLElement>(MODAL_PORTAL_ROOT_SELECTOR) ?? null,
      );
    }, [open]);

    useEffect(() => {
      if (!disabled || !open) return;
      setOpen(false);
      setQuery("");
      onQueryChange?.("");
      setDragOffset({ x: 0, y: 0 });
      setInstantSearch(defaultInstantSearch);
      setExpanded(false);
    }, [defaultInstantSearch, disabled, onQueryChange, open]);

    useEffect(() => {
      if (open) return;
      setInstantSearch(defaultInstantSearch);
    }, [defaultInstantSearch, open]);

    const handleDragStart = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      interactionRef.current = {
        type: "drag",
        startX: e.clientX,
        startY: e.clientY,
        originOffsetX: dragOffsetRef.current.x,
        originOffsetY: dragOffsetRef.current.y,
        originW: 0,
        originH: 0,
      };
      document.body.style.cursor     = "grabbing";
      document.body.style.userSelect = "none";
    }, []);

    const handleResizeStart = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const density = meta?.density ?? "compact";
      const fallback = DENSITY_DEFAULTS[density] ?? { w: 340, h: 250 };
      const handle = e.currentTarget as HTMLElement;
      const panelElement = handle.closest<HTMLElement>(PANEL_SELECTOR);
      const listElement = panelElement?.querySelector<HTMLElement>(LIST_SELECTOR);
      const measuredWidth = panelElement?.getBoundingClientRect().width;
      const measuredHeight = listElement?.getBoundingClientRect().height;
      const fallbackWidth = userSizeRef.current?.w ?? (typeof meta?.width === "number" ? meta.width : fallback.w);
      const fallbackHeight = userSizeRef.current?.h ?? (typeof meta?.maxListHeight === "number" ? meta.maxListHeight : fallback.h);
      const originW = measuredWidth && Number.isFinite(measuredWidth) ? measuredWidth : fallbackWidth;
      const originH = measuredHeight && Number.isFinite(measuredHeight) ? measuredHeight : fallbackHeight;
      interactionRef.current = {
        type: "resize",
        startX: e.clientX,
        startY: e.clientY,
        originOffsetX: 0,
        originOffsetY: 0,
        originW,
        originH,
      };
      document.body.style.cursor     = "se-resize";
      document.body.style.userSelect = "none";
    }, [meta?.density, meta?.maxListHeight, meta?.width]);

    useEffect(() => {
      const onMouseMove = (e: MouseEvent) => {
        const state = interactionRef.current;
        if (!state) return;
        const dx = e.clientX - state.startX;
        const dy = e.clientY - state.startY;
        if (state.type === "drag") {
          const nextOffset = { x: state.originOffsetX + dx, y: state.originOffsetY + dy };
          dragOffsetRef.current = nextOffset;
          setDragOffset(nextOffset);
        } else {
          const nextSize = {
            w: clamp(state.originW + dx, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH),
            h: clamp(state.originH + dy, MIN_LIST_HEIGHT, MAX_LIST_HEIGHT),
          };
          userSizeRef.current = nextSize;
          setUserSize(nextSize);
        }
      };

      const onMouseUp = () => {
        if (!interactionRef.current) return;
      if (interactionRef.current.type === "resize") {
          const size = userSizeRef.current;
          if (size) saveSize(storageKey, size.w, size.h);
        }
        interactionRef.current = null;
        document.body.style.cursor     = "";
        document.body.style.userSelect = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup",   onMouseUp);
      return () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup",   onMouseUp);
        if (interactionRef.current) {
          interactionRef.current = null;
          document.body.style.cursor     = "";
          document.body.style.userSelect = "";
        }
      };
    }, [storageKey]);

    // Meta override with user size

    const viewportAwareMeta = useMemo<AdvancedEntityChooserMetaConfig>(
      () => {
        if (expanded) {
          return {
            ...meta,
            width: EXPANDED_PANEL_WIDTH,
            listHeight: EXPANDED_LIST_HEIGHT,
            maxListHeight: EXPANDED_LIST_HEIGHT,
          };
        }
        const resizedListHeight = userSize ? viewportAwareListHeight(userSize.h) : undefined;
        return {
          ...meta,
          width:         viewportAwarePanelWidth(userSize?.w ?? meta?.width),
          listHeight:    resizedListHeight ?? meta?.listHeight,
          maxListHeight: viewportAwareListHeight(userSize?.h ?? meta?.maxListHeight),
        };
      },
      [expanded, meta, userSize],
    );

    // Popover handlers

    const handleOpenChange = (next: boolean) => {
      if (disabled && next) return;
      setOpen(next);
      if (next) {
        onOpen?.();
      } else {
        setQuery("");
        onQueryChange?.("");
        setDragOffset({ x: 0, y: 0 });
        setInstantSearch(defaultInstantSearch);
        setExpanded(false);
      }
    };

    const handleExpandedChange = (next: boolean) => {
      if (disabled) return;
      setExpanded(next);
      setDragOffset({ x: 0, y: 0 });
    };

    const handleLayerKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        handleOpenChange(false);
      }
    };

    const handleQueryChange = (next: string) => {
      if (disabled) return;
      setQuery(next);
      if (!instantSearch) onQueryChange?.(next);
    };

    const handleInstantSearchToggle = () => {
      if (disabled) return;
      setInstantSearch((current) => {
        const next = !current;
        if (!next) onQueryChange?.(query);
        return next;
      });
    };

    const handleSelect = (option: AdvancedEntityChooserOption) => {
      if (disabled) return;
      onChange?.(option.value);
      handleOpenChange(false);
    };

    const handleClear = (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (disabled) return;
      onChange?.(null);
    };

    const currentLabel = displayLabel ?? value ?? null;

    return (
      <div className={className}>
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            <div
              ref={(node) => {
                triggerRef.current = node;
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
              }}
              id={id}
              role="combobox"
              tabIndex={disabled ? -1 : 0}
              aria-expanded={open}
              aria-invalid={!!error}
              aria-disabled={disabled}
              onPointerDown={(event) => {
                if (!disabled) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                if (!disabled) return;
                event.preventDefault();
                event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleOpenChange(!open);
                }
              }}
              className={cn(
                "flex h-9 w-full cursor-pointer select-none items-center justify-between gap-1 rounded-md border border-input bg-background px-3 py-1",
                "text-left text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                disabled && "cursor-not-allowed opacity-50",
                error && "border-destructive ring-1 ring-destructive",
              )}
            >
              <span className={cn("min-w-0 truncate", !currentLabel && "text-muted-foreground")}>
                {currentLabel ?? placeholder}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {clearable && value && !disabled && (
                  <button
                    type="button"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={handleClear}
                    className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear selection"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    open && "rotate-180",
                  )}
                />
              </div>
            </div>
          </Popover.Trigger>

          <Popover.Portal container={expandedPortalContainer ?? undefined}>
            {expanded ? (
              <div
                data-advanced-entity-chooser-expanded="true"
                className="pointer-events-auto fixed inset-0 z-[600] bg-transparent"
                onPointerDown={() => handleOpenChange(false)}
                onMouseDown={() => handleOpenChange(false)}
                onKeyDown={handleLayerKeyDown}
              >
                <div
                  className="pointer-events-auto fixed left-1/2 top-[clamp(5rem,12dvh,8rem)] -translate-x-1/2 animate-in fade-in-0 zoom-in-95"
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <AdvancedEntityChooserPanel
                    query={query}
                    onQueryChange={handleQueryChange}
                    activeControlValue={activeControlValue}
                    onControlChange={(control) => onControlChange?.(control, query)}
                    selectedValue={value ?? null}
                    onSelect={handleSelect}
                    options={options}
                    loading={loading}
                    meta={viewportAwareMeta}
                    optionActionLabel={optionActionLabel}
                    instantSearch={instantSearch}
                    onInstantSearchToggle={handleInstantSearchToggle}
                    loadedCount={loadedCount}
                    totalCount={totalCount}
                    resultLabel={resultLabel}
                    onLoadMore={onLoadMore}
                    loadMoreLoading={loadMoreLoading}
                    treeEnabled={treeEnabled}
                    onTreeEnabledChange={onTreeEnabledChange}
                    emptyMessage={query || activeControlValue ? "No matches" : "Type to search"}
                    expanded={expanded}
                    onExpandedChange={handleExpandedChange}
                  />
                </div>
              </div>
            ) : (
              <Popover.Content
                className="z-popover max-h-[var(--radix-popover-content-available-height)] overflow-visible animate-in fade-in-0 zoom-in-95"
                align="start"
                side="bottom"
                sideOffset={6}
                collisionPadding={16}
                avoidCollisions
                sticky="partial"
                onOpenAutoFocus={(event) => event.preventDefault()}
              >
                {/* Separate wrapper so our drag transform doesn't conflict with Radix's positioning transform */}
                <div
                  style={
                    dragOffset.x !== 0 || dragOffset.y !== 0
                      ? { transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }
                      : undefined
                  }
                >
                  <AdvancedEntityChooserPanel
                    query={query}
                    onQueryChange={handleQueryChange}
                    activeControlValue={activeControlValue}
                    onControlChange={(control) => onControlChange?.(control, query)}
                    selectedValue={value ?? null}
                    onSelect={handleSelect}
                    options={options}
                    loading={loading}
                    meta={viewportAwareMeta}
                    optionActionLabel={optionActionLabel}
                    instantSearch={instantSearch}
                    onInstantSearchToggle={handleInstantSearchToggle}
                    loadedCount={loadedCount}
                    totalCount={totalCount}
                    resultLabel={resultLabel}
                    onLoadMore={onLoadMore}
                    loadMoreLoading={loadMoreLoading}
                    treeEnabled={treeEnabled}
                    onTreeEnabledChange={onTreeEnabledChange}
                    emptyMessage={query || activeControlValue ? "No matches" : "Type to search"}
                    draggable
                    onDragHandleMouseDown={handleDragStart}
                    expanded={expanded}
                    onExpandedChange={handleExpandedChange}
                    resizable
                    onResizeHandleMouseDown={handleResizeStart}
                  />
                </div>
              </Popover.Content>
            )}
          </Popover.Portal>
        </Popover.Root>

        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

AdvancedEntityCombobox.displayName = "AdvancedEntityCombobox";

