"use client";

/**
 * FlowWizard — metadata-driven multi-step intake wizard.
 *
 * Layout (spec §1 two-region shell after Phase 3 migration):
 *
 *   Region 1 · EntityHeader  — type-chip + "New" + "Draft" + stepper + cancel
 *   Region 2 · Content       — [fields card | summary panel] 2-col grid + nav buttons
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
import { EntityHeader } from "@athyper/entity-runtime/header";
import { FlowSummaryPanel } from "./FlowSummaryPanel";
import { FlowFieldBinding } from "./FlowFieldBinding";
import { useFlowEngine } from "./useFlowEngine";
import { mapFlowHeaderModel } from "./mapFlowHeaderModel";

export interface FlowWizardProps {
  bundle: FlowBundle;
  userPermissions: string[];
  onSubmit: (draft: Record<string, unknown>) => void | Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  entityLabel?: string;
  /** Entity code (e.g. "purchase_invoice") — makes the type chip a link to the list page. */
  entityCode?: string;
  /** User-context values seeded into derived fields (e.g. default_company_code). */
  userCtx?: Record<string, unknown>;
  /** Pre-populated field values (e.g. from a source document like an AP invoice). */
  initialValues?: Record<string, unknown>;
  /** Rendered below the identity bar (e.g. flow-type switcher). */
  headerAction?: React.ReactNode;
}

export function FlowWizard({
  bundle,
  userPermissions,
  onSubmit,
  onCancel,
  submitting = false,
  entityLabel,
  entityCode,
  userCtx,
  initialValues,
  headerAction,
}: FlowWizardProps) {
  const engine = useFlowEngine(bundle, userPermissions, userCtx, initialValues);
  const {
    state,
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
    validateStep,
  } = engine;

  const chipFields  = visibleFields.filter((f) => f.mode === "chip");
  const gridFields  = visibleFields.filter((f) => f.mode !== "chip");
  const currencyCode = String(state.draft.currency_code ?? state.draft.base_currency_code ?? "");
  // Defer summary panel until step 2+ so step 1 doesn't show a column of zeros.
  const showSummary = summaryLines.length > 0 && state.currentStepIndex > 0;

  const entityHeaderModel = mapFlowHeaderModel(bundle, state.currentStepIndex, {
    onCancel,
    submitting,
    entityTypeLabel: entityLabel,
    entityCode,
  });

  async function handleSubmit() {
    if (!validateStep()) return;
    await onSubmit(state.draft);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Region 1: EntityHeader (identity + stepper + cancel) */}
      <EntityHeader
        model={entityHeaderModel}
        onBack={onCancel}
        extensionSlot={headerAction}
      />

      {/* Region 2: content card */}
      <div className="rounded-xl border border-border bg-card p-4">
        {/* 2-col: fields + summary panel */}
        <div
          className={cn(
            "grid gap-4",
            showSummary ? "grid-cols-1 lg:grid-cols-[1fr_280px]" : "grid-cols-1",
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
                    Exit
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
          {showSummary && (
            <FlowSummaryPanel lines={summaryLines} currencyCode={currencyCode} />
          )}
        </div>
      </div>
    </div>
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
