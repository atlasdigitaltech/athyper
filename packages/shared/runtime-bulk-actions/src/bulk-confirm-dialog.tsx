"use client";

import { CheckCircle2, ChevronRight, Loader2, XCircle } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@athyper/ui/primitives";
import type { BulkRunnerState } from "./use-bulk-action-runner";
import { Stat } from "./internal/stat";

export interface BulkConfirmDialogProps {
  state:     BulkRunnerState;
  onConfirm: () => void;
  onCancel:  () => void;
}

export function BulkConfirmDialog({
  state,
  onConfirm,
  onCancel,
}: BulkConfirmDialogProps) {
  const { phase, activeAction, preflight, error } = state;
  const open = phase === "confirm" || phase === "executing";

  return (
    <Dialog
      open={open}
      onOpenChange={() => {
        if (phase !== "executing") onCancel();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm: {activeAction}</DialogTitle>
          <DialogDescription>
            {preflight?.eligible} of {preflight?.total} records will be processed.
          </DialogDescription>
        </DialogHeader>
        {preflight && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat icon={CheckCircle2} label="Eligible"       value={preflight.eligible}         variant="success" />
              <Stat icon={ChevronRight} label="Already done"   value={preflight.skipped}          variant="neutral" />
              <Stat icon={XCircle}      label="Denied"         value={preflight.denied}           variant="error"   />
              <Stat icon={ChevronRight} label="Needs workflow" value={preflight.requiresWorkflow} variant="neutral" />
            </div>
            {!preflight.canProceed && (
              <p className="text-xs text-muted-foreground">
                No records are eligible — nothing to do.
              </p>
            )}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={phase === "executing"}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={!preflight?.canProceed || phase === "executing"}
          >
            {phase === "executing" && (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            )}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
