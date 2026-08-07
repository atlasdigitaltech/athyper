"use client";

/**
 * AsyncCombobox — Layer-1 controlled combobox atom.
 *
 * All fetch, debounce, and abort logic lives OUTSIDE this component.
 * The caller owns options/loading state and calls onQueryChange to
 * trigger a new fetch. This makes the component independently testable
 * and lets Layer-2 wrappers (EntityPicker) inject their own data strategy.
 *
 * If you need an entity-aware picker with built-in fetch, use
 * EntityPicker from @athyper/runtime-shared (Phase 2).
 */

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, ExternalLink, Loader2, X } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  code?: string;
  description?: string;
}

export interface AsyncComboboxProps {
  value?: string | null;
  /** Resolved display label for the current value. */
  displayLabel?: string | null;
  onChange?: (value: string | null) => void;
  /** Options array — caller fetches and provides these. */
  options: ComboboxOption[];
  /** Caller sets true while fetching. */
  loading?: boolean;
  /** Called when query changes so caller can trigger a new fetch. */
  onQueryChange?: (query: string) => void;
  /** Called when the popover opens — use for loadOnOpen pre-fetch patterns. */
  onOpen?: () => void;
  /** Optional per-row action link, for example opening a referenced entity record. */
  getOptionHref?: (option: ComboboxOption) => string | null | undefined;
  optionActionLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

export const AsyncCombobox = forwardRef<HTMLDivElement, AsyncComboboxProps>(
  (
    {
      value,
      displayLabel,
      onChange,
      options,
      loading = false,
      onQueryChange,
      onOpen,
      getOptionHref,
      optionActionLabel = "View record",
      placeholder = "Select…",
      searchPlaceholder = "Type to search…",
      disabled,
      clearable = true,
      error,
      className,
      id: externalId,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!disabled || !open) return;
      setOpen(false);
      setQuery("");
      onQueryChange?.("");
    }, [disabled, onQueryChange, open]);

    const handleOpenChange = (next: boolean) => {
      if (disabled && next) return;
      setOpen(next);
      if (next) {
        onOpen?.();
      } else {
        setQuery("");
        onQueryChange?.("");
      }
    };

    const handleQueryChange = (q: string) => {
      if (disabled) return;
      setQuery(q);
      onQueryChange?.(q);
    };

    const handleSelect = (option: ComboboxOption) => {
      if (disabled) return;
      onChange?.(option.value);
      handleOpenChange(false);
    };

    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      onChange?.(null);
    };

    const currentLabel = displayLabel ?? value ?? null;

    return (
      <div className={className}>
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            <div
              ref={ref}
              id={id}
              role="combobox"
              tabIndex={disabled ? -1 : 0}
              aria-expanded={open}
              aria-invalid={!!error}
              aria-disabled={disabled}
              onPointerDown={(e) => {
                if (!disabled) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                if (!disabled) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
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
              <span
                className={cn("min-w-0 truncate", !currentLabel && "text-muted-foreground")}
              >
                {currentLabel ?? placeholder}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {clearable && value && !disabled && (
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={handleClear}
                    className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="z-popover w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
              align="start"
              sideOffset={4}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                searchRef.current?.focus();
              }}
            >
              <div className="border-b p-1">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div className="max-h-60 overflow-y-auto p-1">
                {loading ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                ) : options.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {query.length > 0 ? "No results found" : "Type to search"}
                  </p>
                ) : (
                  options.map((option) => {
                    const optionHref = getOptionHref?.(option);
                    const hasMeta = !!(option.code || option.description);

                    return (
                      <div
                        key={option.value}
                        className={cn(
                          "group flex w-full items-stretch rounded-sm hover:bg-accent hover:text-accent-foreground",
                          value === option.value && "bg-accent/50",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelect(option)}
                          className="min-w-0 flex-1 px-2 py-1.5 text-left"
                        >
                          <span className="block truncate text-sm">{option.label}</span>
                          {hasMeta && (
                            <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                              {option.code && (
                                <span className="shrink-0 tabular-nums">{option.code}</span>
                              )}
                              {option.description && (
                                <span className="min-w-0 truncate">{option.description}</span>
                              )}
                            </span>
                          )}
                        </button>
                        {optionHref && (
                          <a
                            href={optionHref}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title={optionActionLabel}
                            aria-label={`${optionActionLabel}: ${option.label}`}
                            className="flex w-8 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-70 transition hover:bg-background/70 hover:text-foreground hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
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

AsyncCombobox.displayName = "AsyncCombobox";
