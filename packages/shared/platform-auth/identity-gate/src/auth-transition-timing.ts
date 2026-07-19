"use client";

import { useEffect, useState } from "react";

/**
 * Keeps branded authentication transitions intentional without making normal
 * application navigation artificially slow. This covers one complete loader
 * orbit and applies only to authentication surfaces and redirects.
 */
export const AUTH_TRANSITION_MIN_MS = 1_500;

export function useMinimumAuthReveal(minimumMs = AUTH_TRANSITION_MIN_MS): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), minimumMs);
    return () => window.clearTimeout(timer);
  }, [minimumMs]);

  return ready;
}

export function waitForMinimumAuthTransition(
  startedAt: number,
  minimumMs = AUTH_TRANSITION_MIN_MS,
): Promise<void> {
  const remainingMs = Math.max(0, minimumMs - (Date.now() - startedAt));
  if (remainingMs === 0) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, remainingMs));
}
