"use client";

import { Check, ChevronDown, Loader2, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import * as Popover from "@radix-ui/react-popover";

import { cn } from "@athyper/platform-theme/utils";

/**
 * Data-agnostic lookup picker for static arrays or debounced async loaders.
 *
 * Async calls are sequenced so a slower response cannot replace a newer query.
 * Pass displayLabel when the selected value is not guaranteed to be present in
 * the currently loaded option page.
 */

export interface LookupOption {
  value: string;
  label: string;
  description?: string;
  /** Optional color token for badge styling. */
  color?: string;
  disabled?: boolean;
}

export interface LookupSelectProps {
  value?: string | null;
  /** Resolved label for async values that are not in the current option page. */
  displayLabel?: string | null;
  onChange?: (value: string | null) => void;
  /**
   * Synchronous arrays are filtered locally. Async loaders receive the current
   * query and are debounced by this component.
   */
  loadOptions: LookupOption[] | ((query: string) => Promise<LookupOption[]>);
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
  id?: string;
  onLoadError?: (error: unknown) => void;
}

export const LookupSelect = forwardRef<HTMLDivElement, LookupSelectProps>(
  (
    {
      value,
      displayLabel,
      onChange,
      loadOptions,
      placeholder = "Select...",
      disabled,
      clearable = true,
      error,
      className,
      id: externalId,
      onLoadError,
    },
    ref,
  ) => {
    const generatedId = useId();
    const id = externalId ?? generatedId;
    const listId = `${id}-listbox`;
    const errorId = error ? `${id}-error` : undefined;

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [options, setOptions] = useState<LookupOption[]>([]);
    const [loading, setLoading] = useState(false);
    const requestSeq = useRef(0);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!open) {
        setLoading(false);
        return undefined;
      }

      if (Array.isArray(loadOptions)) {
        const normalizedQuery = query.trim().toLowerCase();
        setOptions(
          normalizedQuery
            ? loadOptions.filter((option) => {
                const label = option.label.toLowerCase();
                const optionValue = option.value.toLowerCase();
                return label.includes(normalizedQuery) || optionValue.includes(normalizedQuery);
              })
            : loadOptions,
        );
        setLoading(false);
        return undefined;
      }

      const requestId = ++requestSeq.current;
      setLoading(true);

      const debounceTimer = setTimeout(async () => {
        try {
          const results = await loadOptions(query);
          if (requestId === requestSeq.current) {
            setOptions(results);
          }
        } catch (err) {
          if (requestId === requestSeq.current) {
            onLoadError?.(err);
            setOptions([]);
          }
        } finally {
          if (requestId === requestSeq.current) {
            setLoading(false);
          }
        }
      }, 250);

      return () => {
        clearTimeout(debounceTimer);
        requestSeq.current += 1;
      };
    }, [open, query, loadOptions, onLoadError]);

    const selectedOption = Array.isArray(loadOptions)
      ? loadOptions.find((option) => option.value === value)
      : options.find((option) => option.value === value);
    const currentLabel = selectedOption?.label ?? displayLabel ?? value ?? null;

    const handleOpenChange = useCallback((next: boolean) => {
      if (disabled && next) return;
      setOpen(next);
      if (!next) setQuery("");
    }, [disabled]);

    const handleSelect = useCallback(
      (option: LookupOption) => {
        if (option.disabled) return;
        onChange?.(option.value);
        handleOpenChange(false);
      },
      [handleOpenChange, onChange],
    );

    const stopClearPointer = useCallback((event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    }, []);

    const handleClear = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onChange?.(null);
      },
      [onChange],
    );

    const handleTriggerKeyDown = useCallback(
      (event: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenChange(!open);
        }
      },
      [disabled, handleOpenChange, open],
    );

    return (
      <div className={className}>
        <Popover.Root open={open} onOpenChange={handleOpenChange}>
          <Popover.Trigger asChild>
            <div
              ref={ref}
              id={id}
              role="combobox"
              tabIndex={disabled ? -1 : 0}
              aria-controls={open ? listId : undefined}
              aria-describedby={errorId}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-invalid={!!error}
              aria-disabled={disabled}
              aria-busy={loading || undefined}
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
              onKeyDown={handleTriggerKeyDown}
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
                    onPointerDown={stopClearPointer}
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
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                searchRef.current?.focus();
              }}
            >
              <div className="border-b p-1">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search..."
                  className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              <div id={listId} role="listbox" className="max-h-60 overflow-y-auto p-1">
                {loading ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  </div>
                ) : options.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {query ? "No results" : "No options"}
                  </p>
                ) : (
                  options.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={value === option.value}
                      disabled={option.disabled}
                      onClick={() => handleSelect(option)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
                        "hover:bg-accent hover:text-accent-foreground",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        value === option.value && "bg-accent/50",
                      )}
                    >
                      <Check
                        className={cn(
                          "size-3.5 shrink-0 text-primary",
                          value === option.value ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.description && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>

        {error && (
          <p id={errorId} className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

LookupSelect.displayName = "LookupSelect";

