"use client";

import { useState } from "react";
import {
  Button,
  Checkbox,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
  Input,
  Label,
} from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import {
  useAssignGlControl,
  useUpdateGlControl,
  useDeactivateGlControl,
  type AssignGlControlPayload,
  type UpdateGlControlPayload,
} from "../../hooks/useFinanceSetupMutations";
import type { ConfigureGlControlRow } from "../../hooks/useFinanceConfigure";


// ─── Assign dialog (creates a control row for an uncovered account) ─────────

export interface GlControlAssignDialogProps {
  open:        boolean;
  onClose:     () => void;
  companyCode: string;
  glAccountCode: string;
  accountName:  string;
}

export function GlControlAssignDialog({
  open, onClose, companyCode, glAccountCode, accountName,
}: GlControlAssignDialogProps) {
  const [state, setState] = useState<Partial<AssignGlControlPayload>>({
    postingAllowed:       true,
    blockedForManual:     false,
    blockedForAuto:       false,
    requiresCostCenter:   false,
    requiresProfitCenter: false,
    requiresProject:      false,
    reconciliationType:   "",
    taxCategory:          "",
  });
  const assign = useAssignGlControl();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign company control</DialogTitle>
          <DialogDescription>
            Create a company_code_gl_account row so this account can be posted from{" "}
            <span className="font-mono">{companyCode}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="rounded border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Account</p>
            <p className="text-sm font-medium">
              <span className="font-mono">{glAccountCode}</span>
              {"  ·  "}
              {accountName}
            </p>
          </div>

          <Field
            id="posting_allowed"
            label="Allow posting"
            hint="Uncheck to create the row but block posting entirely."
            checked={!!state.postingAllowed}
            onChange={(v) => setState((s) => ({ ...s, postingAllowed: v }))}
          />
          <Field
            id="blocked_for_manual"
            label="Block manual posting"
            checked={!!state.blockedForManual}
            onChange={(v) => setState((s) => ({ ...s, blockedForManual: v }))}
          />
          <Field
            id="blocked_for_auto"
            label="Block automated posting"
            checked={!!state.blockedForAuto}
            onChange={(v) => setState((s) => ({ ...s, blockedForAuto: v }))}
          />
          <div className="border-t pt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Requires dimension
          </div>
          <Field
            id="req_cc"
            label="Cost center"
            checked={!!state.requiresCostCenter}
            onChange={(v) => setState((s) => ({ ...s, requiresCostCenter: v }))}
          />
          <Field
            id="req_pc"
            label="Profit center"
            checked={!!state.requiresProfitCenter}
            onChange={(v) => setState((s) => ({ ...s, requiresProfitCenter: v }))}
          />
          <Field
            id="req_pr"
            label="Project"
            checked={!!state.requiresProject}
            onChange={(v) => setState((s) => ({ ...s, requiresProject: v }))}
          />

          <div className="grid grid-cols-2 gap-2 border-t pt-2">
            <div>
              <Label htmlFor="reconciliation" className="text-xs">Reconciliation</Label>
              <Input
                id="reconciliation"
                value={state.reconciliationType ?? ""}
                onChange={(e) => setState((s) => ({ ...s, reconciliationType: e.target.value || null }))}
                placeholder="auto / manual / none"
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="tax" className="text-xs">Tax category</Label>
              <Input
                id="tax"
                value={state.taxCategory ?? ""}
                onChange={(e) => setState((s) => ({ ...s, taxCategory: e.target.value || null }))}
                placeholder="—"
                className="h-8"
              />
            </div>
          </div>

          {assign.isError && (
            <p className="text-xs text-destructive">
              {(assign.error as Error)?.message ?? "Failed to assign control."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={assign.isPending}>Cancel</Button>
          <Button
            onClick={() => {
              assign.mutate(
                { companyCode, glAccountCode, ...state } as AssignGlControlPayload,
                {
                  onSuccess: () => {
                    onClose();
                    setState({
                      postingAllowed: true, blockedForManual: false, blockedForAuto: false,
                      requiresCostCenter: false, requiresProfitCenter: false, requiresProject: false,
                      reconciliationType: "", taxCategory: "",
                    });
                  },
                },
              );
            }}
            disabled={assign.isPending}
          >
            {assign.isPending ? "Assigning…" : "Assign control"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Edit dialog (mutates an existing control row) ─────────────────────────

export interface GlControlEditDialogProps {
  open:        boolean;
  onClose:     () => void;
  row:         ConfigureGlControlRow;
  companyCode: string;
}

export function GlControlEditDialog({ open, onClose, row, companyCode }: GlControlEditDialogProps) {
  const [state, setState] = useState<Partial<UpdateGlControlPayload>>({
    postingAllowed:       row.postingAllowed,
    blockedForManual:     row.blockedForManual,
    blockedForAuto:       row.blockedForAuto,
    requiresCostCenter:   row.requiresCostCenter,
    requiresProfitCenter: row.requiresProfitCenter,
    requiresProject:      row.requiresProject,
    reconciliationType:   row.reconciliationType,
    taxCategory:          row.taxCategory,
  });
  const update = useUpdateGlControl();
  const deactivate = useDeactivateGlControl();

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit company control</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{row.accountCode}</span> · {row.accountName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Field
            id="posting_allowed_e"
            label="Allow posting"
            checked={!!state.postingAllowed}
            onChange={(v) => setState((s) => ({ ...s, postingAllowed: v }))}
          />
          <Field
            id="blocked_manual_e"
            label="Block manual posting"
            checked={!!state.blockedForManual}
            onChange={(v) => setState((s) => ({ ...s, blockedForManual: v }))}
          />
          <Field
            id="blocked_auto_e"
            label="Block automated posting"
            checked={!!state.blockedForAuto}
            onChange={(v) => setState((s) => ({ ...s, blockedForAuto: v }))}
          />
          <div className="border-t pt-2 text-xs uppercase tracking-wide text-muted-foreground">
            Requires dimension
          </div>
          <Field
            id="req_cc_e"
            label="Cost center"
            checked={!!state.requiresCostCenter}
            onChange={(v) => setState((s) => ({ ...s, requiresCostCenter: v }))}
          />
          <Field
            id="req_pc_e"
            label="Profit center"
            checked={!!state.requiresProfitCenter}
            onChange={(v) => setState((s) => ({ ...s, requiresProfitCenter: v }))}
          />
          <Field
            id="req_pr_e"
            label="Project"
            checked={!!state.requiresProject}
            onChange={(v) => setState((s) => ({ ...s, requiresProject: v }))}
          />

          <div className="grid grid-cols-2 gap-2 border-t pt-2">
            <div>
              <Label htmlFor="reconciliation_e" className="text-xs">Reconciliation</Label>
              <Input
                id="reconciliation_e"
                value={state.reconciliationType ?? ""}
                onChange={(e) => setState((s) => ({ ...s, reconciliationType: e.target.value || null }))}
                className="h-8"
              />
            </div>
            <div>
              <Label htmlFor="tax_e" className="text-xs">Tax category</Label>
              <Input
                id="tax_e"
                value={state.taxCategory ?? ""}
                onChange={(e) => setState((s) => ({ ...s, taxCategory: e.target.value || null }))}
                className="h-8"
              />
            </div>
          </div>

          {(update.isError || deactivate.isError) && (
            <p className="text-xs text-destructive">
              {(update.error as Error)?.message
                ?? (deactivate.error as Error)?.message
                ?? "Failed to save control."}
            </p>
          )}
        </div>

        <DialogFooter className="flex justify-between sm:justify-between">
          <Button
            variant="ghost"
            onClick={() => {
              if (!confirm("Deactivate this control? Posting will be disallowed.")) return;
              deactivate.mutate(
                { controlId: row.controlId!, companyCode },
                { onSuccess: () => onClose() },
              );
            }}
            disabled={deactivate.isPending || update.isPending}
            className="text-destructive"
          >
            {deactivate.isPending ? "Deactivating…" : "Deactivate"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={update.isPending}>Cancel</Button>
            <Button
              onClick={() => {
                update.mutate(
                  { controlId: row.controlId!, companyCode, ...state } as UpdateGlControlPayload,
                  { onSuccess: () => onClose() },
                );
              }}
              disabled={update.isPending}
            >
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ─── Field atom ────────────────────────────────────────────────────────────

function Field({
  id, label, hint, checked, onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={cn("flex items-start gap-2 rounded px-1 py-1 text-sm")}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onChange(!!v)}
        aria-label={label}
      />
      <div className="flex-1">
        <Label htmlFor={id} className="cursor-pointer">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
