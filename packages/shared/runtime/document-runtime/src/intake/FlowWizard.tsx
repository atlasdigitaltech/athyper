"use client";

/**
 * FlowWizard — metadata-driven multi-step intake wizard.
 *
 * Layout (spec §1 three-region shell):
 *
 *   Region 1 · Header      — type-chip + "New" + "Draft" badge + cancel button
 *   Region 2 · Context bar — FlowStepNav (the stepper)
 *   Region 3 · Content     — [fields card | summary panel] 2-col grid + nav buttons
 *
 * Usage:
 *   <FlowWizard
 *     bundle={flowBundle}
 *     userPermissions={["ap.override_currency", ...]}
 *     onSubmit={async (draft) => { await createDocument(draft); }}
 *     onCancel={() => router.back()}
 *   />
 */

import React from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent, Skeleton } from "@athyper/ui/primitives";
import type { FlowBundle } from "@athyper/api-contracts/documents";
import { FlowStepNav } from "./FlowStepNav";
import { FlowSummaryPanel } from "./FlowSummaryPanel";
import { FlowFieldBinding } from "./FlowFieldBinding";
import { useFlowEngine } from "./useFlowEngine";
import { PageShell, PageHeader, ModeBadge } from "@athyper/ui/layout";

export interface FlowWizardProps {
  bundle: FlowBundle;
  userPermissions: string[];
  onSubmit: (draft: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  entityLabel?: string;
  /** User-context values seeded into derived fields (e.g. default_company_code). */
  userCtx?: Record<string, unknown>;
  /** Pre-populated field values (e.g. from a source document like an AP invoice). */
  initialValues?: Record<string, unknown>;
  /** Rendered in the header row between the title and the cancel button (e.g. flow-type switcher). */
  headerAction?: React.ReactNode;
}

export function FlowWizard({
  bundle,
  userPermissions,
  onSubmit,
  onCancel,
  submitting = false,
  entityLabel,
  userCtx,
  initialValues,
  headerAction,
}: FlowWizardProps) {
  const engine = useFlowEngine(bundle, userPermissions, userCtx, initialValues);
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
    setDisplayLabel,
    goNext,
    goBack,
    goToStep,
    validateStep,
  } = engine;

  const sortedSteps = [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order);

  const chipFields  = visibleFields.filter((f) => f.mode === "chip");
  const gridFields  = visibleFields.filter((f) => f.mode !== "chip");
  const hasSummary  = summaryLines.length > 0;
  const currencyCode = String(state.draft.currency_code ?? state.draft.base_currency_code ?? "");

  async function handleSubmit() {
    if (!validateStep()) return;
    await onSubmit(state.draft);
  }

  // ── Region 1: header ───────────────────────────────────────────────────────
  const header = (
    <PageHeader
      typeChip={bundle.label}
      title="New"
      titleVariant="page"
      statusSlot={<ModeBadge>Draft</ModeBadge>}
      subtitle={
        entityLabel
          ? `${entityLabel} · Step ${state.currentStepIndex + 1} of ${sortedSteps.length} · ${currentStep.label}`
          : `Step ${state.currentStepIndex + 1} of ${sortedSteps.length} · ${currentStep.label}`
      }
      actions={
        <div className="flex items-center gap-2">
          {headerAction}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      }
    />
  );

  // ── Region 2: stepper ──────────────────────────────────────────────────────
  const context = (
    <FlowStepNav
      steps={sortedSteps}
      currentStepIndex={state.currentStepIndex}
      onStepClick={goToStep}
    />
  );

  return (
    <PageShell header={header} context={context}>
      {/* 2-col: fields + summary panel */}
      <div
        className={cn(
          "grid gap-4",
          hasSummary ? "grid-cols-1 lg:grid-cols-[1fr_280px]" : "grid-cols-1",
        )}
      >
        {/* Fields area */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="pt-5 space-y-4">
              {gridFields.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                  {gridFields.map((f) => (
                    <FlowFieldBinding
                      key={f.id}
                      binding={f}
                      value={state.draft[f.field_name]}
                      displayLabel={state.displayLabels[f.field_name]}
                      error={state.errors[f.field_name]}
                      userPermissions={userPermissions}
                      isOverridden={state.overrides.has(f.field_name)}
                      draftCtx={state.draft}
                      onChange={(v) => setField(f.field_name, v)}
                      onOverride={(v) => setOverride(f.field_name, v)}
                      onReset={() => setDerivedValue(f.field_name, null)}
                      onDisplayLabel={(label) => setDisplayLabel(f.field_name, label)}
                    />
                  ))}
                </div>
              )}

              {chipFields.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {chipFields.map((f) => (
                    <FlowFieldBinding
                      key={f.id}
                      binding={f}
                      value={state.draft[f.field_name]}
                      displayLabel={state.displayLabels[f.field_name]}
                      error={state.errors[f.field_name]}
                      userPermissions={userPermissions}
                      isOverridden={state.overrides.has(f.field_name)}
                      onChange={(v) => setField(f.field_name, v)}
                      onOverride={(v) => setOverride(f.field_name, v)}
                      onReset={() => setDerivedValue(f.field_name, null)}
                      onDisplayLabel={(label) => setDisplayLabel(f.field_name, label)}
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

          {/* Navigation */}
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

        {/* Summary panel — sticky right rail */}
        {hasSummary && (
          <FlowSummaryPanel lines={summaryLines} currencyCode={currencyCode} />
        )}
      </div>
    </PageShell>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function FlowWizardSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      {/* Header region */}
      <div className="rounded-xl border border-border bg-card px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-[26px] w-20 rounded-md" />
              <Skeleton className="h-7 w-12 rounded" />
              <Skeleton className="h-[22px] w-14 rounded" />
            </div>
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>
      {/* Context region (stepper) */}
      <div className="flex h-9 items-center rounded-xl border border-border bg-card px-4 gap-4">
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-1 flex-1" />
        <Skeleton className="h-7 w-20 rounded-full" />
        <Skeleton className="h-1 flex-1" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      {/* Content region */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border bg-card p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1.5">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between">
              <Skeleton className="h-9 w-20 rounded-md" />
              <Skeleton className="h-9 w-24 rounded-md" />
            </div>
          </div>
          <div className="flex flex-col gap-3">
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
    </div>
  );
}
