"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { EntitySummary } from "@/lib/schema-manager/types";

import { Dialog, DialogContent } from "@/components/ui/dialog";

// ─── Command Types ────────────────────────────────────────────

interface Command {
  id: string;
  label: string;
  description?: string;
  category: string;
  action: () => void;
}

// ─── Command Palette ──────────────────────────────────────────

interface CommandPaletteProps {
  entities: EntitySummary[];
  basePath: string;
}

export function CommandPalette({ entities, basePath }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Register keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
        setQuery("");
        setSelectedIndex(0);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Build command list
  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Entity navigation
    for (const entity of entities) {
      cmds.push({
        id: `go:${entity.name}`,
        label: entity.name,
        description: `${entity.kind} entity`,
        category: "Entities",
        action: () => router.push(`${basePath}/${entity.name}/fields`),
      });
    }

    // Tab navigation (for generic navigation)
    const tabs = [
      "fields",
      "relations",
      "indexes",
      "versions",
      "compiled",
      "lifecycle",
      "workflows",
      "policies",
      "forms",
      "views",
      "integrations",
      "overlays",
    ];
    for (const tab of tabs) {
      cmds.push({
        id: `tab:${tab}`,
        label: `Go to ${tab.charAt(0).toUpperCase() + tab.slice(1)}`,
        category: "Tabs",
        action: () => {
          // Navigate to the current entity's tab
          const currentPath = window.location.pathname;
          const entityMatch = currentPath.match(/\/meta-studio\/([^/]+)/);
          if (entityMatch) {
            router.push(`${basePath}/${entityMatch[1]}/${tab}`);
          }
        },
      });
    }

    return cmds;
  }, [entities, basePath, router]);

  // Filter commands by query
  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        c.description?.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filtered[selectedIndex]) {
            filtered[selectedIndex].action();
            setOpen(false);
          }
          break;
        case "Escape":
          setOpen(false);
          break;
      }
    },
    [filtered, selectedIndex],
  );

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Group filtered commands by category
  const grouped = useMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = [];
      groups[cmd.category].push(cmd);
    }
    return groups;
  }, [filtered]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="border-b p-3">
          <input
            type="text"
            placeholder="Search entities, tabs, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <div className="max-h-[300px] overflow-y-auto py-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No results found
            </p>
          )}

          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category}>
              <p className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                {category}
              </p>
              {cmds.map((cmd) => {
                const globalIndex = filtered.indexOf(cmd);
                return (
                  <button
                    key={cmd.id}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors ${
                      globalIndex === selectedIndex ? "bg-accent" : ""
                    }`}
                    onClick={() => {
                      cmd.action();
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate">{cmd.label}</span>
                    {cmd.description && (
                      <span className="text-xs text-muted-foreground">
                        {cmd.description}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t px-3 py-2 text-[10px] text-muted-foreground flex items-center gap-3">
          <span>
            <kbd className="rounded border px-1">↑↓</kbd> Navigate
          </span>
          <span>
            <kbd className="rounded border px-1">↵</kbd> Select
          </span>
          <span>
            <kbd className="rounded border px-1">Esc</kbd> Close
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
