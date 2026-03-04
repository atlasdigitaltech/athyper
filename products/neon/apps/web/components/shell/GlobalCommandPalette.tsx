"use client";

// components/shell/GlobalCommandPalette.tsx
//
// Global command palette (Ctrl+K / Cmd+K).
// Lazy-loads all entity capabilities on first open, then caches.
// Groups commands by entity, searches across label, aliases, tcode.
// Dispatches based on handlerType (NAVIGATE → router.push, etc.).

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EntityCapabilities,
  EntityOperationDescriptor,
} from "@/lib/entity-capabilities";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { useAllEntityCapabilities } from "@/lib/use-all-entity-capabilities";

// ============================================================================
// Component
// ============================================================================

export function GlobalCommandPalette() {
  const [open, setOpen] = useState(false);
  const { all, loading, load } = useAllEntityCapabilities();
  const router = useRouter();

  // Ctrl+K / Cmd+K to toggle
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Lazy-load capabilities on first open
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  // Group operations by entity name for CommandGroup headings
  const grouped = useMemo(() => {
    const groups: Array<{
      entityName: string;
      items: Array<{
        entity: EntityCapabilities;
        op: EntityOperationDescriptor;
      }>;
    }> = [];

    for (const entity of all) {
      if (entity.operations.length === 0) continue;
      groups.push({
        entityName: entity.entityName,
        items: entity.operations.map((op) => ({ entity, op })),
      });
    }

    return groups;
  }, [all]);

  // Build searchable value for cmdk filtering.
  // cmdk matches the CommandItem `value` prop against the input.
  const buildSearchValue = useCallback(
    (op: EntityOperationDescriptor): string => {
      return [op.label, op.canonicalCode, op.tcode, ...op.aliases]
        .filter(Boolean)
        .join(" ");
    },
    [],
  );

  const handleSelect = useCallback(
    (entity: EntityCapabilities, op: EntityOperationDescriptor) => {
      setOpen(false);

      if (op.handlerType === "NAVIGATE" && op.route) {
        router.push(op.route);
        return;
      }

      // For operations that need a record, navigate to list page
      if (op.requiresRecord) {
        router.push(entity.routes.list);
        return;
      }

      // For create-type NAVIGATE ops without explicit route, use entity create route
      if (op.handlerType === "NAVIGATE" && op.code === "create") {
        router.push(entity.routes.create);
        return;
      }

      // Default: navigate to entity list
      router.push(entity.routes.list);
    },
    [router],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command Palette"
      description="Search commands across all entities"
    >
      <CommandInput placeholder="Type a command... (e.g. NEW PO, APPROVE INV)" />
      <CommandList>
        <CommandEmpty>
          {loading ? "Loading capabilities..." : "No commands found."}
        </CommandEmpty>
        {grouped.map((group) => (
          <CommandGroup key={group.entityName} heading={group.entityName}>
            {group.items.map(({ entity, op }) => (
              <CommandItem
                key={op.canonicalCode}
                value={buildSearchValue(op)}
                onSelect={() => handleSelect(entity, op)}
              >
                <span className="flex-1 truncate">{op.label}</span>
                {op.aliases.length > 0 && (
                  <CommandShortcut>{op.aliases[0]}</CommandShortcut>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
