"use client";

// components/mesh/list/settings/SaveAsDialog.tsx
//
// Modal dialog for naming a new preset.
// Input + Cancel/Save buttons, Enter key triggers save.

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

interface SaveAsDialogProps {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
}

export function SaveAsDialog({
  open,
  defaultName,
  onOpenChange,
  onSave,
}: SaveAsDialogProps) {
  const [name, setName] = useState(defaultName);

  // Reset name when dialog opens
  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name.trim());
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Save View As</DialogTitle>
          <DialogDescription>
            Save the current view settings as a personal preset.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-4">
          <Label htmlFor="preset-name">Preset Name</Label>
          <Input
            id="preset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My View"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
