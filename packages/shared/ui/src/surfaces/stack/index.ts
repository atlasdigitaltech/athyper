// ─────────────────────────────────────────────────────────────────────────────
// SurfaceStackController foundation. See:
//   - rules.ts          — pure stacking-rule validators
//   - types.ts          — frame + controller API shapes
//   - SurfaceStackProvider — React provider holding the live stack
//   - useStackFrame     — shell-side hook for auto-registration
// ─────────────────────────────────────────────────────────────────────────────

export {
  STACK_ORDER,
  topFrame,
  validateOpen,
  type MinimalFrame,
  type StackKind,
  type StackRuleResult,
} from "./rules";

export {
  SurfaceStackProvider,
  useSurfaceStack,
  useOptionalSurfaceStack,
  type SurfaceStackProviderProps,
} from "./SurfaceStackProvider";

export { useStackFrame, type UseStackFrameOptions } from "./useStackFrame";

export type {
  OpenFrameOptions,
  StackFrame,
  StackFrameId,
  SurfaceStackApi,
  UseStackFrameResult,
} from "./types";
