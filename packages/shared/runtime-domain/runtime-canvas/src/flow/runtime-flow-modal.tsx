"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import type { FlowBundle, FlowFieldBinding, FlowStep } from "@athyper/api-contracts/documents";
import { cn } from "@athyper/theme/utils";
import {
  ControlledRichComposer,
  EMPTY_RICH_VALUE,
  type RichComposerValue,
  type RichVisibility,
} from "@athyper/collaboration-ui";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Separator,
} from "@athyper/ui/primitives";
import { DatePicker } from "@athyper/ui/composites";

export interface FlowModalProps {
  open: boolean;
  onClose: () => void;
  bundle: FlowBundle;
  userPermissions: string[];
  onSubmit: (draft: Record<string, unknown>) => void | Promise<void>;
  submitting?: boolean;
  userCtx?: Record<string, unknown>;
  title?: string;
  description?: string;
}

/**
 * Metadata-driven target descriptor on a flow field binding.
 * Mirrors entity_flow_field.metadata.target — when kind='comment', the
 * field renders as a rich comment composer and the backend dispatcher
 * persists the value into master.comment instead of a doc column.
 */
interface CommentTargetMeta {
  kind: "comment";
  context_type?:   string;
  comment_intent?: string;
  scope?:          "entity" | "workflow_request" | "lifecycle_event";
  visibility?:     RichVisibility;
}

function readCommentTarget(field: FlowFieldBinding): CommentTargetMeta | null {
  const meta = field.metadata;
  if (!meta || typeof meta !== "object") return null;
  const target = (meta as Record<string, unknown>)["target"];
  if (!target || typeof target !== "object") return null;
  if ((target as Record<string, unknown>)["kind"] !== "comment") return null;
  return target as CommentTargetMeta;
}

function sortedSteps(bundle: FlowBundle): FlowStep[] {
  return [...bundle.steps].sort((a, b) => a.sort_order - b.sort_order);
}

function fieldsForStep(step: FlowStep): FlowFieldBinding[] {
  const sectionFields = (step.sections ?? []).flatMap((section) => section.fields ?? []);
  const fields = [...step.fields, ...sectionFields];
  const seen = new Set<string>();
  return fields
    .filter((field) => {
      if (field.mode === "hidden" || field.mode === "summary_only") return false;
      const key = field.field_name || field.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

function initialDraft(bundle: FlowBundle): Record<string, unknown> {
  const draft: Record<string, unknown> = {};
  for (const step of bundle.steps) {
    for (const field of fieldsForStep(step)) {
      const target = readCommentTarget(field);
      if (target) {
        draft[field.field_name] = {
          ...EMPTY_RICH_VALUE,
          visibility: target.visibility ?? EMPTY_RICH_VALUE.visibility,
        };
        continue;
      }
      if (field.derived_value !== undefined) draft[field.field_name] = field.derived_value;
    }
  }
  return draft;
}

function isBlank(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (typeof value === "object" && "text" in (value as Record<string, unknown>)) {
    const text = (value as RichComposerValue).text;
    return !text || text.trim() === "";
  }
  return false;
}

function fieldIsRequired(field: FlowFieldBinding, step: FlowStep): boolean {
  return field.mode === "required" || step.advance_rule.required_fields.includes(field.field_name);
}

function displayValue(value: unknown): string {
  if (isBlank(value)) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function FlowModal({
  open,
  onClose,
  bundle,
  onSubmit,
  submitting = false,
  title,
  description,
}: FlowModalProps) {
  const steps = useMemo(() => sortedSteps(bundle), [bundle]);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => initialDraft(bundle));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    setStepIndex(0);
    setDraft(initialDraft(bundle));
    setErrors({});
    setSubmitError(null);
  }, [bundle]);

  const currentStep = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))];
  const currentFields = currentStep ? fieldsForStep(currentStep) : [];
  const isLastStep = stepIndex >= steps.length - 1;
  const isSingleStep = steps.length <= 1;

  function validateStep(): boolean {
    if (!currentStep) return true;
    const nextErrors: Record<string, string> = {};
    for (const field of currentFields) {
      if (fieldIsRequired(field, currentStep) && isBlank(draft[field.field_name])) {
        nextErrors[field.field_name] = `${field.field_label} is required.`;
      }
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function setFieldValue(fieldName: string, value: unknown) {
    setDraft((current) => ({ ...current, [fieldName]: value }));
    setErrors((current) => {
      if (!current[fieldName]) return current;
      const next = { ...current };
      delete next[fieldName];
      return next;
    });
  }

  async function handleSubmit() {
    if (!validateStep()) return;
    setSubmitError(null);
    try {
      await onSubmit(draft);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  }

  function goNext() {
    if (!validateStep()) return;
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !submitting) onClose(); }}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          isSingleStep ? "max-w-lg" : "max-w-2xl",
        )}
      >
        <DialogHeader className="px-6 pb-4 pt-6">
          <DialogTitle className="text-base font-medium">
            {title ?? bundle.label}
          </DialogTitle>
          {(description ?? bundle.description) ? (
            <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
              {description ?? bundle.description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {!isSingleStep ? (
          <>
            <div className="flex gap-2 overflow-x-auto px-6 pb-3">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => setStepIndex(index)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    index === stepIndex
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-muted-foreground hover:text-foreground",
                  )}
                >
                  {step.label}
                </button>
              ))}
            </div>
            <Separator />
          </>
        ) : null}

        <Separator />

        <div className="max-h-[60vh] flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {/* Step heading is only meaningful in multi-step flows. For a
              single-step modal the DialogTitle already names the action and
              repeating the step label is noise. layout_hint is a layout
              directive (e.g. "two_column"), not user copy — never render. */}
          {currentStep && !isSingleStep ? (
            <h3 className="text-sm font-medium text-foreground">{currentStep.label}</h3>
          ) : null}

          {currentFields.length > 0 ? (
            <div className={cn("grid gap-x-5 gap-y-4", isSingleStep ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
              {currentFields.map((field) => (
                <FlowField
                  key={field.id}
                  field={field}
                  value={draft[field.field_name]}
                  error={errors[field.field_name]}
                  required={currentStep ? fieldIsRequired(field, currentStep) : false}
                  onChange={(value) => setFieldValue(field.field_name, value)}
                />
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm italic text-muted-foreground">
              No fields required.
            </p>
          )}
        </div>

        {submitError ? (
          <div className="mx-6 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submitError}</span>
          </div>
        ) : null}

        <Separator />

        <DialogFooter className="flex-row items-center justify-between px-6 py-4">
          {!isSingleStep && stepIndex > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}
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
                onClick={() => void handleSubmit()}
                disabled={submitting}
                className="gap-1.5 font-medium"
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {submitting ? "Submitting..." : "Submit"}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={goNext}
                disabled={submitting}
                className="gap-1 font-medium"
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

function FlowField({
  field,
  value,
  error,
  required,
  onChange,
}: {
  field: FlowFieldBinding;
  value: unknown;
  error?: string;
  required: boolean;
  onChange: (value: unknown) => void;
}) {
  const readOnly = field.mode === "readonly" || field.derivation_mode === "derived_locked";
  const inputClass = cn(
    "min-h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-2xs",
    "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
    readOnly && "bg-muted/40 text-muted-foreground",
    error && "border-destructive focus-visible:ring-destructive/40",
  );

  // Comment-target fields render with the same rich composer used by the
  // Comments panel, so the experience is identical wherever a note is
  // captured. The composer's visibility pill is hidden when the binding's
  // metadata already locks visibility (typical for submission notes).
  const commentTarget = readCommentTarget(field);
  if (commentTarget) {
    const composerValue: RichComposerValue =
      (value && typeof value === "object" && "text" in (value as Record<string, unknown>))
        ? value as RichComposerValue
        : { ...EMPTY_RICH_VALUE, visibility: commentTarget.visibility ?? EMPTY_RICH_VALUE.visibility };
    return (
      <label className={cn("space-y-1.5", "sm:col-span-2")}>
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {field.field_label}
          {required ? <span className="text-destructive">*</span> : null}
        </span>
        <ControlledRichComposer
          value={composerValue}
          onChange={onChange}
          placeholder={field.placeholder ?? `Write a ${field.field_label.toLowerCase()}…`}
          disabled={readOnly}
          hideVisibility={!!commentTarget.visibility}
        />
        {field.help_text && !error ? (
          <span className="block text-xs text-muted-foreground">{field.help_text}</span>
        ) : null}
        {error ? <span className="block text-xs text-destructive">{error}</span> : null}
      </label>
    );
  }

  return (
    <label className={cn("space-y-1.5", field.span === 2 && "sm:col-span-2", field.mode === "chip" && "sm:col-span-2")}>
      <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        {field.field_label}
        {required ? <span className="text-destructive">*</span> : null}
      </span>
      {field.data_type === "boolean" || field.ui_variant === "checkbox" ? (
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={readOnly}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
      ) : field.data_type === "number" || field.data_type === "integer" || field.data_type === "decimal" ? (
        <input
          type="number"
          value={displayValue(value)}
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
          className={inputClass}
        />
      ) : field.data_type === "date" ? (
        <DatePicker
          kind="businessDate"
          value={displayValue(value) || null}
          onChange={(next) => onChange(next ?? "")}
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
        />
      ) : (
        <input
          type="text"
          value={displayValue(value)}
          disabled={readOnly}
          placeholder={field.placeholder ?? undefined}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
      {field.help_text && !error ? <span className="block text-xs text-muted-foreground">{field.help_text}</span> : null}
      {error ? <span className="block text-xs text-destructive">{error}</span> : null}
    </label>
  );
}
