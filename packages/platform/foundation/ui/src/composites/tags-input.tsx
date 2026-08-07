"use client";

/**
 * TagsInput — free-form tag chips with optional suggestions.
 *
 * Features:
 *   - Enter / comma / Tab to confirm a tag
 *   - Backspace to remove last tag when input is empty
 *   - Optional suggestions dropdown (pass `suggestions` prop)
 *   - Duplicate detection
 */

import { X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "@athyper/platform-theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TagsInputProps {
  value?: string[];
  onChange?: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  maxTags?: number;
  error?: string;
  className?: string;
  id?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export const TagsInput = forwardRef<HTMLInputElement, TagsInputProps>(
  (
    {
      value = [],
      onChange,
      suggestions = [],
      placeholder = "Add tag…",
      disabled,
      maxTags,
      error,
      className,
      id,
    },
    ref,
  ) => {
    const [inputValue, setInputValue] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const normalizedTags = useMemo(
      () => value.map((tag) => tag.trim().toLowerCase()),
      [value],
    );

    const addTag = useCallback(
      (tag: string) => {
        const trimmed = tag.trim().toLowerCase();
        if (!trimmed) return;
        if (normalizedTags.includes(trimmed)) return;
        if (maxTags !== undefined && value.length >= maxTags) return;
        onChange?.([...value, trimmed]);
        setInputValue("");
        setShowSuggestions(false);
      },
      [maxTags, normalizedTags, onChange, value],
    );

    const removeTag = useCallback(
      (tag: string) => {
        onChange?.(value.filter((t) => t !== tag));
      },
      [value, onChange],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
          if (inputValue.trim()) {
            e.preventDefault();
            addTag(inputValue);
          }
          return;
        }
        if (e.key === "Backspace" && !inputValue && value.length > 0) {
          removeTag(value[value.length - 1]!);
        }
      },
      [inputValue, addTag, removeTag, value],
    );

    const filteredSuggestions = suggestions.filter(
      (s) =>
        !normalizedTags.includes(s.trim().toLowerCase()) &&
        s.toLowerCase().includes(inputValue.toLowerCase()),
    );

    const atMax = maxTags !== undefined && value.length >= maxTags;

    return (
      <div className={cn("relative", className)}>
        {/* Tags container */}
        <div
          className={cn(
            "flex min-h-9 flex-wrap gap-1.5 rounded-md border border-input bg-background px-2 py-1.5",
            "focus-within:ring-2 focus-within:ring-ring",
            disabled && "cursor-not-allowed opacity-50",
            error && "border-destructive ring-1 ring-destructive",
          )}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  className="rounded-full hover:text-foreground focus:outline-none"
                  aria-label={`Remove ${tag}`}
                >
                  <X className="size-2.5" />
                </button>
              )}
            </span>
          ))}

          {!atMax && (
            <input
              ref={(node) => {
                // Handle both ref types
                if (typeof ref === "function") ref(node);
                else if (ref) ref.current = node;
                (inputRef as React.MutableRefObject<HTMLInputElement | null>).current = node;
              }}
              id={id}
              type="text"
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setShowSuggestions(e.target.value.length > 0);
              }}
              onKeyDown={handleKeyDown}
              onBlur={() => {
                // Confirm partial input on blur
                if (inputValue.trim()) addTag(inputValue);
                setShowSuggestions(false);
              }}
              disabled={disabled}
              placeholder={value.length === 0 ? placeholder : ""}
              className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && filteredSuggestions.length > 0 && (
          <div className="absolute z-popover mt-1 max-h-40 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // prevent blur
                  addTag(s);
                }}
                className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-1 text-xs text-destructive" role="alert">{error}</p>
        )}
      </div>
    );
  },
);

TagsInput.displayName = "TagsInput";

