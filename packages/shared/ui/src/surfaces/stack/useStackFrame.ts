"use client";

import { useEffect, useRef, useState } from "react";
import type { InteractionSurfaceKind } from "@athyper/runtime-contracts";
import { useOptionalSurfaceStack } from "./SurfaceStackProvider";
import type { StackFrameId, UseStackFrameResult } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// useStackFrame — shells call this with their kind + open state. The hook
// registers a frame with the stack controller when `open` becomes true and
// deregisters when `open` becomes false or the component unmounts.
//
// Gracefully degrades when no provider is mounted: returns the "not registered"
// state so the shell stays usable in tests / migrations that have not wired
// the provider yet. This is deliberate — migrations land before every app
// has the provider, and the rollout must stay incremental.
//
// Implementation note: the provider's `api` value changes reference on every
// frames mutation (open/close/update). To avoid the obvious infinite-loop
// trap (register → frames change → api reference changes → effect re-fires →
// cleanup closes, re-registers, repeat), this hook keeps the stack and
// options behind refs so the registration effect's only real dependency is
// the consumer-supplied `open` prop.
// ─────────────────────────────────────────────────────────────────────────────

export interface UseStackFrameOptions {
  /** When false, the frame is not registered (shells pass their `open` prop). */
  open: boolean;
  /** The surface kind being registered. */
  kind: InteractionSurfaceKind;
  /** Optional descriptor for telemetry — usually the op key or component name. */
  source?: string;
  /** Optional dirty-state snapshot — Phase 4 controller wires composition. */
  dirty?: boolean;
}

export function useStackFrame(options: UseStackFrameOptions): UseStackFrameResult {
  const stack = useOptionalSurfaceStack();
  const { open, kind, source, dirty } = options;

  // Stable refs — read latest stack + options without making them deps.
  const stackRef = useRef(stack);
  stackRef.current = stack;
  const optionsRef = useRef({ kind, source, dirty });
  optionsRef.current = { kind, source, dirty };

  const frameIdRef = useRef<StackFrameId | null>(null);
  const [result, setResult] = useState<UseStackFrameResult>({
    frameId: null,
    isTop: false,
    depth: 0,
  });

  // Register on open=true → push frame. Cleanup deregisters. Only `open`
  // is a real dep here; the stack and kind/source/dirty are read via refs
  // so a frames-mutation-induced api reference change does not retrigger.
  useEffect(() => {
    if (!open) return;
    const live = stackRef.current;
    if (!live) return;
    const id = live.open({
      kind: optionsRef.current.kind,
      source: optionsRef.current.source,
      dirty: optionsRef.current.dirty,
    });
    frameIdRef.current = id;
    return () => {
      live.close(id);
      frameIdRef.current = null;
    };
  }, [open]);

  // Live updates to dirty / source without re-registering.
  useEffect(() => {
    const live = stackRef.current;
    const id = frameIdRef.current;
    if (!live || !id) return;
    live.update(id, { dirty, source });
  }, [dirty, source]);

  // Recompute isTop / depth on frames change. Bails out when the derived
  // shape is unchanged so the state update doesn't trigger a render churn.
  const frames = stack?.frames;
  useEffect(() => {
    const id = frameIdRef.current;
    if (!id || !frames) {
      setResult((prev) =>
        prev.frameId === null && !prev.isTop && prev.depth === 0
          ? prev
          : { frameId: null, isTop: false, depth: 0 },
      );
      return;
    }
    const idx = frames.findIndex((f) => f.id === id);
    if (idx === -1) {
      setResult((prev) =>
        prev.frameId === id && !prev.isTop && prev.depth === 0
          ? prev
          : { frameId: id, isTop: false, depth: 0 },
      );
      return;
    }
    const next: UseStackFrameResult = {
      frameId: id,
      isTop: idx === frames.length - 1,
      depth: idx + 1,
    };
    setResult((prev) =>
      prev.frameId === next.frameId &&
      prev.isTop === next.isTop &&
      prev.depth === next.depth
        ? prev
        : next,
    );
  }, [frames]);

  return result;
}
