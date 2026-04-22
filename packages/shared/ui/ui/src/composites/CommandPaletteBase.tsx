"use client";

/**
 * CommandPaletteBase — cmdk-based palette primitive.
 *
 * Generic slot-based palette that the shell UniversalLauncher
 * (`apps/web/components/shell/CommandPalette.tsx`) builds on top of.
 *
 * This component owns the Dialog + Command chrome (search input, tab bar,
 * results list). All groups, items, and search logic live in the consumer.
 *
 * Usage:
 *   <CommandPaletteBase
 *     open={open}
 *     onClose={() => setOpen(false)}
 *     activeTab="search"
 *     onTabChange={setTab}
 *   >
 *     <CommandPaletteBase.Group heading="Modules">
 *       <CommandPaletteBase.Item onSelect={...}>
 *         <Icon /> <span>Item label</span>
 *         <CommandPaletteBase.Badge>CODE</CommandPaletteBase.Badge>
 *       </CommandPaletteBase.Item>
 *     </CommandPaletteBase.Group>
 *   </CommandPaletteBase>
 */

import { Command } from "cmdk";
import { Search } from "lucide-react";
import { type ReactNode, useEffect } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import { cn } from "@athyper/theme/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PaletteTab = "search" | "create" | "recent";

const TAB_LABELS: Record<PaletteTab, string> = {
  search: "Search",
  create: "Create",
  recent: "Recent",
};

const TAB_PLACEHOLDERS: Record<PaletteTab, string> = {
  search: "Search modules, records, actions…",
  create: "Create or do something…",
  recent: "Filter recent…",
};

export interface CommandPaletteBaseProps {
  open: boolean;
  onClose: () => void;
  /** Controlled search value. */
  search?: string;
  onSearchChange?: (value: string) => void;
  /** Active tab. When provided, renders the three-tab bar. */
  activeTab?: PaletteTab;
  onTabChange?: (tab: PaletteTab) => void;
  /** Override placeholder (defaults to tab-specific text when activeTab is set). */
  placeholder?: string;
  /** Shown below search when no results match. */
  emptyMessage?: string;
  className?: string;
  children: ReactNode;
}

export interface CommandGroupProps {
  heading?: string;
  className?: string;
  children: ReactNode;
}

export interface CommandItemProps {
  onSelect: () => void;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  /** Used for cmdk filtering — defaults to text content. */
  keywords?: string[];
  value?: string;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export function CommandPaletteBase({
  open,
  onClose,
  search,
  onSearchChange,
  activeTab,
  onTabChange,
  placeholder,
  emptyMessage = "No results",
  className,
  children,
}: CommandPaletteBaseProps) {
  const resolvedPlaceholder =
    placeholder ??
    (activeTab ? TAB_PLACEHOLDERS[activeTab] : "Search…");

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        {/* Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        {/* Panel */}
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[18vh] z-50 w-full max-w-2xl -translate-x-1/2",
            "overflow-hidden rounded-xl border bg-popover shadow-2xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2",
            "data-[state=closed]:slide-out-to-top-[10%] data-[state=open]:slide-in-from-top-[10%]",
            className,
          )}
          aria-describedby={undefined}
        >
          <Dialog.Title className="sr-only">Universal launcher</Dialog.Title>

          <Command
            className="flex flex-col"
            shouldFilter={search === undefined}
          >
            {/* ── Header: search input + tab bar ────────────── */}
            <div className="flex items-center gap-2 border-b px-3 py-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={search}
                onValueChange={onSearchChange}
                placeholder={resolvedPlaceholder}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />

              {/* Tab bar */}
              {activeTab !== undefined && onTabChange !== undefined && (
                <div className="flex items-center gap-0.5">
                  {(["search", "create", "recent"] as PaletteTab[]).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => onTabChange(tab)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        activeTab === tab
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {TAB_LABELS[tab]}
                    </button>
                  ))}
                  <kbd className="ml-1 rounded border bg-background px-1.5 py-0.5 font-mono text-2xs text-muted-foreground">
                    ESC
                  </kbd>
                </div>
              )}
            </div>

            {/* ── Results ────────────────────────────────────── */}
            <Command.List className="max-h-[420px] overflow-y-auto py-2">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </Command.Empty>

              {children}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PaletteGroup({ heading, className, children }: CommandGroupProps) {
  return (
    <Command.Group
      heading={heading}
      className={cn(
        "px-2 py-1",
        "[&>[cmdk-group-heading]]:px-2 [&>[cmdk-group-heading]]:pb-1 [&>[cmdk-group-heading]]:pt-2",
        "[&>[cmdk-group-heading]]:text-xs [&>[cmdk-group-heading]]:font-semibold [&>[cmdk-group-heading]]:uppercase",
        "[&>[cmdk-group-heading]]:tracking-wide [&>[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
    >
      {children}
    </Command.Group>
  );
}

function PaletteItem({
  onSelect,
  disabled,
  className,
  children,
  keywords,
  value,
}: CommandItemProps) {
  return (
    <Command.Item
      value={value}
      keywords={keywords}
      onSelect={onSelect}
      disabled={disabled}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm",
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground",
        "aria-disabled:pointer-events-none aria-disabled:opacity-50",
        className,
      )}
    >
      {children}
    </Command.Item>
  );
}

function PaletteSeparator({ className }: { className?: string }) {
  return <div className={cn("mx-2 my-1 h-px bg-border", className)} />;
}

/** Compact module/type code badge — right-aligned in item rows. */
function PaletteBadge({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-2xs uppercase text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

CommandPaletteBase.Group = PaletteGroup;
CommandPaletteBase.Item = PaletteItem;
CommandPaletteBase.Separator = PaletteSeparator;
CommandPaletteBase.Badge = PaletteBadge;
