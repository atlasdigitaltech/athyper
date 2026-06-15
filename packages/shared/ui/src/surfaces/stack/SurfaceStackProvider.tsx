"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { validateOpen } from "./rules";
import type {
  OpenFrameOptions,
  StackFrame,
  StackFrameId,
  SurfaceStackApi,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// SurfaceStackProvider — React provider holding the stack state, exposing
// the controller via `useSurfaceStack()` and supporting auto-registration
// via `useStackFrame()`.
//
// The provider is observational: it tracks open frames and validates
// stacking rules, but does NOT manage portal mounting, z-index assignment,
// or Esc routing. Each shell already handles Esc through Radix; the
// controller's job is to make stack-rule violations loud (dev throw / prod
// warn) and to give consumers introspection into open shells.
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { env: { NODE_ENV: string } };

const SurfaceStackContext = createContext<SurfaceStackApi | null>(null);

/**
 * Get the live stack controller. Throws if called outside a provider — this
 * is intentional, because every shell needs registration to participate in
 * stack-rule enforcement.
 */
export function useSurfaceStack(): SurfaceStackApi {
  const ctx = useContext(SurfaceStackContext);
  if (!ctx) {
    throw new Error(
      "useSurfaceStack must be used inside <SurfaceStackProvider>. " +
        "Wrap your app at the layout level (or in EntityWorkspaceShell).",
    );
  }
  return ctx;
}

/**
 * Get the live stack controller, returning null when no provider is mounted.
 * Shells use this so they remain usable in tests / storybook / migrations
 * that have not yet wrapped the provider.
 */
export function useOptionalSurfaceStack(): SurfaceStackApi | null {
  return useContext(SurfaceStackContext);
}

let frameIdCounter = 0;
function nextFrameId(): StackFrameId {
  frameIdCounter += 1;
  return `surface-${frameIdCounter}`;
}

export interface SurfaceStackProviderProps {
  children: ReactNode;
  /**
   * Override the rule-violation behavior. Defaults to "throw" in
   * `NODE_ENV !== "production"`, "warn" in production. Tests can pin
   * `"warn"` to assert rejection paths without try/catch noise.
   */
  onRuleViolation?: "throw" | "warn" | ((reason: string) => void);
}

export function SurfaceStackProvider({
  children,
  onRuleViolation,
}: SurfaceStackProviderProps) {
  const [frames, setFrames] = useState<ReadonlyArray<StackFrame>>([]);
  // Keep a ref to the latest frames so `open()` / `close()` see the freshest
  // stack even when called multiple times within a single tick.
  const framesRef = useRef(frames);
  framesRef.current = frames;

  const violationMode =
    onRuleViolation ??
    (typeof process !== "undefined" && process.env.NODE_ENV !== "production"
      ? "throw"
      : "warn");

  const handleViolation = useCallback(
    (reason: string) => {
      if (typeof violationMode === "function") {
        violationMode(reason);
        return;
      }
      if (violationMode === "throw") {
        throw new Error(`[SurfaceStackController] ${reason}`);
      }
      // eslint-disable-next-line no-console
      console.warn(`[SurfaceStackController] ${reason}`);
    },
    [violationMode],
  );

  const open = useCallback(
    (options: OpenFrameOptions): StackFrameId => {
      const result = validateOpen(framesRef.current, options.kind);
      if (!result.ok) {
        handleViolation(result.reason ?? "Unknown stack rule violation");
        return "";
      }
      const id = nextFrameId();
      const frame: StackFrame = {
        id,
        kind: options.kind,
        source: options.source,
        dirty: options.dirty,
      };
      const next = [...framesRef.current, frame];
      framesRef.current = next;
      setFrames(next);
      return id;
    },
    [handleViolation],
  );

  const close = useCallback((id: StackFrameId) => {
    if (!id) return;
    const next = framesRef.current.filter((f) => f.id !== id);
    if (next.length === framesRef.current.length) return;
    framesRef.current = next;
    setFrames(next);
  }, []);

  const update = useCallback(
    (id: StackFrameId, patch: Partial<Pick<StackFrame, "dirty" | "source">>) => {
      if (!id) return;
      const next = framesRef.current.map((f) =>
        f.id === id ? { ...f, ...patch } : f,
      );
      framesRef.current = next;
      setFrames(next);
    },
    [],
  );

  const api = useMemo<SurfaceStackApi>(
    () => ({
      frames,
      open,
      close,
      update,
    }),
    [frames, open, close, update],
  );

  return (
    <SurfaceStackContext.Provider value={api}>
      {children}
    </SurfaceStackContext.Provider>
  );
}
