"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback } from "react";

import type { ConflictError } from "@/lib/schema-manager/types";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflict: ConflictError | null;
  onReload: () => void;
  onForceOverwrite?: () => void;
}

export function ConflictDialog({
  open,
  onOpenChange,
  conflict,
  onReload,
  onForceOverwrite,
}: ConflictDialogProps) {
  const handleReload = useCallback(() => {
    onReload();
    onOpenChange(false);
  }, [onReload, onOpenChange]);

  const handleForce = useCallback(() => {
    onForceOverwrite?.();
    onOpenChange(false);
  }, [onForceOverwrite, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-warning" />
            Conflict Detected
          </DialogTitle>
          <DialogDescription>
            {conflict?.message ??
              "This resource was modified by another user since you last loaded it."}
          </DialogDescription>
        </DialogHeader>

        {conflict?.serverData ? (
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Server version
              {conflict.serverVersion && (
                <span className="ml-1 font-mono text-[10px]">
                  ({conflict.serverVersion.slice(0, 12)}...)
                </span>
              )}
            </p>
            <pre className="max-h-48 overflow-auto text-xs">
              {JSON.stringify(conflict.serverData, null, 2)}
            </pre>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {onForceOverwrite && (
            <Button variant="destructive" onClick={handleForce}>
              Force Overwrite
            </Button>
          )}
          <Button onClick={handleReload}>Reload Latest</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
