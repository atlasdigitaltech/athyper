import { type ReactNode, type CSSProperties } from "react";
import { Lock, EyeOff, ShieldAlert, Sparkles, Cpu, CircleHelp } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";
import {
  FIELD_ROW_SPACING,
  type FieldRowDensity,
  type LockedFieldReason,
} from "./types";

/**
 * FieldRow — a label + value row with guaranteed height parity between
 * Read and Edit variants.
 *
 * Invariant: switching the inner `<FieldRow.Read>` ↔ `<FieldRow.Edit>` at
 * the same density MUST NOT change row height. The container fixes
 * `min-height` via CSS variable; subcomponents inherit and never override it.
 *
 * Reusable across neon / mesh / admin. No app-specific dependencies.
 *
 * @example
 * <FieldRow>
 *   <FieldRow.Label htmlFor="supplier">Supplier</FieldRow.Label>
 *   {editMode && mask.editable ? (
 *     <FieldRow.Edit error={errors.supplier}>
 *       <SupplierPicker id="supplier" value={value} onChange={onChange} />
 *     </FieldRow.Edit>
 *   ) : (
 *     <FieldRow.Read reason={mask.reason} reasonMessage={mask.message}>
 *       {value ?? "—"}
 *     </FieldRow.Read>
 *   )}
 * </FieldRow>
 */
export interface FieldRowProps {
  children: ReactNode;
  density?: FieldRowDensity;
  /** Visual emphasis when row has unsaved changes. */
  dirty?: boolean;
  /** Visual emphasis when row has a validation error. */
  invalid?: boolean;
  /** Override label column width. Defaults to `--field-row-label-width` (10rem). */
  labelWidth?: string;
  className?: string;
}

function FieldRowRoot({
  children,
  density = "default",
  dirty,
  invalid,
  labelWidth,
  className,
}: FieldRowProps) {
  const spacing = FIELD_ROW_SPACING[density];
  const style: CSSProperties = {
    minHeight: spacing.minHeight,
    gridTemplateColumns: `${labelWidth ?? "var(--field-row-label-width, 10rem)"} minmax(0, 1fr)`,
  };
  return (
    <div
      data-field-row=""
      data-density={density}
      data-dirty={dirty ? "" : undefined}
      data-invalid={invalid ? "" : undefined}
      style={style}
      className={cn(
        "grid items-center gap-3 px-2",
        "border-b border-border/50 last:border-b-0",
        dirty && "bg-primary/[0.03]",
        invalid && "bg-destructive/[0.04]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface FieldRowLabelProps {
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  helpText?: string;
  className?: string;
}

function FieldRowLabel({ children, htmlFor, required, helpText, className }: FieldRowLabelProps) {
  return (
    <label
      htmlFor={htmlFor}
      data-field-label=""
      className={cn(
        "truncate text-sm text-muted-foreground",
        "flex items-center min-w-0",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {required && (
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      )}
      {helpText && (
        <span title={helpText} className="ml-1 inline-flex shrink-0">
          <CircleHelp aria-hidden="true" className="size-3.5 opacity-60" />
          <span className="sr-only">{helpText}</span>
        </span>
      )}
    </label>
  );
}

export interface FieldRowReadProps {
  children: ReactNode;
  /** Reason this field is rendered read-only. Drives icon + tooltip. */
  reason?: LockedFieldReason;
  /** Tooltip text shown on hover when `reason` is set. */
  reasonMessage?: string;
  /** Render the empty placeholder ("—") regardless of children. */
  empty?: boolean;
  inherited?: boolean;
  sourceLabel?: string;
  auditLabel?: string;
  className?: string;
}

const REASON_ICON: Record<LockedFieldReason, typeof Lock> = {
  status_locked: Lock,
  permission_locked: ShieldAlert,
  pii_masked: EyeOff,
  readonly: Lock,
  computed: Sparkles,
  system: Cpu,
};

const REASON_DEFAULT_MESSAGE: Record<LockedFieldReason, string> = {
  status_locked: "Locked — not editable in current status",
  permission_locked: "Locked — your role does not permit edit",
  pii_masked: "Masked — request access to unmask",
  readonly: "Read-only field",
  computed: "Computed value",
  system: "System-managed field",
};

function FieldRowRead({
  children,
  reason,
  reasonMessage,
  empty,
  inherited,
  sourceLabel,
  auditLabel,
  className,
}: FieldRowReadProps) {
  const Icon = reason ? REASON_ICON[reason] : null;
  const title = reasonMessage ?? (reason ? REASON_DEFAULT_MESSAGE[reason] : undefined);

  return (
    <div
      data-field-read=""
      data-reason={reason}
      data-inherited={inherited ? "" : undefined}
      title={[title, sourceLabel && `Source: ${sourceLabel}`, auditLabel].filter(Boolean).join(" · ") || undefined}
      className={cn(
        "flex h-full min-w-0 items-center gap-1.5 text-sm",
        empty && "italic text-muted-foreground",
        reason && "text-muted-foreground",
        className,
      )}
    >
      <span className="min-w-0 truncate">{empty ? "—" : children}</span>
      {Icon && (
        <Icon
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-60"
        />
      )}
      {inherited && <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Inherited</span>}
      {sourceLabel && <span className="sr-only">Source: {sourceLabel}</span>}
      {auditLabel && <span className="sr-only">{auditLabel}</span>}
    </div>
  );
}

export interface FieldRowEditProps {
  children: ReactNode;
  /** Validation error message; renders inline beside the input. */
  error?: string;
  /** Indicates the field has unsaved local changes. */
  dirty?: boolean;
  errorId?: string;
  className?: string;
}

function FieldRowEdit({ children, error, dirty, errorId, className }: FieldRowEditProps) {
  return (
    <div
      data-field-edit=""
      data-dirty={dirty ? "" : undefined}
      data-error={error ? "" : undefined}
      className={cn(
        "flex h-full min-w-0 items-center gap-2",
        className,
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {error && (
        <span id={errorId} role="alert" className="shrink-0 text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}

/** Compound primitive — see {@link FieldRowRoot} for the contract. */
export const FieldRow = Object.assign(FieldRowRoot, {
  Label: FieldRowLabel,
  Read: FieldRowRead,
  Edit: FieldRowEdit,
});
