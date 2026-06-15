import type { InteractionSurfaceKind } from "@athyper/runtime-contracts";

export type StackFrameId = string;

/** A frame is a single open shell tracked by the controller. */
export interface StackFrame {
  id: StackFrameId;
  kind: InteractionSurfaceKind;
  /** Source descriptor — op key or string label, for telemetry / debug. */
  source?: string;
  /** Snapshot of dirty state, if applicable. Phase 4 wires composition. */
  dirty?: boolean;
}

/** Options accepted by `open()` / `useStackFrame()`. */
export interface OpenFrameOptions {
  kind: InteractionSurfaceKind;
  source?: string;
  dirty?: boolean;
}

/** Public controller API exposed via `useSurfaceStack()`. */
export interface SurfaceStackApi {
  /** Current stack snapshot (top is last). */
  readonly frames: ReadonlyArray<StackFrame>;
  /**
   * Push a frame. In dev, rule violations throw — making misuse loud during
   * development. In production, the open is rejected and the rejection is
   * logged via `console.warn`.
   */
  open(options: OpenFrameOptions): StackFrameId;
  /** Pop / remove a frame by id. No-op if id is not in the stack. */
  close(id: StackFrameId): void;
  /** Patch an existing frame (dirty state, source). */
  update(id: StackFrameId, patch: Partial<Pick<StackFrame, "dirty" | "source">>): void;
}

/** Result returned by `useStackFrame()` to the shell. */
export interface UseStackFrameResult {
  /** The frame's stable id (or null when open=false). */
  frameId: StackFrameId | null;
  /** True when this frame is currently the top of the stack. */
  isTop: boolean;
  /** Stack depth (1 for the bottom-most frame). 0 means not registered. */
  depth: number;
}
