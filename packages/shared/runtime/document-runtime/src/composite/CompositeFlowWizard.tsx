"use client";

/**
 * CompositeFlowWizard — multi-step intake wizard for composite (multi-entity)
 * onboarding flows such as supplier request intake.
 *
 * Reuses the following from FlowWizard:
 *   EntityHeader   — top chrome (type chip + step nav + cancel)
 *   FlowStepNav    — step indicator
 *   FlowFieldBinding — individual flat-field rendering
 *   Same layout: Region-1 header, Region-2 2-col card grid
 *
 * New compared to FlowWizard:
 *   - Accepts injected engine (useCompositeIntakeEngine) instead of owning
 *     useFlowEngine internally — no changes to FlowWizard needed.
 *   - Renders sections per step: FlowFieldBinding for type=fields,
 *     ChildRecordRepeater for type=repeater/singleton, nothing for type=summary.
 *   - Accepts summarySlot for the right-rail (CompletionSummaryPanel).
 *   - Section-level permission gating and visibility predicates.
 */

import React from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Card, CardContent } from "@athyper/ui/primitives";
import { EntityHeader } from "@athyper/entity-runtime/header";
import { FlowFieldBinding } from "../intake/FlowFieldBinding";
import { isTruthy } from "../intake/evaluateRule";
import type { EntityHeaderModel } from "@athyper/entity-runtime/header";
import type { CompositeIntakeEngineReturn } from "./useCompositeIntakeEngine";
import type { CompositeFlowBundle, FlowSectionDescriptor } from "./types";
import { ChildRecordRepeater } from "./ChildRecordRepeater";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CompositeFlowWizardProps {
  bundle: CompositeFlowBundle;
  engine: CompositeIntakeEngineReturn;
  userPermissions: string[];
  /** Right-rail slot — typically CompletionSummaryPanel. */
  summarySlot?: React.ReactNode;
  /** Called with the final composite payload when Submit is clicked. */
  onSubmit: () => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  primaryActionDisabled?: boolean;
  entityLabel?: string;
  entityCode?: string;
  /** Slot for the Review step content (DuplicateCheckBanner + acknowledgement). */
  reviewSlot?: React.ReactNode;
  /** Optional per-step content rendered below the step sections. */
  stepSlots?: Record<string, React.ReactNode>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CompositeFlowWizard({
  bundle,
  engine,
  userPermissions,
  summarySlot,
  onSubmit,
  onCancel,
  submitting = false,
  entityLabel,
  entityCode,
  reviewSlot,
  primaryActionDisabled = false,
  stepSlots,
}: CompositeFlowWizardProps) {
  const {
    state,
    currentStep,
    isLastStep,
    canAdvance,
    setFlatField,
    setChildRows,
    goNext,
    goBack,
    goToStep,
    validateStep,
  } = engine;

  const sortedSteps = [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order);

  async function handleSubmit() {
    if (!validateStep()) return;
    await onSubmit();
  }

  const headerModel = buildHeaderModel(bundle, state.currentStepIndex, sortedSteps, {
    entityLabel,
    entityCode,
    onCancel,
    submitting,
  });

  return (
    <div className="flex flex-col gap-2.5">
      {/* Region 1: EntityHeader */}
      <EntityHeader
        model={headerModel}
        onBack={onCancel}
      />

      {/* Region 2: content card */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div
          className={cn(
            "grid gap-4",
            summarySlot ? "grid-cols-1 lg:grid-cols-[1fr_280px]" : "grid-cols-1",
          )}
        >
          {/* Main form area */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardContent className="pt-5 space-y-6">
                {currentStep.sections.map(sec => (
                  <SectionRenderer
                    key={sec.section_key}
                    section={sec}
                    flatFields={state.flatFields}
                    childRows={state.childRows[sec.payload_key ?? ""] ?? []}
                    errors={state.errors}
                    userPermissions={userPermissions}
                    onFlatFieldChange={setFlatField}
                    onChildRowsChange={(rows) => setChildRows(sec.payload_key ?? sec.section_key, rows)}
                    reviewSlot={reviewSlot}
                  />
                ))}

                {currentStep.sections.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">No fields in this step.</p>
                )}

                {stepSlots?.[currentStep.step_key] && (
                  <div className="pt-1">
                    {stepSlots[currentStep.step_key]}
                  </div>
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
                    disabled={submitting || primaryActionDisabled}
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
                    {submitting ? "Submitting…" : "Submit Request"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!canAdvance || submitting || primaryActionDisabled}
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

          {/* Right-rail summary slot */}
          {summarySlot && (
            <div className="hidden lg:block">
              <div className="sticky top-4">{summarySlot}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Section renderer ──────────────────────────────────────────────────────────

interface SectionRendererProps {
  section: FlowSectionDescriptor;
  flatFields: Record<string, unknown>;
  childRows: Record<string, unknown>[];
  errors: Record<string, string>;
  userPermissions: string[];
  onFlatFieldChange: (key: string, value: unknown) => void;
  onChildRowsChange: (rows: Record<string, unknown>[]) => void;
  reviewSlot?: React.ReactNode;
}

function SectionRenderer({
  section,
  flatFields,
  childRows,
  errors,
  userPermissions,
  onFlatFieldChange,
  onChildRowsChange,
  reviewSlot,
}: SectionRendererProps) {
  // Evaluate visibility predicate against flat fields
  if (section.visible_when) {
    try {
      const visible = isTruthy(section.visible_when, { draft: flatFields, ctx: {}, meta: {} });
      if (!visible) return null;
    } catch {
      // Keep visible on error
    }
  }

  if (section.section_type === "summary") {
    return (
      <div className="space-y-3">
        {reviewSlot}
      </div>
    );
  }

  if (section.section_type === "fields") {
    const chipFields = section.fields.filter(f => f.mode === "chip");
    const gridFields = section.fields.filter(f => f.mode !== "chip");

    if (section.fields.length === 0) return null;

    return (
      <div className="space-y-3">
        {section.label && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.label}
          </p>
        )}

        {gridFields.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            {gridFields.map(f => (
              <FlowFieldBinding
                key={f.id}
                binding={f}
                value={flatFields[f.field_name]}
                error={errors[f.field_name]}
                userPermissions={userPermissions}
                isOverridden={false}
                draftCtx={flatFields}
                onChange={(v) => onFlatFieldChange(f.field_name, v)}
                onOverride={(v) => onFlatFieldChange(f.field_name, v)}
                onReset={() => onFlatFieldChange(f.field_name, undefined)}
              />
            ))}
          </div>
        )}

        {chipFields.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {chipFields.map(f => (
              <FlowFieldBinding
                key={f.id}
                binding={f}
                value={flatFields[f.field_name]}
                error={errors[f.field_name]}
                userPermissions={userPermissions}
                isOverridden={false}
                draftCtx={flatFields}
                onChange={(v) => onFlatFieldChange(f.field_name, v)}
                onOverride={(v) => onFlatFieldChange(f.field_name, v)}
                onReset={() => onFlatFieldChange(f.field_name, undefined)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section.section_type === "repeater" || section.section_type === "singleton") {
    const rowErrors: Record<string, string> = {};
    for (const [k, v] of Object.entries(errors)) {
      if (k.startsWith(`${section.section_key}__`)) {
        rowErrors[k.slice(section.section_key.length + 2)] = v;
      }
    }

    return (
      <ChildRecordRepeater
        sectionKey={section.section_key}
        label={section.label}
        fields={section.child_fields ?? []}
        rows={section.section_type === "singleton" ? childRows.slice(0, 1) : childRows}
        onChange={onChildRowsChange}
        rowErrors={rowErrors}
        minRows={section.section_type === "singleton" ? 0 : (section.min_rows ?? 0)}
        maxRows={section.section_type === "singleton" ? 1 : section.max_rows ?? undefined}
        defaultRow={section.default_row ?? {}}
        parentDraft={flatFields}
        permissionCode={section.permission_code ?? null}
        userPermissions={userPermissions}
        restrictedViewOnly={section.restricted_view_only ?? false}
        optional={(section.min_rows ?? 0) === 0}
      />
    );
  }

  return null;
}

// ── Header model builder ──────────────────────────────────────────────────────

function buildHeaderModel(
  bundle: CompositeFlowBundle,
  stepIndex: number,
  sortedSteps: CompositeFlowBundle["steps"],
  opts: {
    entityLabel?: string;
    entityCode?: string;
    onCancel?: () => void;
    submitting?: boolean;
  },
): EntityHeaderModel {
  const ACTION_VERB_RE = /^(create|new|add|edit|update)\s+/i;
  const rawLabel = opts.entityLabel ?? bundle.label.replace(ACTION_VERB_RE, "");
  const typeLabel = rawLabel.toUpperCase();

  return {
    identity: {
      typeLabel,
      typeHref: opts.entityCode ? `/app/${opts.entityCode}` : undefined,
      number: "New",
      identifierAction: "none",
      status: { label: "Draft", intent: "neutral" },
    },
    progress: {
      kind: "wizard",
      currentKey: sortedSteps[stepIndex]?.step_key ?? sortedSteps[0]?.step_key ?? "",
      stepIndex,
      stages: sortedSteps.map(s => ({ key: s.step_key, label: s.label })),
    },
    actions: opts.onCancel
      ? [{
          id: "cancel",
          label: "Exit",
          placement: "secondary" as const,
          order: 99,
          disabled: opts.submitting,
          onSelect: opts.onCancel,
        }]
      : [],
  };
}
