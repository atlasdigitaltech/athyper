import type { ReactNode } from "react";

export type PageResourceStatus = "loading" | "error" | "empty" | "ready";

export interface PageResourceBoundaryProps {
  readonly status: PageResourceStatus;
  readonly loading: ReactNode;
  readonly error: ReactNode;
  readonly empty: ReactNode;
  readonly children: ReactNode;
}

/**
 * Four states, matching what existing Business Partner detail/edit surfaces already branch on by hand —
 * not the full forbidden/not-found taxonomy, since nothing here differentiates those from "empty" yet.
 * Loading marks the region aria-busy; none of the extracted call sites had that. Not role="status" — the
 * supplied skeleton already carries its own accessible label(s), and wrapping in a live region on top of
 * that would announce them all concatenated rather than one clear message.
 */
export function PageResourceBoundary({ status, loading, error, empty, children }: PageResourceBoundaryProps) {
  if (status === "loading") return <div aria-busy="true">{loading}</div>;
  if (status === "error") return <>{error}</>;
  if (status === "empty") return <>{empty}</>;
  return <>{children}</>;
}
