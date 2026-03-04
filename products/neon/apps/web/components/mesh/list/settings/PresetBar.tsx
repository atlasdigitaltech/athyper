"use client";

// components/mesh/list/settings/PresetBar.tsx
//
// Horizontal scrollable chip bar showing all presets.
// Active preset highlighted, dirty indicator, delete on personal presets.

import { X } from "lucide-react";

import type { ViewPreset } from "../types";

import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface PresetBarProps {
  allPresets: ViewPreset[];
  activePresetId: string | null;
  isDirty: boolean;
  onSelectPreset: (preset: ViewPreset) => void;
  onDeletePreset: (presetId: string) => void;
}

export function PresetBar({
  allPresets,
  activePresetId,
  isDirty,
  onSelectPreset,
  onDeletePreset,
}: PresetBarProps) {
  return (
    <div className="border-b px-3 py-2">
      <ScrollArea className="w-full">
        <div className="flex items-center gap-1.5">
          {allPresets.map((preset) => {
            const isActive =
              preset.id === activePresetId ||
              (preset.id === "__default" && !activePresetId);
            const isPersonal = preset.scope === "personal";

            return (
              <button
                key={preset.id}
                type="button"
                className={cn(
                  "group relative flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  isActive
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                )}
                onClick={() => onSelectPreset(preset)}
              >
                {preset.label}
                {isPersonal && !isActive && (
                  <span className="text-[9px] text-muted-foreground/60">
                    (mine)
                  </span>
                )}
                {isActive && isDirty && (
                  <span className="size-1.5 rounded-full bg-amber-500" />
                )}
                {isPersonal && preset.id !== "__default" && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="ml-0.5 hidden rounded-full p-0.5 hover:bg-destructive/10 group-hover:inline-flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePreset(preset.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        onDeletePreset(preset.id);
                      }
                    }}
                  >
                    <X className="size-2.5 text-destructive" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
