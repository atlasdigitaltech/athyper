"use client";

import { icons as lucideIcons, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Curated Icon Catalog ────────────────────────────────────
// ~70 icons grouped by business domain. Each entry maps a
// kebab-case key (stored in DB) to its Lucide PascalCase name.

interface IconEntry {
  key: string;
  label: string;
  group: string;
}

const ICON_CATALOG: IconEntry[] = [
  // Finance & Accounting
  { key: "landmark", label: "Landmark", group: "Finance" },
  { key: "banknote", label: "Banknote", group: "Finance" },
  { key: "receipt", label: "Receipt", group: "Finance" },
  { key: "receipt-text", label: "Receipt Text", group: "Finance" },
  { key: "wallet", label: "Wallet", group: "Finance" },
  { key: "credit-card", label: "Credit Card", group: "Finance" },
  { key: "piggy-bank", label: "Piggy Bank", group: "Finance" },
  { key: "coins", label: "Coins", group: "Finance" },
  { key: "circle-dollar-sign", label: "Dollar Sign", group: "Finance" },
  { key: "calculator", label: "Calculator", group: "Finance" },
  { key: "trending-up", label: "Trending Up", group: "Finance" },
  { key: "trending-down", label: "Trending Down", group: "Finance" },
  { key: "chart-column-increasing", label: "Chart", group: "Finance" },

  // Documents & Files
  { key: "file-text", label: "File Text", group: "Documents" },
  { key: "file-check", label: "File Check", group: "Documents" },
  { key: "file-pen", label: "File Pen", group: "Documents" },
  { key: "file-spreadsheet", label: "File Spreadsheet", group: "Documents" },
  { key: "files", label: "Files", group: "Documents" },
  { key: "folder", label: "Folder", group: "Documents" },
  { key: "folder-open", label: "Folder Open", group: "Documents" },
  { key: "clipboard-list", label: "Clipboard List", group: "Documents" },
  { key: "notebook", label: "Notebook", group: "Documents" },
  { key: "book-open", label: "Book Open", group: "Documents" },
  { key: "scroll-text", label: "Scroll Text", group: "Documents" },

  // People & Organizations
  { key: "user", label: "User", group: "People" },
  { key: "users", label: "Users", group: "People" },
  { key: "user-check", label: "User Check", group: "People" },
  { key: "contact", label: "Contact", group: "People" },
  { key: "building-2", label: "Building", group: "People" },
  { key: "briefcase", label: "Briefcase", group: "People" },
  { key: "hard-hat", label: "Hard Hat", group: "People" },
  { key: "badge-check", label: "Badge Check", group: "People" },

  // Inventory & Logistics
  { key: "package", label: "Package", group: "Inventory" },
  { key: "package-check", label: "Package Check", group: "Inventory" },
  { key: "boxes", label: "Boxes", group: "Inventory" },
  { key: "warehouse", label: "Warehouse", group: "Inventory" },
  { key: "truck", label: "Truck", group: "Inventory" },
  { key: "container", label: "Container", group: "Inventory" },
  { key: "scan-barcode", label: "Barcode", group: "Inventory" },
  { key: "weight", label: "Weight", group: "Inventory" },
  { key: "ruler", label: "Ruler", group: "Inventory" },

  // Commerce
  { key: "shopping-cart", label: "Shopping Cart", group: "Commerce" },
  { key: "shopping-bag", label: "Shopping Bag", group: "Commerce" },
  { key: "store", label: "Store", group: "Commerce" },
  { key: "tag", label: "Tag", group: "Commerce" },
  { key: "tags", label: "Tags", group: "Commerce" },
  { key: "percent", label: "Percent", group: "Commerce" },
  { key: "gift", label: "Gift", group: "Commerce" },

  // Manufacturing & Assets
  { key: "factory", label: "Factory", group: "Manufacturing" },
  { key: "cog", label: "Cog", group: "Manufacturing" },
  { key: "wrench", label: "Wrench", group: "Manufacturing" },
  { key: "hammer", label: "Hammer", group: "Manufacturing" },
  { key: "cpu", label: "CPU", group: "Manufacturing" },
  { key: "server", label: "Server", group: "Manufacturing" },

  // Status & Workflow
  { key: "circle-check", label: "Circle Check", group: "Workflow" },
  { key: "circle-x", label: "Circle X", group: "Workflow" },
  { key: "clock", label: "Clock", group: "Workflow" },
  { key: "calendar", label: "Calendar", group: "Workflow" },
  { key: "calendar-check", label: "Calendar Check", group: "Workflow" },
  { key: "flag", label: "Flag", group: "Workflow" },
  { key: "bell", label: "Bell", group: "Workflow" },
  { key: "send", label: "Send", group: "Workflow" },
  { key: "archive", label: "Archive", group: "Workflow" },

  // Settings & Config
  { key: "settings", label: "Settings", group: "System" },
  { key: "sliders-horizontal", label: "Sliders", group: "System" },
  { key: "shield", label: "Shield", group: "System" },
  { key: "lock", label: "Lock", group: "System" },
  { key: "key", label: "Key", group: "System" },
  { key: "database", label: "Database", group: "System" },
  { key: "globe", label: "Globe", group: "System" },
  { key: "layers", label: "Layers", group: "System" },
  { key: "layout-grid", label: "Layout Grid", group: "System" },
  { key: "puzzle", label: "Puzzle", group: "System" },
];

/**
 * Convert a kebab-case icon key (e.g. "file-text") to the PascalCase
 * name used by lucide-react's `icons` map (e.g. "FileText").
 */
function kebabToPascal(key: string): string {
  return key
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

/** Resolve a kebab-case key to the corresponding Lucide icon component. */
export function resolveIcon(key: string): LucideIcon | null {
  const pascal = kebabToPascal(key);
  return (lucideIcons as Record<string, LucideIcon>)[pascal] ?? null;
}

// ─── Component ───────────────────────────────────────────────

interface IconPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function IconPicker({ value, onChange, className }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const SelectedIcon = value ? resolveIcon(value) : null;

  const grouped = useMemo(() => {
    const map = new Map<string, IconEntry[]>();
    for (const entry of ICON_CATALOG) {
      const existing = map.get(entry.group);
      if (existing) existing.push(entry);
      else map.set(entry.group, [entry]);
    }
    return map;
  }, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={`h-8 w-full justify-start gap-2 font-mono text-sm ${className ?? ""}`}
        >
          {SelectedIcon ? (
            <>
              <SelectedIcon className="size-4 shrink-0" />
              <span className="truncate">{value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select icon...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search icons..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>No icons found.</CommandEmpty>
            <ScrollArea className="h-64">
              {[...grouped.entries()].map(([group, entries]) => {
                const filtered = search
                  ? entries.filter(
                      (e) =>
                        e.key.includes(search.toLowerCase()) ||
                        e.label.toLowerCase().includes(search.toLowerCase()),
                    )
                  : entries;
                if (filtered.length === 0) return null;

                return (
                  <CommandGroup key={group} heading={group}>
                    {filtered.map((entry) => {
                      const Icon = resolveIcon(entry.key);
                      if (!Icon) return null;
                      return (
                        <CommandItem
                          key={entry.key}
                          value={entry.key}
                          onSelect={() => {
                            onChange(entry.key);
                            setOpen(false);
                            setSearch("");
                          }}
                        >
                          <Icon className="mr-2 size-4 shrink-0" />
                          <span className="flex-1 truncate">{entry.label}</span>
                          {value === entry.key && (
                            <span className="ml-auto text-xs text-primary">
                              ✓
                            </span>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })}
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
