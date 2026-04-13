"use client";

/**
 * EntityRefPicker — search-as-you-type reference picker.
 *
 * Data-agnostic: accepts a `search` callback to keep the composite
 * independent of any API client or query library.
 *
 * Consumers wire in the data:
 *   <EntityRefPicker
 *     search={async (q) => records.filter(r => r.label.includes(q))}
 *   />
 *
 * Sprint 4: FieldRenderer wraps this with useEntityList() search param.
 *
 * Extracted from F1/field-renderers/ReferencePickerRenderer.tsx — rebuilt
 * as a standalone, @neon/ui-free composite.
 */

import { ChevronDown, Loader2, X, ExternalLink } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import * as Popover from "@radix-ui/react-popover";

import { cn } from "@athyper/theme";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EntityRefOption {
  /** The foreign key value (UUID or code). */
  value: string;
  /** Human-readable display label. */
  label: string;
  /** Optional secondary description (entity type, code, etc.) */
  description?: string;
}

export interface EntityRefPickerProps {
  value?: string | null;
  /** Display label for the current value (resolved externally). */
  displayLabel?: string | null;
  onChange?: (value: string | null) => void;
  /**
   * Async search function. Called with query string (min 1 char).
   * Returns matching options.
   */
  search: (query: string) => Promise<EntityRefOption[]>;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  /** Show a navigate-to-record link icon. */
  navigateHref?: string;
  error?: string;
  className?: string;
  id?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const EntityRefPicker = forwardRef<HTMLButtonElement, EntityRefPickerProps>(
  (
    {
      value,
      displayLabel,
      onChange,
      search,
      placeholder = "Search records…",
      disabled,
      clearable = true,
      navigateHref,
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
    const [options, setOptions] = useState<EntityRefOption[]>([]);
    const [loading, setLoading] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const abortRef = useRef<AbortController | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
      if (!open) {
        setQuery("");
        setOptions([]);
        return;
      }

      if (query.length < 1) {
        setOptions([]);
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      setLoading(true);

      debounceRef.current = setTimeout(async () => {
        abortRef.current?.abort();
        abortRef.current = new AbortController();

        try {
          const results = await search(query);
          if (!abortRef.current.signal.aborted) {
            setOptions(results);
          }
        } catch {
          if (!abortRef.current?.signal.aborted) setOptions([]);
        } finally {
          if (!abortRef.current?.signal.aborted) setLoading(false);
        }
      }, 300);

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [open, query, search]);

    const handleSelect = useCallback(
      (option: EntityRefOption) => {
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

    const currentLabel = displayLabel ?? value ?? null;

    return (
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
              "flex h-9 w-full items-center justify-between gap-1 rounded-md border border-input bg-background px-3 py-1",
              "text-left text-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              error && "border-destructive ring-1 ring-destructive",
              className,
            )}
          >
            <span
              className={cn(
                "min-w-0 truncate",
                !currentLabel && "text-muted-foreground",
              )}
            >
              {currentLabel ?? placeholder}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              {navigateHref && value && (
                <a
                  href={navigateHref}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  aria-label="Open record"
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              )}
              {clearable && value && !disabled && (
                <span onClick={handleClear} className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground">
                  <X className="size-3.5" />
                </span>
              )}
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
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
            <div className="border-b p-1">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search…"
                className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="max-h-60 overflow-y-auto p-1">
              {loading ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : query.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Type to search records
                </p>
              ) : options.length === 0 && !loading ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No records found
                </p>
              ) : (
                options.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => handleSelect(option)}
                    className={cn(
                      "flex w-full flex-col rounded-sm px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground",
                      value === option.value && "bg-accent/50",
                    )}
                  >
                    <span className="text-sm">{option.label}</span>
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
    );
  },
);

EntityRefPicker.displayName = "EntityRefPicker";
