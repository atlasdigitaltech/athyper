"use client";

import { ChevronsUpDown, Check, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildHeaders } from "@/lib/schema-manager/use-csrf";

// ─── Types ───────────────────────────────────────────────────

type SubjectType = "kc_role" | "kc_group" | "user" | "service";

interface SubjectOption {
  key: string;
  label: string;
  type: string;
}

interface SubjectKeyPickerProps {
  subjectType: SubjectType;
  value: string;
  onChange: (value: string) => void;
}

// ─── Placeholder text by type ────────────────────────────────

const PLACEHOLDERS: Record<SubjectType, string> = {
  kc_role: "Search roles...",
  kc_group: "Search groups...",
  user: "Search users...",
  service: "Search services...",
};

// ─── Component ───────────────────────────────────────────────

export function SubjectKeyPicker({
  subjectType,
  value,
  onChange,
}: SubjectKeyPickerProps) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SubjectOption[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchOptions = useCallback(
    async (query: string) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/mesh/policy-studio/subjects?type=${encodeURIComponent(subjectType)}&q=${encodeURIComponent(query)}`,
          {
            headers: buildHeaders(),
            credentials: "same-origin",
            signal: controller.signal,
          },
        );

        if (!res.ok) {
          setOptions([]);
          return;
        }

        const body = (await res.json()) as { data?: SubjectOption[] };
        setOptions(body.data ?? []);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setOptions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [subjectType],
  );

  // Fetch when popover opens or search changes
  useEffect(() => {
    if (open) {
      fetchOptions(search);
    }
    return () => abortRef.current?.abort();
  }, [open, search, fetchOptions]);

  const handleSelect = useCallback(
    (key: string) => {
      onChange(key);
      setOpen(false);
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">Subject Key</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {value || PLACEHOLDERS[subjectType]}
            <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={PLACEHOLDERS[subjectType]}
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              {loading && (
                <div className="py-3 text-center text-xs text-muted-foreground">
                  <Search className="inline mr-1.5 size-3 animate-pulse" />
                  Searching...
                </div>
              )}
              <CommandEmpty>
                {search.trim() ? (
                  <button
                    className="w-full py-2 text-xs text-center hover:bg-accent cursor-pointer"
                    onClick={() => handleSelect(search.trim())}
                  >
                    Use "{search.trim()}" as custom key
                  </button>
                ) : (
                  "Type to search..."
                )}
              </CommandEmpty>
              {options.map((opt) => (
                <CommandItem
                  key={opt.key}
                  value={opt.key}
                  onSelect={handleSelect}
                  className="text-xs"
                >
                  <Check
                    className={`mr-2 size-3.5 ${value === opt.key ? "opacity-100" : "opacity-0"}`}
                  />
                  <span className="font-mono">{opt.key}</span>
                  {opt.label !== opt.key && (
                    <span className="ml-2 text-muted-foreground">
                      {opt.label}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
