"use client";

// components/finance/reporting/PresetSaveDialog.tsx
//
// Modal dialog for saving the current report configuration as a named preset.
// Follows the existing SaveAsDialog pattern from mesh/list/settings.

import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { PresetScope, ReportPresetType } from "@/lib/finance/reporting-types";

// ── Types ─────────────────────────────────────────────────────────

interface PresetSaveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: {
    presetCode: string;
    presetName: string;
    description: string;
    scope: PresetScope;
  }) => void;
  defaultName?: string;
  reportType: ReportPresetType;
  saving?: boolean;
}

const SCOPE_OPTIONS: { value: PresetScope; label: string; hint: string }[] = [
  { value: "USER", label: "Personal", hint: "Only visible to you" },
  { value: "SHARED", label: "Shared", hint: "Visible to your team" },
  { value: "SYSTEM", label: "Global", hint: "Visible to everyone" },
];

// ── Helpers ───────────────────────────────────────────────────────

function toPresetCode(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

// ── Component ─────────────────────────────────────────────────────

export function PresetSaveDialog({
  open,
  onOpenChange,
  onSave,
  defaultName = "",
  reportType,
  saving,
}: PresetSaveDialogProps) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<PresetScope>("USER");

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setName(defaultName);
      setDescription("");
      setScope("USER");
    }
  }, [open, defaultName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave({
      presetCode: toPresetCode(trimmed),
      presetName: trimmed,
      description: description.trim(),
      scope,
    });
  };

  const reportLabel =
    reportType === "pnl"
      ? "P&L"
      : reportType === "drilldown"
        ? "Drilldown"
        : "Month-End";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Save Report Preset</DialogTitle>
          <DialogDescription>
            Save the current {reportLabel} report configuration for quick access.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {/* Preset Name */}
          <div className="space-y-1.5">
            <Label htmlFor="preset-name">Preset Name</Label>
            <Input
              id="preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., OPEX by Cost Center"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="preset-desc">
              Description <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="preset-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of this preset"
            />
          </div>

          {/* Scope */}
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <div className="flex gap-2">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScope(opt.value)}
                  className={`flex-1 rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                    scope === opt.value
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    {opt.hint}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? "Saving..." : "Save Preset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
