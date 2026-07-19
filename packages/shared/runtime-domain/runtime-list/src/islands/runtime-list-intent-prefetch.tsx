"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type { FocusEvent, MouseEvent, PointerEvent } from "react";

export const RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT = "athyper:runtime-list-prefetch";

export interface RuntimeListIntentPrefetchTarget {
  entityCode: string;
  href: string;
  label: string;
  policy: {
    mode: "disabled" | "memory" | "stale_while_revalidate";
    prefetch: "none" | "intent" | "viewport" | "eager";
  };
}

interface RuntimeListPrefetchMeasurement {
  entityCode: string;
  href: string;
  intent: "hover" | "focus";
  startedAt: number;
}

const HOVER_INTENT_DELAY_MS = 60;

export function RuntimeListIntentPrefetchLinks({
  targets,
}: {
  targets: RuntimeListIntentPrefetchTarget[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" data-runtime-list-intent-prefetch-links>
      {targets.map((target) => (
        <RuntimeListIntentPrefetchLink key={`${target.entityCode}:${target.href}`} target={target} />
      ))}
    </div>
  );
}

export function RuntimeListIntentPrefetchLink({
  target,
}: {
  target: RuntimeListIntentPrefetchTarget;
}) {
  const router = useRouter();
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduledRef = useRef(false);
  const eligible = isIntentPrefetchEligible(target);

  const cancelHover = useCallback(() => {
    if (!hoverTimerRef.current) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const schedule = useCallback((intent: RuntimeListPrefetchMeasurement["intent"]) => {
    if (!eligible || scheduledRef.current) {
      reportPrefetchDiagnostic({
        entityCode: target.entityCode,
        href: target.href,
        stage: scheduledRef.current ? "deduplicated" : "bypassed",
        intent,
      });
      return;
    }

    scheduledRef.current = true;
    const startedAt = performance.now();
    const measurement: RuntimeListPrefetchMeasurement = {
      entityCode: target.entityCode,
      href: target.href,
      intent,
      startedAt: Date.now(),
    };
    writePrefetchMeasurement(measurement);
    try {
      performance.mark(prefetchMark(target.entityCode, "start"));
    } catch {
      // Performance marks are optional diagnostics.
    }
    router.prefetch(target.href);
    try {
      performance.mark(prefetchMark(target.entityCode, "scheduled"));
      performance.measure(
        prefetchMeasure(target.entityCode, "schedule"),
        prefetchMark(target.entityCode, "start"),
        prefetchMark(target.entityCode, "scheduled"),
      );
    } catch {
      // Performance marks are optional diagnostics.
    }
    reportPrefetchDiagnostic({
      entityCode: target.entityCode,
      href: target.href,
      stage: "scheduled",
      intent,
      durationMs: performance.now() - startedAt,
    });
  }, [eligible, router, target.entityCode, target.href]);

  const onPointerEnter = useCallback((_event: PointerEvent<HTMLAnchorElement>) => {
    if (!eligible || scheduledRef.current || hoverTimerRef.current) return;
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      schedule("hover");
    }, HOVER_INTENT_DELAY_MS);
  }, [eligible, schedule]);

  const onFocus = useCallback((_event: FocusEvent<HTMLAnchorElement>) => {
    cancelHover();
    schedule("focus");
  }, [cancelHover, schedule]);

  const onClick = useCallback((_event: MouseEvent<HTMLAnchorElement>) => {
    cancelHover();
    const measurement = readPrefetchMeasurement(target.entityCode);
    reportPrefetchDiagnostic({
      entityCode: target.entityCode,
      href: target.href,
      stage: "navigation",
      intent: measurement?.intent,
      leadTimeMs: measurement ? Math.max(0, Date.now() - measurement.startedAt) : undefined,
    });
  }, [cancelHover, target.entityCode, target.href]);

  useEffect(() => cancelHover, [cancelHover]);

  return (
    <Link
      className="rounded-md border border-border/70 bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      href={target.href}
      onBlur={cancelHover}
      onClick={onClick}
      onFocus={onFocus}
      onPointerEnter={onPointerEnter}
      onPointerLeave={cancelHover}
      prefetch={false}
    >
      {target.label}
    </Link>
  );
}

export function isIntentPrefetchEligible(target: RuntimeListIntentPrefetchTarget): boolean {
  return target.policy.mode !== "disabled" && target.policy.prefetch === "intent";
}

export function consumeRuntimeListPrefetchMeasurement(entityCode: string): RuntimeListPrefetchMeasurement | null {
  const measurement = readPrefetchMeasurement(entityCode);
  if (!measurement) return null;
  try {
    window.sessionStorage.removeItem(prefetchStorageKey(entityCode));
  } catch {
    // Measurement storage is best-effort.
  }
  return measurement;
}

function reportPrefetchDiagnostic(input: {
  entityCode: string;
  href: string;
  stage: "scheduled" | "deduplicated" | "bypassed" | "navigation";
  intent?: RuntimeListPrefetchMeasurement["intent"];
  durationMs?: number;
  leadTimeMs?: number;
}): void {
  window.dispatchEvent(new CustomEvent(RUNTIME_LIST_PREFETCH_DIAGNOSTIC_EVENT, {
    detail: { ...input, observedAt: Date.now() },
  }));
}

function writePrefetchMeasurement(measurement: RuntimeListPrefetchMeasurement): void {
  try {
    window.sessionStorage.setItem(
      prefetchStorageKey(measurement.entityCode),
      JSON.stringify(measurement),
    );
  } catch {
    // Hardened and quota-limited browsers still receive router prefetch.
  }
}

function readPrefetchMeasurement(entityCode: string): RuntimeListPrefetchMeasurement | null {
  try {
    const raw = window.sessionStorage.getItem(prefetchStorageKey(entityCode));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<RuntimeListPrefetchMeasurement>;
    if (
      typeof value.entityCode !== "string" ||
      typeof value.href !== "string" ||
      (value.intent !== "hover" && value.intent !== "focus") ||
      typeof value.startedAt !== "number"
    ) return null;
    return value as RuntimeListPrefetchMeasurement;
  } catch {
    return null;
  }
}

function prefetchStorageKey(entityCode: string): string {
  return `athyper:runtime-list-prefetch:${entityCode}`;
}

function prefetchMark(entityCode: string, stage: string): string {
  return `athyper:runtime-list:prefetch:${entityCode}:${stage}`;
}

function prefetchMeasure(entityCode: string, stage: string): string {
  return `athyper:runtime-list:prefetch:${entityCode}:${stage}`;
}
