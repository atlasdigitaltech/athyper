import {
  intakeConditionMatches,
  type EntityIntakeFlowV1,
} from "@athyper/contract-platform-entity-runtime";
export interface IntakeCheckpoint {
  readonly flowKey: string;
  readonly descriptorHash: string;
  readonly currentStep: string;
  readonly completed: readonly string[];
}
export function initialIntakeCheckpoint(
  flow: EntityIntakeFlowV1,
  descriptorHash: string,
  saved?: IntakeCheckpoint,
): IntakeCheckpoint {
  const keys = new Set(flow.steps.map((s) => s.key));
  if (
    saved &&
    (!flow.allowDraftResume ||
      saved.flowKey !== flow.key ||
      saved.descriptorHash !== descriptorHash ||
      !keys.has(saved.currentStep) ||
      saved.completed.some((k) => !keys.has(k)))
  )
    throw Error(
      "The saved intake belongs to a different flow revision. Reopen the original request.",
    );
  return (
    saved ?? {
      flowKey: flow.key,
      descriptorHash,
      currentStep: flow.steps[0]!.key,
      completed: [],
    }
  );
}
export function navigateIntake(
  flow: EntityIntakeFlowV1,
  state: IntakeCheckpoint,
  target: string,
  answers: Readonly<Record<string, unknown>>,
): IntakeCheckpoint {
  const at = flow.steps.findIndex((s) => s.key === target);
  if (
    at < 0 ||
    !intakeConditionMatches(flow.steps[at]!.entryCondition, answers)
  )
    throw Error("This intake step is unavailable.");
  if (
    flow.navigation === "linear" &&
    flow.steps
      .slice(0, at)
      .some(
        (s) =>
          !s.optional &&
          intakeConditionMatches(s.entryCondition, answers) &&
          !state.completed.includes(s.key),
      )
  )
    throw Error("Complete the preceding steps first.");
  return { ...state, currentStep: target };
}
export function completeIntakeStep(
  flow: EntityIntakeFlowV1,
  state: IntakeCheckpoint,
  answers: Readonly<Record<string, unknown>>,
): IntakeCheckpoint {
  const step = flow.steps.find((s) => s.key === state.currentStep);
  if (
    !step ||
    !intakeConditionMatches(step.entryCondition, answers) ||
    !intakeConditionMatches(step.completionCondition, answers)
  )
    throw Error("Complete the required information before continuing.");
  return { ...state, completed: [...new Set([...state.completed, step.key])] };
}
export function invalidateIntakeFrom(
  flow: EntityIntakeFlowV1,
  state: IntakeCheckpoint,
  key: string,
): IntakeCheckpoint {
  const at = flow.steps.findIndex((s) => s.key === key);
  if (at < 0) throw Error("Unknown intake step");
  const before = new Set(flow.steps.slice(0, at).map((s) => s.key));
  return {
    ...state,
    currentStep: key,
    completed: state.completed.filter((k) => before.has(k)),
  };
}

export function assertIntakeReadyToSubmit(
  flow: EntityIntakeFlowV1,
  state: IntakeCheckpoint,
  answers: Readonly<Record<string, unknown>>,
) {
  const active = flow.steps.filter((step) =>
    intakeConditionMatches(step.entryCondition, answers),
  );
  if (
    state.currentStep !== active.at(-1)?.key ||
    active.some(
      (step) =>
        !step.optional &&
        step.key !== state.currentStep &&
        !state.completed.includes(step.key),
    ) ||
    active.some(
      (step) => !intakeConditionMatches(step.completionCondition, answers),
    )
  )
    throw Error("Complete and validate all required steps before submitting.");
}
