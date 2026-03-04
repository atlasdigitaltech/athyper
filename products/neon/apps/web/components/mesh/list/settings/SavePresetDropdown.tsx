"use client";

// components/mesh/list/settings/SavePresetDropdown.tsx
//
// Small dropdown button in the settings drawer header.
// Save (overwrites active personal preset) + Save As (opens dialog).

import { ChevronDown, Save } from "lucide-react";

import type { ViewPreset } from "../types";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SavePresetDropdownProps {
  activePreset: ViewPreset | null;
  isDirty: boolean;
  onSave: () => void;
  onSaveAs: () => void;
}

export function SavePresetDropdown({
  activePreset,
  isDirty,
  onSave,
  onSaveAs,
}: SavePresetDropdownProps) {
  const canSave = activePreset?.scope === "personal" && isDirty;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
          <Save className="size-3" />
          Save
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem
          disabled={!canSave}
          onClick={onSave}
          className="text-xs"
        >
          Save
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSaveAs} className="text-xs">
          Save As...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
