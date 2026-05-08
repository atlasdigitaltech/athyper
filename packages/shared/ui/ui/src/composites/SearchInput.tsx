"use client";

/**
 * SearchInput — debounced text input with clear button and optional shortcut hint.
 *
 * When `modeToggle` is provided the input and toggle are merged into a single
 * rounded container separated by a thin divider — one shell, two segments.
 * The default active segment is quiet/light for local "in view" search;
 * callers can use the inactive segment for a stronger server-search mode.
 */

import { Search, X, Loader2 } from "lucide-react";
import {
  forwardRef,
  useRef,
  useState,
  useCallback,
  useEffect,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

import { cn } from "@athyper/theme/utils";

export interface SearchInputModeToggle {
  active:         boolean;
  onToggle:       () => void;
  /** Label shown when active   (default: "In view") */
  activeLabel?:   string;
  /** Label shown when inactive (default: "All") */
  inactiveLabel?: string;
  icon?:          ReactNode;
  title?:         string;
  /** Keep the label visible, or reveal it only on hover. */
  labelMode?:     "hover" | "always";
  activeClassName?: string;
  inactiveClassName?: string;
}

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
  /**
   * When provided, merges a mode-toggle segment into a unified container.
   * The toggle replaces the stand-alone button beside the search bar.
   */
  modeToggle?: SearchInputModeToggle;
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
      modeToggle,
      className,
      placeholder = "Search…",
      ...rest
    },
    ref,
  ) => {
    const [internalValue, setInternalValue] = useState(controlledValue ?? "");
    const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

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

    useEffect(
      () => () => { if (timerRef.current) clearTimeout(timerRef.current); },
      [],
    );

    const showClear = internalValue.length > 0 && !loading;

    // ── Unified container: input segment + divider + mode-toggle segment ────────
    if (modeToggle) {
      const {
        active,
        onToggle,
        activeLabel   = "In view",
        inactiveLabel = "All",
        icon,
        title,
        labelMode = "hover",
        activeClassName,
        inactiveClassName,
      } = modeToggle;
      const labelClassName = labelMode === "always"
        ? "max-w-[64px] opacity-100"
        : "max-w-0 opacity-0 group-hover:max-w-[64px] group-hover:opacity-100";

      return (
        <div
          className={cn(
            "flex h-8 items-center overflow-hidden rounded-md border border-input bg-background",
            className,
          )}
        >
          {/* Input segment */}
          <div className="relative flex h-full min-w-0 flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 size-4 shrink-0 text-muted-foreground" />
            <input
              ref={ref}
              type="text"
              value={internalValue}
              onChange={handleChange}
              placeholder={placeholder}
              className="h-full w-full bg-transparent pl-9 pr-8 text-xs font-medium text-foreground placeholder:font-normal placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              {...rest}
            />
            <div className="absolute right-2.5 flex items-center gap-1">
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
            </div>
          </div>

          {/* Thin internal divider */}
          <span className="w-px shrink-0 self-stretch bg-input" aria-hidden />

          {/* Mode-toggle segment — icon only; label reveals on hover */}
          <button
            type="button"
            onClick={onToggle}
            title={title}
            className={cn(
              "group flex h-full shrink-0 items-center justify-center gap-1 px-2.5 text-xs font-medium transition-colors",
              active
                ? activeClassName ?? "bg-muted text-foreground hover:bg-muted/80"
                : inactiveClassName ?? "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {icon}
            <span className={cn("overflow-hidden whitespace-nowrap transition-all duration-200", labelClassName)}>
              {active ? activeLabel : inactiveLabel}
            </span>
          </button>
        </div>
      );
    }

    // ── Standalone (no mode toggle) — original layout unchanged ────────────────
    return (
      <div className={cn("relative flex items-center", className)}>
        <Search className="pointer-events-none absolute left-3 size-4 shrink-0 text-muted-foreground" />
        <input
          ref={ref}
          type="text"
          value={internalValue}
          onChange={handleChange}
          placeholder={placeholder}
          className={cn(
            "h-8 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
          {...rest}
        />
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
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
              {shortcutHint}
            </kbd>
          )}
        </div>
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";
