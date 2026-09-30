"use client";
import { useRef, useState } from "react";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
import { Button } from "@athyper/platform-ui";
import {
  EntityIntakeSurface,
  intakeSurfaceValues,
  validateIntakeSurface,
} from "./intake-surface";
import { useEntityIntake } from "./intake";
export interface IntakeClassificationHandoff {
  readonly surfaceKey: string;
  readonly descriptorHash: string;
  readonly answers: Readonly<Record<string, string>>;
}
/** Registered adapters receive only valid active answers, pinned to the loaded publication. */
export function EntityIntakeClassification({
  surface,
  descriptorHash,
  onContinue,
  onAnswersChange,
  continueLabel = "Continue",
}: {
  readonly surface: EntityIntakeSurfaceV1;
  readonly descriptorHash: string;
  readonly onContinue: (handoff: IntakeClassificationHandoff) => Promise<void>;
  readonly onAnswersChange?: () => void;
  readonly continueLabel?: string;
}) {
  const intake = useEntityIntake();
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({}),
    [showErrors, setShowErrors] = useState(false),
    [error, setError] = useState<string>(),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  return (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault();
        if (lock.current) return;
        setShowErrors(true);
        if (Object.keys(validateIntakeSurface(surface, answers)).length) return;
        lock.current = true;
        setBusy(true);
        setError(undefined);
        try {
          await onContinue({
            surfaceKey: surface.key,
            descriptorHash,
            answers: intakeSurfaceValues(surface, answers),
          });
          intake?.next();
        } catch (e) {
          setError(
            e instanceof Error
              ? e.message
              : "Unable to continue. Please try again.",
          );
        } finally {
          lock.current = false;
          setBusy(false);
        }
      }}
    >
      <EntityIntakeSurface
        surface={surface}
        answers={answers}
        showErrors={showErrors}
        disabled={busy}
        onChange={(next) => {
          setAnswers(next);
          onAnswersChange?.();
          setError(undefined);
          intake?.markDirty();
          if (intake) {
            const step = intake.flow.steps.find(
              (s) => s.surfaceKey === surface.key,
            );
            if (step) intake.invalidate(step.key);
          }
        }}
      />
      {error ? <p role="alert">{error}</p> : null}
      <Button type="submit" disabled={busy} loading={busy}>
        {continueLabel}
      </Button>
    </form>
  );
}
