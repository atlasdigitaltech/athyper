"use client";

export interface WorkspaceContextStatusProps {
  readonly status: "resolving" | "required" | "denied" | "error";
  readonly message: string;
  readonly actionLabel?: string;
  /** Opens the nav-band control's panel. This strip never renders a second selector. */
  readonly onAction?: () => void;
}

/** Compact required-context status strip replacing the page-body "Choose a work context" card (design doc §10.4). */
export function WorkspaceContextStatus({
  status,
  message,
  actionLabel,
  onAction,
}: WorkspaceContextStatusProps) {
  const alert = status === "denied" || status === "error";
  return (
    <p
      className="neon-workspace-context-status"
      data-status={status}
      role={alert ? "alert" : "status"}
      aria-live={alert ? undefined : "polite"}
    >
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </p>
  );
}
