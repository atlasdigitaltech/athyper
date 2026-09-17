"use client";
import * as React from "react";
import { useModalIsolation } from "@athyper/platform-ui";

/** Render recovery is local to one surface; never expose thrown diagnostic text. */
export class ShellSurfaceBoundary extends React.Component<
  {
    readonly children: React.ReactNode;
    readonly onClose: () => void;
    readonly label: string;
  },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <SurfaceError
        label={this.props.label}
        onClose={this.props.onClose}
        onRetry={() => this.setState({ failed: false })}
      />
    );
  }
}

function SurfaceError({
  label,
  onClose,
  onRetry,
}: {
  readonly label: string;
  readonly onClose: () => void;
  readonly onRetry: () => void;
}) {
  const panel = React.useRef<HTMLElement>(null);
  useModalIsolation(panel, true, { onEscape: onClose });
  return (
    <section
      ref={panel}
      role="alertdialog"
      aria-modal="true"
      className="athyper-shell__surface-error"
      aria-label={label}
    >
      <p>This panel could not be displayed.</p>
      <button type="button" onClick={onRetry}>
        Try again
      </button>
      <button type="button" onClick={onClose}>
        Close panel
      </button>
    </section>
  );
}
