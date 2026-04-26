"use client";

/**
 * FlowModal — Dialog-mode renderer for MODAL-type entity operations.
 *
 * Used when control.entity_operation.handler_type = 'MODAL'.
 * Renders a FlowBundle inside a Dialog / Sheet instead of the full-page
 * FlowWizard layout. Optimised for single-step flows (e.g. promote_proforma)
 * but handles multi-step flows by showing an in-modal step breadcrumb.
 *
 * Reusable contract — NOT purchase-invoice-specific. Any entity operation
 * whose handler_target = 'flow:<flow_code>' can use this component.
 *
 * Usage:
 *   <FlowModal
 *     open={isOpen}
 *     onClose={close}
 *     bundle={flowBundle}
 *     userPermissions={[...]}
 *     onSubmit={async (draft) => { await callOperationEndpoint(draft); }}
 *     submitting={isPending}
 *   />
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Send, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Separator,
} from "@athyper/ui/primitives";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import { FlowFieldBinding } from "./FlowFieldBinding";
import { FlowStepNav } from "./FlowStepNav";
import { useFlowEngine } from "./useFlowEngine";
import { isTruthy } from "./evaluateRule";

export interface FlowModalProps {
  open: boolean;
  onClose: () => void;
  bundle: FlowBundle;
  userPermissions: string[];
  onSubmit: (draft: Record<string, unknown>) => void | Promise<void>;
  submitting?: boolean;
  userCtx?: Record<string, unknown>;
  /** Override the modal title. Defaults to bundle.label. */
  title?: string;
  /** Override the modal description. Defaults to null. */
  description?: string;
}

export function FlowModal({
  open,
  onClose,
  bundle,
  userPermissions,
  onSubmit,
  submitting = false,
  userCtx,
  title,
  description,
}: FlowModalProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const engine = useFlowEngine(bundle, userPermissions, userCtx);
  const {
    state,
    currentStep,
    visibleFields,
    canAdvance,
    isLastStep,
    setField,
    setOverride,
    setDerivedValue,
    goNext,
    goBack,
    goToStep,
    validateStep,
  } = engine;

  const sortedSteps = useMemo(
    () => [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order),
    [bundle.steps],
  );

  const isSingleStep = sortedSteps.length === 1;

  const chipFields = visibleFields.filter((f) => f.mode === "chip");
  const gridFields = visibleFields.filter((f) => f.mode !== "chip");

  async function handleSubmit() {
    if (!validateStep()) return;
    setSubmitError(null);
    try {
      await onSubmit(state.draft);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !submitting) onClose(); }}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isSingleStep ? "max-w-lg" : "max-w-2xl",
        )}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-base font-semibold">
            {title ?? bundle.label}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Multi-step nav — only shown when more than one step */}
        {!isSingleStep && (
          <>
            <div className="px-6 pb-3">
              <FlowStepNav
                steps={sortedSteps}
                currentStepIndex={state.currentStepIndex}
                onStepClick={goToStep}
              />
            </div>
            <Separator />
          </>
        )}

        <Separator />

        {/* Field area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Main grid fields */}
          {gridFields.length > 0 && (
            <div
              className={cn(
                "grid gap-x-5 gap-y-4",
                isSingleStep ? "grid-cols-1" : "grid-cols-2",
              )}
            >
              {gridFields.map((f) => (
                <FlowFieldBinding
                  key={f.id}
                  binding={f}
                  value={state.draft[f.field_name]}
                  error={state.errors[f.field_name]}
                  userPermissions={userPermissions}
                  isOverridden={state.overrides.has(f.field_name)}
                  onChange={(v) => setField(f.field_name, v)}
                  onOverride={(v) => setOverride(f.field_name, v)}
                  onReset={() => setDerivedValue(f.field_name, null)}
                />
              ))}
            </div>
          )}

          {/* Chip row — derived contextual fields */}
          {chipFields.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
              {chipFields.map((f) => (
                <FlowFieldBinding
                  key={f.id}
                  binding={f}
                  value={state.draft[f.field_name]}
                  error={state.errors[f.field_name]}
                  userPermissions={userPermissions}
                  isOverridden={state.overrides.has(f.field_name)}
                  onChange={(v) => setField(f.field_name, v)}
                  onOverride={(v) => setOverride(f.field_name, v)}
                  onReset={() => setDerivedValue(f.field_name, null)}
                />
              ))}
            </div>
          )}

          {gridFields.length === 0 && chipFields.length === 0 && (
            <p className="text-sm text-muted-foreground italic py-4 text-center">
              No fields required.
            </p>
          )}
        </div>

        {submitError && (
          <div className="mx-6 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <Separator />

        {/* Footer actions */}
        <DialogFooter className="px-6 py-4 flex-row items-center justify-between">
          {/* Back button — only for multi-step modals */}
          {!isSingleStep && state.currentStepIndex > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={goBack}
              disabled={submitting}
              className="gap-1"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
              className="text-muted-foreground"
            >
              Cancel
            </Button>

            {isLastStep ? (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting}
                className="gap-1.5 font-semibold"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {submitting ? "Submitting…" : "Submit"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={goNext}
                disabled={!canAdvance || submitting}
                className="gap-1 font-semibold"
              >
                Continue
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
