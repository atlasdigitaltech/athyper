"use client";

import { useState } from "react";
import { CheckCircle2, ChevronRight, XCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@athyper/ui/primitives";
import type { BulkRunnerState } from "./useBulkActionRunner";
import { Stat } from "./internal/Stat";

export interface BulkResultDialogProps {
  state:    BulkRunnerState;
  onClose:  () => void;
}

const POLICY_PILL_CLASS: Record<string, string> = {
  deny:              "bg-destructive/15 text-destructive",
  warn:              "bg-warning/15 text-warning-foreground",
  require_workflow:  "bg-info/15 text-info-foreground",
  escalate:          "bg-accent/15 text-accent-foreground",
};

export function BulkResultDialog({ state, onClose }: BulkResultDialogProps) {
  const { phase, result, error } = state;
  const open = phase === "done" && result != null;
  const [showRecords, setShowRecords] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setShowRecords(false);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Action Complete</DialogTitle>
        </DialogHeader>
        {result && (
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <Stat icon={CheckCircle2} label="Succeeded" value={result.summary.success}          variant="success" />
              <Stat icon={XCircle}      label="Failed"    value={result.summary.error}            variant="error"   />
              <Stat icon={ChevronRight} label="Skipped"   value={result.summary.skipped}          variant="neutral" />
              <Stat icon={ChevronRight} label="Workflow"  value={result.summary.requiresWorkflow} variant="neutral" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {result.records.length > 0 && (
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setShowRecords((s) => !s)}
                  className="text-xs text-primary hover:underline underline-offset-2"
                >
                  {showRecords
                    ? "Hide details"
                    : `Show details (${result.records.length} records)`}
                </button>
                {showRecords && (
                  <ul className="max-h-44 overflow-auto rounded-md border bg-muted/30 p-2 space-y-1">
                    {result.records.map((rec) => {
                      const pa = rec.policyAction;
                      const paPill = pa && pa !== "allow" && POLICY_PILL_CLASS[pa] ? (
                        <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", POLICY_PILL_CLASS[pa])}>
                          {pa.replace(/_/g, " ")}
                        </span>
                      ) : null;
                      const statusColor =
                        rec.status === "success" ? "text-success" :
                        rec.status === "error"   ? "text-destructive" :
                                                   "text-muted-foreground";
                      return (
                        <li key={rec.id} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {rec.id.slice(0, 8)}
                          </span>
                          <span className={cn("shrink-0 capitalize", statusColor)}>
                            {rec.status.replace(/_/g, " ")}
                          </span>
                          {paPill}
                          {rec.reason && (
                            <span className="text-muted-foreground truncate">{rec.reason}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
