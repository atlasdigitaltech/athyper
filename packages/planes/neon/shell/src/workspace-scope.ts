/**
 * Phase 1 (business-context-selector-design.md §10.1-10.2) shared scope state.
 * One committed Company Code / Operating Organization coordinate, edited through
 * a single pending transaction shared by the nav-band control and the Filters
 * "Work context" group, so the two surfaces can never diverge into separate drafts.
 */
export type WorkspaceScopeCoordinate = Readonly<
  | { mode: "unresolved" }
  | { mode: "resolved"; companyCodeId?: string; operatingOrganizationId?: string }
>;

export type WorkspaceScopeSurface = "navigation" | "filters";

export interface WorkspaceScopeState {
  readonly committed: WorkspaceScopeCoordinate;
  /** Present only while a panel/drawer is open and edited. */
  readonly pending?: WorkspaceScopeCoordinate;
  /** The surface that most recently opened the shared pending edit. */
  readonly editingSurface?: WorkspaceScopeSurface;
}

export const UNRESOLVED: WorkspaceScopeCoordinate = Object.freeze({
  mode: "unresolved",
});

export function resolvedCoordinate(
  companyCodeId?: string,
  operatingOrganizationId?: string,
): WorkspaceScopeCoordinate {
  return companyCodeId || operatingOrganizationId
    ? Object.freeze({ mode: "resolved", companyCodeId, operatingOrganizationId })
    : UNRESOLVED;
}

export function coordinatesEqual(
  left: WorkspaceScopeCoordinate,
  right: WorkspaceScopeCoordinate,
): boolean {
  if (left.mode !== right.mode) return false;
  if (left.mode === "unresolved") return true;
  const a = left as Extract<WorkspaceScopeCoordinate, { mode: "resolved" }>;
  const b = right as Extract<WorkspaceScopeCoordinate, { mode: "resolved" }>;
  return (
    (a.companyCodeId ?? "") === (b.companyCodeId ?? "") &&
    (a.operatingOrganizationId ?? "") === (b.operatingOrganizationId ?? "")
  );
}

export interface WorkspaceScopeController {
  getSnapshot(): WorkspaceScopeState;
  subscribe(listener: () => void): () => void;
  /** Opens (or continues) the one shared pending edit. Never starts a second, divergent draft. */
  beginEdit(surface: WorkspaceScopeSurface): void;
  updatePending(next: WorkspaceScopeCoordinate): void;
  /** Validates pending against the current catalog; commits and clears pending on success. */
  apply(): boolean;
  discardPending(): void;
  /** Resolves the configured default or clears; never produces a wider-than-authorized selection. */
  reset(): void;
}

export interface WorkspaceScopeControllerOptions {
  readonly initial?: WorkspaceScopeCoordinate;
  /** Re-evaluated at apply() time so it always reflects the live catalog, not a stale snapshot. */
  isCompatible(candidate: WorkspaceScopeCoordinate): boolean;
  defaultCoordinate?(): WorkspaceScopeCoordinate;
  /** Side-effect hook fired after a successful commit (apply/reset), e.g. writing an adapter. */
  onCommit?(committed: WorkspaceScopeCoordinate): void;
}

export function createWorkspaceScopeController(
  options: WorkspaceScopeControllerOptions,
): WorkspaceScopeController {
  let state: WorkspaceScopeState = {
    committed: options.initial ?? UNRESOLVED,
  };
  const listeners = new Set<() => void>();
  const publish = (next: WorkspaceScopeState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    beginEdit(surface) {
      // A pending edit already open (from either surface) is continued, never replaced.
      publish({
        ...state,
        pending: state.pending ?? state.committed,
        editingSurface: surface,
      });
    },
    updatePending(next) {
      if (!state.pending) return;
      publish({ ...state, pending: next });
    },
    apply() {
      if (!state.pending) return false;
      if (!options.isCompatible(state.pending)) return false;
      const committed = state.pending;
      publish({ committed });
      options.onCommit?.(committed);
      return true;
    },
    discardPending() {
      if (!state.pending && state.editingSurface === undefined) return;
      publish({ committed: state.committed });
    },
    reset() {
      const committed = options.defaultCoordinate?.() ?? UNRESOLVED;
      publish({ committed });
      options.onCommit?.(committed);
    },
  };
}
