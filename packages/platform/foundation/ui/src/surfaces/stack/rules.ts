import {
  INTERACTION_SURFACE_CLASS,
  type InteractionSurfaceKind,
  type InteractionSurfaceClass,
} from "@athyper/runtime-contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Stack rules — pure logic, no React. Reused by the live controller and any
// tooling that wants to validate hypothetical stacks (storybook, docs, lint).
// The rules implement the standard documented in
// athyper-surface-standard.md §4.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Allowed stacking order. Higher values may host lower values.
 *
 *   page (0) -> overlay (1) -> drawer (2) -> selection (3) -> confirmation (4)
 *
 * The numeric value is intentionally tied to InteractionSurfaceClass, not
 * InteractionSurfaceKind, because drawer-form and drawer-peek occupy the same
 * slot (and the drawer-class invariant below forbids stacking them).
 */
export const STACK_ORDER: Record<InteractionSurfaceClass, number> = {
  destination: 0,
  parent_bound_full: 1,
  drawer: 2,
  selection: 3,
  confirmation: 4,
};

/**
 * Per-kind tag carried by frames for telemetry and stack introspection.
 * The controller uses `INTERACTION_SURFACE_CLASS[kind]` for ordering checks;
 * this map exists so dev tools can render the class name without recomputing.
 */
export type StackKind = InteractionSurfaceKind;

export interface MinimalFrame {
  kind: StackKind;
}

export interface StackRuleResult {
  ok: boolean;
  /** Machine-readable reason code. */
  code?:
    | "ok"
    | "out_of_order"
    | "drawer_in_drawer"
    | "duplicate_dialog_confirm"
    | "page_in_stack";
  /** Human-readable explanation. */
  reason?: string;
}

/**
 * Validate opening `kind` on top of the current stack. Returns `ok: true`
 * when the open is allowed, otherwise a structured rejection.
 */
export function validateOpen(
  current: ReadonlyArray<MinimalFrame>,
  kind: StackKind,
): StackRuleResult {
  // Pages do not enter the stack — they're route-level and a Next.js
  // segment hosts them. Trying to push a page is a controller misuse.
  if (kind === "page") {
    return {
      ok: false,
      code: "page_in_stack",
      reason: "PageShell is mounted by routing, not by the surface stack",
    };
  }

  const newClass = INTERACTION_SURFACE_CLASS[kind];
  const newOrder = STACK_ORDER[newClass];

  // Rule §4 — max one drawer-class surface open at a time. Checked BEFORE
  // the order rule so the more actionable error message wins when both
  // apply (e.g., opening drawer-form while a modal-select sits on top of
  // an existing drawer-form). The user-facing fix is the same: don't open
  // a second drawer.
  if (newClass === "drawer") {
    const hasDrawer = current.some(
      (f) => INTERACTION_SURFACE_CLASS[f.kind] === "drawer",
    );
    if (hasDrawer) {
      return {
        ok: false,
        code: "drawer_in_drawer",
        reason:
          "Drawer-in-drawer is prohibited. Use modal-select, inline section, or expand-to-page.",
      };
    }
  }

  // Rule §4.1 — stacking order. Lower kinds cannot stack on higher kinds.
  const top = current.length > 0 ? current[current.length - 1] : undefined;
  if (top) {
    const topClass = INTERACTION_SURFACE_CLASS[top.kind];
    const topOrder = STACK_ORDER[topClass];
    if (newOrder < topOrder) {
      return {
        ok: false,
        code: "out_of_order",
        reason: `Cannot open ${kind} (${newClass}) over ${top.kind} (${topClass}) — stacking order violation`,
      };
    }
  }

  // dialog-confirm is intentionally allowed to stack on itself in principle
  // (e.g., type-switch warning on top of an already-open confirmation when
  // an action triggers another). We do NOT enforce uniqueness — features
  // that need uniqueness implement it themselves.

  return { ok: true, code: "ok" };
}

/**
 * Convenience: get the top frame, or null if the stack is empty.
 */
export function topFrame<T extends MinimalFrame>(
  current: ReadonlyArray<T>,
): T | null {
  // Length-checked indexed access is safe; the cast satisfies strict
  // `noUncheckedIndexedAccess` without runtime cost.
  return current.length > 0 ? (current[current.length - 1] as T) : null;
}
