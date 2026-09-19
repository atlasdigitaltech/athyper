"use client";
import {DataValidationProvider,useDataValidation} from "./data-validation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SubmitEvent,
  type FormHTMLAttributes,
  type ReactNode,
} from "react";
import {
  intakeConditionMatches,
  type EntityIntakeFlowV1,
} from "@athyper/contract-platform-entity-runtime";
import { useRegisterEntityTaskHeader, useContextDepartureGuard } from "@athyper/platform-shell";
import { Button } from "@athyper/platform-ui";
import {
  assertIntakeReadyToSubmit,
  completeIntakeStep,
  initialIntakeCheckpoint,
  invalidateIntakeFrom,
  navigateIntake,
  type IntakeCheckpoint,
} from "./intake-state";
export {
  initialIntakeCheckpoint,
  navigateIntake,
  completeIntakeStep,
  invalidateIntakeFrom,
} from "./intake-state";
export type { IntakeCheckpoint } from "./intake-state";
interface IntakePresentation {
  readonly title?: string;
  readonly description?: string;
  readonly context?: ReactNode;
  readonly saveStatus?: ReactNode;
  readonly saveState?: "saved" | "unsaved";
  readonly compact?: boolean;
  readonly exitLabel?: string;
  readonly lockedSteps?: readonly string[];
}
interface IntakeController {
  setPresentation(value: IntakePresentation): void;
  readonly flow: EntityIntakeFlowV1;
  readonly state: IntakeCheckpoint;
  readonly busy: boolean;
  readonly sharedHeader: boolean;
  readonly lockedSteps: readonly string[];
  next(): void;
  go(key: string): void;
  invalidate(key: string): void;
  setBusy(value: boolean): void;
  markDirty(): void;
  markSaved(): void;
  assertReady(): void;
}
const EMPTY_ANSWERS = Object.freeze({});
const IntakeContext = createContext<IntakeController | undefined>(undefined);
export function useEntityIntake() {
  return useContext(IntakeContext);
}
/** Persistence is supplied by the request owner; never stores answers in browser storage. */
export function EntityIntake({
  flow,
  descriptorHash,
  answers = EMPTY_ANSWERS,
  initialCheckpoint,
  initialPresentation,
  saveCheckpoint,
  cancelHref,
  children,
}: {
  readonly flow: EntityIntakeFlowV1;
  readonly descriptorHash: string;
  readonly answers?: Readonly<Record<string, unknown>>;
  readonly initialPresentation?: IntakePresentation;
  readonly initialCheckpoint?: IntakeCheckpoint;
  readonly saveCheckpoint?: (checkpoint: IntakeCheckpoint) => Promise<void>;
  readonly cancelHref: string;
  readonly children: ReactNode;
}) {
  const [state, setState] = useState(() =>
    initialIntakeCheckpoint(flow, descriptorHash, initialCheckpoint),
  );
  const [presentation, setPresentation] = useState<IntakePresentation>(initialPresentation ?? {});
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  useContextDepartureGuard({ dirty: dirty || presentation.saveState === "unsaved", busy });
  const step = flow.steps.find((s) => s.key === state.currentStep)!;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function change(next: IntakeCheckpoint) {
    if (busy) return;
    setError(undefined);
    if (!saveCheckpoint) {
      setState(next);
      return;
    }
    setBusy(true);
    void saveCheckpoint(next)
      .then(() => {
        if (mounted.current) setState(next);
      })
      .catch((cause) => {
        if (mounted.current)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to save intake progress",
          );
      })
      .finally(() => {
        if (mounted.current) setBusy(false);
      });
  }
  function go(key: string) {
    if (presentation.lockedSteps?.includes(key)) return;
    try {
      change(navigateIntake(flow, state, key, answers));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function next() {
    try {
      const completed = completeIntakeStep(flow, state, answers);
      const following = flow.steps
        .slice(flow.steps.indexOf(step) + 1)
        .find((s) => intakeConditionMatches(s.entryCondition, answers));
      change(
        following
          ? navigateIntake(flow, completed, following.key, answers)
          : completed,
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  const navigation = (
    <nav className="athyper-section-nav a-management-navigation a-intake-progress" aria-label="Request progress">
      <ol>
        {flow.steps
          .filter((s) => intakeConditionMatches(s.entryCondition, answers))
          .map((s, index) => {
            let disabled = busy || Boolean(presentation.lockedSteps?.includes(s.key));
            try {
              navigateIntake(flow, state, s.key, answers);
            } catch {
              disabled = true;
            }
            return (
              <li key={s.key}>
                <button
                  type="button"
                  className="a-management-navigation__step"
                  disabled={disabled}
                  aria-current={
                    s.key === state.currentStep ? "step" : undefined
                  }
                  onClick={() => go(s.key)}
                >
                  <span
                    className="a-intake-progress__number"
                    aria-hidden="true"
                  >
                    {state.completed.includes(s.key) ? "✓" : index + 1}
                  </span>
                  <span>{s.title}</span>
                  {state.completed.includes(s.key) ? (
                    <span className="a-intake-progress__sr">Completed</span>
                  ) : null}
                </button>
              </li>
            );
          })}
      </ol>
    </nav>
  );
  const header = useMemo(
    () => ({
      title: presentation.title ?? flow.title,
      description: presentation.compact ? undefined : presentation.description ?? step.description ?? flow.description,
      supportingRow: presentation.compact ? <><span className="a-intake-identity">{presentation.context}</span><span className="a-intake-save-status" data-state={presentation.saveState} role="status">{presentation.saveStatus}</span></> : undefined,
      actions: (
        <a
          className="a-button a-button--secondary"
          href={cancelHref}
          onClick={(event) => {
            if (
              busy ||
              (dirty && !window.confirm("Discard the unsaved request details?"))
            )
              event.preventDefault();
          }}
        >
          {presentation.exitLabel ?? "Cancel"}
        </a>
      ),
      navigation: <>{!presentation.compact && presentation.context ? <p className="a-intake-context" role="status">{presentation.context}</p> : null}{navigation}</>,
    }),
    [flow, state, busy, step, cancelHref, answers, dirty, presentation],
  );
  const sharedHeader = useRegisterEntityTaskHeader(header);
  return (
    <IntakeContext.Provider
      value={{
        setPresentation,
        flow,
        state,
        busy,
        sharedHeader,
        lockedSteps: presentation.lockedSteps ?? [],
        next,
        go,
        invalidate: (key) => change(invalidateIntakeFrom(flow, state, key)),
        setBusy,
        markDirty: () => {
          dirtyRef.current = true;
          setDirty(true);
        },
        markSaved: () => {
          dirtyRef.current = false;
          setDirty(false);
        },
        assertReady: () => assertIntakeReadyToSubmit(flow, state, answers),
      }}
    >
      {!sharedHeader ? (
        <header>
          <h1>{header.title}</h1>
          <p>{header.description}</p>
          {header.actions}
          {header.supportingRow ? <div className="athyper-page-header__supporting-row">{header.supportingRow}</div> : null}
          {header.navigation}
        </header>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {children}
    </IntakeContext.Provider>
  );
}
export interface IntakeReviewValue {
  readonly label: string;
  readonly value: string;
}
/** Keeps controls mounted when reviewing, so Back retains values and component state. */
export function EntityIntakeForm(props: Parameters<typeof ValidatedIntakeForm>[0]) { return <DataValidationProvider><ValidatedIntakeForm {...props}/></DataValidationProvider>; }
function ValidatedIntakeForm({
  detailsStep,
  reviewStep,
  onSubmit,
  children,
  reviewValues,
  detailsBackPlacement = "after-form",
  submissionError,
  ...props
}: FormHTMLAttributes<HTMLFormElement> & {
  readonly detailsBackPlacement?: "after-form" | "custom";
  readonly detailsStep: string;
  readonly reviewStep: string;
  readonly submissionError?: string;
  readonly reviewValues?: (
    form: HTMLFormElement,
  ) => readonly IntakeReviewValue[];
}) {
  const intake = useEntityIntake();
  const validation=useDataValidation();
  const form = useRef<HTMLFormElement>(null);
  const [review, setReview] = useState<readonly IntakeReviewValue[]>([]);
  const submitting = useRef(false);
  const [submitError, setSubmitError] = useState<string>();
  if (!intake)
    return (
      <form {...props} noValidate onSubmitCapture={event=>{if(!validation?.validate()){event.preventDefault();event.stopPropagation();return;}props.onSubmitCapture?.(event);}} onSubmit={onSubmit}>
        {children}
      </form>
    );
  const reviewing = intake.state.currentStep === reviewStep;
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || intake!.busy) return;
    if (!reviewing) {
      setReview(
        reviewValues?.(event.currentTarget) ??
          readIntakeFormReview(event.currentTarget),
      );
      intake!.next();
      return;
    }
    try {
      intake!.assertReady();
    } catch (cause) {
      setSubmitError((cause as Error).message);
      return;
    }
    setSubmitError(undefined);
    submitting.current = true;
    intake!.setBusy(true);
    try {
      await onSubmit?.(event);
    } catch (cause) {
      setSubmitError(
        cause instanceof Error
          ? cause.message
          : "Unable to submit the request. Please try again.",
      );
    } finally {
      submitting.current = false;
      intake!.setBusy(false);
    }
  }
  return (
    <>
      <form
        {...props}
        ref={form}
        noValidate
        onSubmitCapture={event=>{if(!validation?.validate()){event.preventDefault();event.stopPropagation();return;}props.onSubmitCapture?.(event);}}
        onSubmit={submit}
        onChangeCapture={(event) => {
          intake.markDirty();
          props.onChangeCapture?.(event);
          if (intake.state.completed.includes(detailsStep))
            intake.invalidate(detailsStep);
        }}
      >
        <div hidden={reviewing}>{children}</div>
      </form>
      {!reviewing && detailsBackPlacement === "after-form" ? <EntityIntakeBackButton detailsStep={detailsStep} /> : null}
      {reviewing ? (
        <section className="a-intake-review" aria-label="Review request">
          <h2>Review your request</h2>
          {submitError || submissionError ? (
            <p role="alert">{submitError ?? submissionError}</p>
          ) : null}
          <dl>
            {review.map((r, i) => (
              <div key={i}>
                <dt>{r.label}</dt>
                <dd>{r.value || "—"}</dd>
              </div>
            ))}
          </dl>
          <Button
            type="button"
            variant="secondary"
            disabled={intake.busy}
            onClick={() => intake.go(detailsStep)}
          >
            Back
          </Button>{" "}
          <Button
            type="button"
            loading={intake.busy}
            disabled={intake.busy}
            onClick={() => form.current?.requestSubmit()}
          >
            Submit for approval
          </Button>
        </section>
      ) : null}
    </>
  );
}
export function readIntakeFormReview(
  form: HTMLFormElement,
): readonly IntakeReviewValue[] {
  return Array.from(form.elements).flatMap((element) => {
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      element.disabled ||
      ["hidden", "submit", "button", "file"].includes(element.type)
    )
      return [];
    if (
      element instanceof HTMLInputElement &&
      element.type === "radio" &&
      !element.checked
    )
      return [];
    const label =
      Array.from(element.labels ?? [])
        .map((l) => l.textContent?.trim())
        .filter(Boolean)
        .join(" ") ||
      element.getAttribute("aria-label") ||
      element.name;
    if (!label) return [];
    const value =
      element instanceof HTMLSelectElement
        ? Array.from(element.selectedOptions)
            .map((o) => o.text)
            .join(", ")
        : element instanceof HTMLInputElement && element.type === "checkbox"
          ? element.checked
            ? "Yes"
            : "No"
          : element instanceof HTMLInputElement && element.type === "password"
            ? "••••••"
            : element.value;
    return [{ label, value }];
  });
}

/** Save validates supplied fields while leaving submission requiredness intact. */
export function EntityDraftSaveButton({onSave, children, disabled}: {
  onSave: () => void; children: ReactNode; disabled?: boolean;
}) {
  const validation = useDataValidation();
  return <Button type="button" variant="secondary" disabled={disabled} onClick={() => {
    if (validation?.validate("draft") !== false) onSave();
  }}>{children}</Button>;
}

/** Shared previous-step action, placeable alongside a form's other actions. */
export function EntityIntakeBackButton({ detailsStep, className }: { readonly detailsStep: string; readonly className?: string }) {
  const intake = useEntityIntake();
  if (!intake) return null;
  const index = intake.flow.steps.findIndex(s => s.key === detailsStep);
  if (index <= 0) return null;
  const previous = intake.flow.steps[index - 1]!;
  return <Button type="button" variant="secondary" className={className}
    disabled={intake.busy || intake.lockedSteps.includes(previous.key)}
    onClick={() => intake.go(previous.key)}>Back</Button>;
}
