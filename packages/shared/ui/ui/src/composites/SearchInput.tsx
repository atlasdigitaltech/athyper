"use client";

/**
 * SearchInput — debounced text input with clear button and optional shortcut hint.
 * Used in: CommandPalette, FilterPanel, entity list quick-search.
 */

import { Search, X, Loader2 } from "lucide-react";
import {
  forwardRef,
  useRef,
  useState,
  useCallback,
  useEffect,
  type InputHTMLAttributes,
} from "react";

import { cn } from "@athyper/theme";

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  /** Debounce delay in ms (default: 300). */
  debounceMs?: number;
  /** Called with debounced value. */
  onSearch?: (value: string) => void;
  /** Controlled value — use with `onSearch` for controlled mode. */
  value?: string;
  /** Show a loading spinner (e.g. while fetching results). */
  loading?: boolean;
  /** Keyboard shortcut label displayed on the right (e.g. "⌘K"). */
  shortcutHint?: string;
  /** Called when the input is cleared. */
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      debounceMs = 300,
      onSearch,
      value: controlledValue,
      loading = false,
      shortcutHint,
      onClear,
      className,
      placeholder = "Search…",
      ...rest
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = useState(controlledValue ?? "");
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

    // Sync controlled value changes
    useEffect(() => {
      if (controlledValue !== undefined) setInternalValue(controlledValue);
    }, [controlledValue]);

    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setInternalValue(val);

        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => onSearch?.(val), debounceMs);
      },
      [debounceMs, onSearch],
    );

    const handleClear = useCallback(() => {
      setInternalValue("");
      onSearch?.("");
      onClear?.();
    }, [onSearch, onClear]);

    // Cleanup timer on unmount
    useEffect(() => {
      return () => {
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }, []);

    const showClear = internalValue.length > 0 && !loading;

    return (
      <div className={cn("relative flex items-center", className)}>
        {/* Leading icon */}
        <Search className="pointer-events-none absolute left-3 size-4 shrink-0 text-muted-foreground" />

        <input
          ref={ref}
          type="search"
          value={internalValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            "h-9 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...rest}
        />

        {/* Trailing: spinner / clear / shortcut */}
        <div className="absolute right-3 flex items-center gap-1">
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {showClear && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
          {shortcutHint && !loading && !showClear && (
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {shortcutHint}
            </kbd>
          )}
        </div>
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";
