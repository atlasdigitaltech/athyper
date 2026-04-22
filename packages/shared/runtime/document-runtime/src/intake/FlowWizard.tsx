"use client";

/**
 * FlowWizard — metadata-driven multi-step intake wizard.
 *
 * Replaces the flat EntityForm for any entity that has an active flow defined
 * in control.entity_flow. Consumes a FlowBundle (from GET /meta/flow endpoint
 * or a statically supplied bundle) and renders:
 *
 *   ┌────────────────────────────────────────────────────────┐
 *   │  [Step 1: Identify] → [Step 2: Commercial] → [Review]  │  ← FlowStepNav
 *   ├───────────────────────────────────────┬────────────────┤
 *   │  Fields for current step (2-col grid) │  Summary panel │
 *   │  ┌──────────┬──────────┐              │  (sticky)      │
 *   │  │ field    │ field    │              │                │
 *   │  └──────────┴──────────┘              │                │
 *   │  [derived chips row]                  │                │
 *   │                                       │                │
 *   │  [← Back]              [Continue →]   │                │
 *   └───────────────────────────────────────┴────────────────┘
 *
 * Chip fields are rendered in a dedicated row below the main grid so they
 * don't disrupt the layout rhythm of full-width inputs.
 *
 * Usage:
 *   <FlowWizard
 *     bundle={flowBundle}
 *     userPermissions={["ap.override_currency", ...]}
 *     onSubmit={async (draft) => { await createDocument(draft); }}
 *     onCancel={() => router.back()}
 *   />
 *
 * Props:
 *   bundle           — resolved FlowBundle from /meta/flow API or static import
 *   userPermissions  — codes from the current user's permission set
 *   onSubmit         — called with the final draft when user submits last step
 *   onCancel         — called when user clicks Cancel
 *   submitting       — external loading state (e.g. from createMutation.isPending)
 *   entityLabel      — display name shown in the page header
 */

import React from "react";
import { ChevronLeft, ChevronRight, Send, X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent, Skeleton, Separator } from "@athyper/ui/primitives";
import type { FlowBundle, FlowFieldBinding as FlowFieldBindingType } from "@athyper/api-contracts/documents";
import { FlowStepNav } from "./FlowStepNav";
import { FlowSummaryPanel } from "./FlowSummaryPanel";
import { FlowFieldBinding } from "./FlowFieldBinding";
import { useFlowEngine } from "./useFlowEngine";

export interface FlowWizardProps {
  bundle: FlowBundle;
  userPermissions: string[];
  onSubmit: (draft: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  entityLabel?: string;
  /** User-context values seeded into derived fields (e.g. default_company_code). */
  userCtx?: Record<string, unknown>;
}

export function FlowWizard({
  bundle,
  userPermissions,
  onSubmit,
  onCancel,
  submitting = false,
  entityLabel,
  userCtx,
}: FlowWizardProps) {
  const engine = useFlowEngine(bundle, userPermissions, userCtx);
  const {
    state,
    currentStep,
    visibleFields,
    canAdvance,
    isLastStep,
    summaryLines,
    setField,
    setOverride,
    setDerivedValue,
    goNext,
    goBack,
    goToStep,
    validateStep,
  } = engine;

  const sortedSteps = [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order);

  // Separate chip-mode fields from regular fields so chips render below the grid
  const chipFields = visibleFields.filter((f) => f.mode === "chip");
  const gridFields = visibleFields.filter((f) => f.mode !== "chip");

  const hasSummaryPanel = summaryLines.length > 0;

  async function handleSubmit() {
    if (!validateStep()) return;
    await onSubmit(state.draft);
  }

  const currencyCode = String(state.draft.currency_code ?? state.draft.base_currency_code ?? "");

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            {bundle.label}
            {entityLabel && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                — {entityLabel}
              </span>
            )}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Step {state.currentStepIndex + 1} of {sortedSteps.length}
            {" · "}{currentStep.label}
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Cancel"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Step navigation */}
      <FlowStepNav
        steps={sortedSteps}
        currentStepIndex={state.currentStepIndex}
        onStepClick={goToStep}
      />

      <Separator />

      {/* Main layout: fields + summary panel */}
      <div className={cn(
        "grid gap-6",
        hasSummaryPanel ? "grid-cols-1 lg:grid-cols-[1fr_260px]" : "grid-cols-1",
      )}>
        {/* Fields area */}
        <div className="space-y-5">
          <Card>
            <CardContent className="pt-6 space-y-5">
              {/* Grid fields */}
              {gridFields.length > 0 && (
                <div className="grid grid-cols-2 gap-x-5 gap-y-5">
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
                      onReset={() => {
                        // Reset to derived value: clear override flag
                        // (a real impl would re-fetch derive endpoint)
                        setDerivedValue(f.field_name, null);
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Chip row — derived contextual fields */}
              {chipFields.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
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
                <p className="text-sm text-muted-foreground italic">
                  No fields in this step.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={goBack}
              disabled={state.currentStepIndex === 0 || submitting}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium",
                "border border-border bg-background text-foreground",
                "hover:bg-muted transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              )}
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>

            <div className="flex items-center gap-2">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={submitting}
                  className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
              )}

              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={submitting}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold",
                    "bg-primary text-primary-foreground",
                    "hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  {submitting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canAdvance || submitting}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-5 py-2 text-sm font-semibold",
                    "bg-primary text-primary-foreground",
                    "hover:bg-primary/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                >
                  Continue
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary panel (sticky right column) */}
        {hasSummaryPanel && (
          <FlowSummaryPanel
            lines={summaryLines}
            currencyCode={currencyCode}
          />
        )}
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function FlowWizardSkeleton() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="flex gap-4">
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-1 flex-1 self-center" />
        <Skeleton className="h-10 w-24 rounded-full" />
        <Skeleton className="h-1 flex-1 self-center" />
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <Skeleton className="h-px w-full" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-3 w-20" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
