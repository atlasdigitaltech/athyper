import { useId, type ReactNode } from "react";

/** Label, control, optional hint and error for one form control. The control is
 * supplied through a render prop so it receives the ids that link it to them. */
export function FormField({
  label,
  hint,
  error,
  required,
  children,
}: {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly children: (control: {
    readonly id: string;
    readonly "aria-describedby": string | undefined;
    readonly "aria-invalid": true | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="a-form-field">
      <label className="a-label" htmlFor={id}>
        {label}
        {required ? <span className="a-form-field__required" aria-hidden="true"> *</span> : null}
      </label>
      {children({
        id,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {hint ? <p id={hintId} className="a-form-field__hint">{hint}</p> : null}
      {error ? <p id={errorId} className="a-form-field__error" role="alert">{error}</p> : null}
    </div>
  );
}

/** Polite live-region status line; renders nothing visible when empty. */
export function InlineStatus({
  children,
  tone = "neutral",
}: {
  readonly children?: ReactNode;
  readonly tone?: "neutral" | "danger";
}) {
  return (
    <p role="status" className={`a-inline-status a-inline-status--${tone}`}>
      {children}
    </p>
  );
}
