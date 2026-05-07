"use client";

import { forwardRef, useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  AdvancedEntityChooserPanel,
  type AdvancedEntityChooserControl,
  type AdvancedEntityChooserMetaConfig,
  type AdvancedEntityChooserOption,
} from "./AdvancedEntityChooser";

function viewportAwareListHeight(maxListHeight: AdvancedEntityChooserMetaConfig["maxListHeight"]): string {
  const availableHeight = "max(128px, calc(var(--radix-popover-content-available-height) - 104px))";
  if (typeof maxListHeight === "number") return `min(${maxListHeight}px, ${availableHeight})`;
  if (typeof maxListHeight === "string" && maxListHeight.trim()) {
    return `min(${maxListHeight.trim()}, ${availableHeight})`;
  }
  return availableHeight;
}

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
  activeControlValue?: string | null;
  onControlChange?: (control: AdvancedEntityChooserControl, query: string) => void;
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
      activeControlValue,
      onControlChange,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [instantSearch, setInstantSearch] = useState(false);
    const triggerRef = useRef<HTMLDivElement | null>(null);
    const viewportAwareMeta = useMemo<AdvancedEntityChooserMetaConfig>(
      () => ({
        ...meta,
        maxListHeight: viewportAwareListHeight(meta?.maxListHeight),
      }),
      [meta],
    );

    const handleOpenChange = (next: boolean) => {
      setOpen(next);
      if (next) {
        onOpen?.();
      } else {
        setQuery("");
        onQueryChange?.("");
      }
    };

    const handleQueryChange = (next: string) => {
      setQuery(next);
      if (!instantSearch) onQueryChange?.(next);
    };

    const handleInstantSearchToggle = () => {
      setInstantSearch((current) => {
        const next = !current;
        if (!next) onQueryChange?.(query);
        return next;
      });
    };

    const handleSelect = (option: AdvancedEntityChooserOption) => {
      onChange?.(option.value);
      setOpen(false);
      setQuery("");
      onQueryChange?.("");
    };

    const handleClear = (event: React.MouseEvent) => {
      event.stopPropagation();
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
              onKeyDown={(event) => {
                if (disabled) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setOpen((next) => !next);
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

          <Popover.Portal>
            <Popover.Content
              className="z-50 max-h-[var(--radix-popover-content-available-height)] overflow-visible animate-in fade-in-0 zoom-in-95"
              align="start"
              side="bottom"
              sideOffset={6}
              collisionPadding={16}
              avoidCollisions
              sticky="partial"
              onOpenAutoFocus={(event) => event.preventDefault()}
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
                emptyMessage={query || activeControlValue ? "No matches" : "Type to search"}
              />
            </Popover.Content>
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
