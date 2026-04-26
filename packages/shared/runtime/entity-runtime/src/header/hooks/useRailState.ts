"use client";

import { useState, useRef, useEffect } from "react";
import type { HeaderProgress } from "../types";

export interface RailState {
  expanded: boolean;
  toggle: () => void;
}

/**
 * Manages the rail expanded/collapsed state with kind-aware defaults.
 *
 * wizard    → auto-open when stages.length ≤ 5 (users need to see the full path)
 * lifecycle → auto-open when stepIndex ≤ 1 && stages.length ≥ 4 (early + complex)
 *
 * Preserves explicit user toggle intent: once the user interacts, async
 * data arrival no longer forces the state open.
 */
export function useRailState(progress: HeaderProgress | undefined): RailState {
  const userTouched = useRef(false);

  const shouldAutoOpen = !!progress && (
    progress.kind === "wizard"
      ? progress.stages.length <= 5
      : progress.stepIndex <= 1 && progress.stages.length >= 4
  );

  const [expanded, setExpanded] = useState(shouldAutoOpen);

  useEffect(() => {
    if (!userTouched.current && shouldAutoOpen) setExpanded(true);
  }, [shouldAutoOpen]);

  const toggle = () => {
    userTouched.current = true;
    setExpanded(v => !v);
  };

  return { expanded, toggle };
}
