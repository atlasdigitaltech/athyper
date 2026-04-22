"use client";

/**
 * LookupSelect — Combobox backed by an async or synchronous option loader.
 *
 * Data-agnostic: accepts a `loadOptions` callback so it works with any source
 * (lookup domain, reference table, static enum, etc.).
 *
 * Consumers wire in the data:
 *   <LookupSelect
 *     loadOptions={(q) => lookupValues.filter(v => v.label.includes(q))}
 *   />
 *
 * Extracted from F1/field-renderers/LookupTypeahead.tsx — rebuilt as standalone.
 * Sprint 4: FieldRenderer wraps this with useLookupDomain() from @athyper/query.
 */

import { Check, ChevronDown, Loader2, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import * as Popover from "@radix-ui/react-popover";

import { cn } from "@athyper/theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  onChange?: (value: string | null) => void;
  /**
   * Synchronous: `LookupOption[]`
   * Async: `(query: string) => Promise<LookupOption[]>`
   */
  loadOptions: LookupOption[] | ((query: string) => Promise<LookupOption[]>);
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  error?: string;
  className?: string;
  id?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const LookupSelect = forwardRef<HTMLButtonElement, LookupSelectProps>(
  (
    {
      value,
      onChange,
      loadOptions,
      placeholder = "Select…",
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
    const [options, setOptions] = useState<LookupOption[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const searchRef = useRef<HTMLInputElement>(null);

    // Load options when dropdown opens or query changes
    useEffect(() => {
      if (!open) return;

      if (Array.isArray(loadOptions)) {
        const q = query.toLowerCase();
        setOptions(
          q
            ? loadOptions.filter(
                (o) =>
                  o.label.toLowerCase().includes(q) ||
                  o.value.toLowerCase().includes(q),
              )
            : loadOptions,
        );
        return;
      }

      // Async loader with debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);

      debounceRef.current = setTimeout(async () => {
        try {
          const results = await loadOptions(query);
          setOptions(results);
        } catch (err) {
          console.error("[LookupSelect] loadOptions failed:", err);
          setOptions([]);
        } finally {
          setLoading(false);
        }
      }, 250);

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [open, query, loadOptions]);

    const selectedOption = Array.isArray(loadOptions)
      ? loadOptions.find((o) => o.value === value)
      : options.find((o) => o.value === value);

    const handleSelect = useCallback(
      (option: LookupOption) => {
        onChange?.(option.value);
        setOpen(false);
        setQuery("");
      },
      [onChange],
    );

    const handleClear = useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange?.(null);
      },
      [onChange],
    );

    return (
      <div className={className}>
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              ref={ref}
              id={id}
              type="button"
              disabled={disabled}
              aria-expanded={open}
              aria-invalid={!!error}
              className={cn(
                "flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1",
                "text-left text-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                error && "border-destructive ring-1 ring-destructive",
              )}
            >
              <span className={cn(!selectedOption && "text-muted-foreground")}>
                {selectedOption?.label ?? placeholder}
              </span>
              <div className="flex items-center gap-1">
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
                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
              </div>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="z-50 w-[var(--radix-popover-trigger-width)] rounded-md border bg-popover shadow-md animate-in fade-in-0 zoom-in-95"
              align="start"
              sideOffset={4}
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                searchRef.current?.focus();
              }}
            >
              {/* Search */}
              <div className="border-b p-1">
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>

              {/* Options */}
              <div className="max-h-60 overflow-y-auto p-1">
                {loading ? (
                  <div className="flex items-center justify-center py-4 text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
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
                      disabled={option.disabled}
                      onClick={() => !option.disabled && handleSelect(option)}
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
                      />
                      <span className="flex-1">{option.label}</span>
                      {option.description && (
                        <span className="text-xs text-muted-foreground">
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
          <p className="mt-1 text-xs text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

LookupSelect.displayName = "LookupSelect";
