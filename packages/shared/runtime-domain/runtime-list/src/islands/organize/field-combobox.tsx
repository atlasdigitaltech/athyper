"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@athyper/ui";
import type { RuntimeField } from "../../core/types";
import {
  ORGANIZE_ICON_BUTTON_CLASS,
  ORGANIZE_INPUT_CLASS,
  ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS,
} from "./palette-styles";

interface FieldComboboxProps {
  fields:            RuntimeField[];
  value:             string | null;
  placeholder:       string;
  ariaLabel:         string;
  searchPlaceholder: string;
  noResultsMessage:  string;
  onChange:          (fieldName: string) => void;
}

export function FieldCombobox({
  fields,
  value,
  placeholder,
  ariaLabel,
  searchPlaceholder,
  noResultsMessage,
  onChange,
}: FieldComboboxProps) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedField = fields.find((field) => field.name === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredFields = normalizedQuery
    ? fields.filter((field) => (
      field.label.toLowerCase().includes(normalizedQuery) ||
      field.name.toLowerCase().includes(normalizedQuery)
    ))
    : fields;

  useEffect(() => {
    if (!open) return;
    setQuery("");
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={`${ORGANIZE_INPUT_CLASS} flex min-w-0 items-center gap-2 text-left transition-colors hover:bg-muted/50`}
        >
          <span className={selectedField ? "min-w-0 flex-1 truncate" : "min-w-0 flex-1 truncate text-muted-foreground"}>
            {selectedField?.label ?? placeholder}
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={4}
        aria-label={ariaLabel}
        className="w-[min(24rem,calc(100vw-2rem))] p-2 text-foreground"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
          <label className="relative block">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={searchPlaceholder}
              className={ORGANIZE_SEARCH_INPUT_WITH_CLEAR_CLASS}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear field search"
                onClick={() => setQuery("")}
                className={`absolute right-1 top-1/2 -translate-y-1/2 ${ORGANIZE_ICON_BUTTON_CLASS}`}
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            )}
          </label>

          <div role="listbox" className="mt-2 max-h-56 overflow-auto rounded-md border bg-background p-1">
            {filteredFields.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {noResultsMessage}
              </div>
            ) : (
              filteredFields.map((field) => {
                const selected = field.name === value;
                return (
                  <button
                    key={field.name}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onChange(field.name);
                      setOpen(false);
                    }}
                    className={`flex min-h-10 w-full items-center rounded px-3 text-left text-sm transition-colors ${
                      selected
                        ? "bg-foreground text-background"
                        : "text-foreground hover:bg-muted"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{field.label}</span>
                  </button>
                );
              })
            )}
          </div>
      </PopoverContent>
    </Popover>
  );
}
