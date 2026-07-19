"use client";

import { useEffect, useRef } from "react";
import {
  RECORD_WORKSPACE_OBSERVABILITY_EVENT,
  buildRecordWorkspaceObservabilitySnapshot,
  classifyRecordWorkspaceRequest,
  type RecordWorkspaceObservedRequest,
} from "./record-workspace-observability";

interface UseRecordWorkspaceObservabilityInput {
  entityCode: string;
  recordId: string;
  recordUuid?: string | null;
  renderer: string;
  activeSurface?: string | null;
}

interface SurfaceActivation {
  atMs: number;
  surface: string;
}

/**
 * Records the browser-visible baseline for a single record workspace. It uses
 * Resource Timing instead of wrapping `fetch`, so it cannot change request
 * identity, deduplication, cache behaviour, or error handling.
 */
export function useRecordWorkspaceObservability({
  entityCode,
  recordId,
  recordUuid,
  renderer,
  activeSurface,
}: UseRecordWorkspaceObservabilityInput): void {
  const stateRef = useRef<{
    key: string;
    requests: RecordWorkspaceObservedRequest[];
    seen: Set<string>;
    surfaces: SurfaceActivation[];
    observer?: PerformanceObserver;
    emitTimer?: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || typeof performance === "undefined") return;
    const key = `${entityCode}:${recordId}:${recordUuid ?? ""}`;
    const state = {
      key,
      requests: [] as RecordWorkspaceObservedRequest[],
      seen: new Set<string>(),
      surfaces: [{ atMs: 0, surface: "core" }],
      observer: undefined as PerformanceObserver | undefined,
      emitTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    };
    stateRef.current = state;
    const bufferedEntries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const observationStartedAtMs = resolveObservationStart({
      entries: bufferedEntries,
      entityCode,
      recordIds: [recordId, recordUuid ?? ""],
    });

    const emit = () => {
      if (stateRef.current !== state) return;
      const snapshot = buildRecordWorkspaceObservabilitySnapshot({
        entityCode,
        renderer,
        recordId,
        observedAtMs: performance.now(),
        requests: state.requests,
      });
      window.dispatchEvent(new CustomEvent(RECORD_WORKSPACE_OBSERVABILITY_EVENT, { detail: snapshot }));
    };

    const scheduleEmit = () => {
      if (state.emitTimer) clearTimeout(state.emitTimer);
      state.emitTimer = setTimeout(emit, 200);
    };

    const observeEntries = (entries: readonly PerformanceResourceTiming[]) => {
      for (const entry of entries) {
        if (entry.startTime < observationStartedAtMs) continue;
        const classification = classifyRecordWorkspaceRequest({
          url: entry.name,
          entityCode,
          recordIds: [recordId, recordUuid ?? ""],
        });
        if (!classification) continue;
        const seenKey = `${entry.name}|${entry.startTime}|${entry.duration}|${entry.initiatorType}`;
        if (state.seen.has(seenKey)) continue;
        state.seen.add(seenKey);
        state.requests.push({
          ...classification,
          surface: surfaceAt(state.surfaces, entry.startTime),
          startedAtMs: round(entry.startTime),
          durationMs: round(entry.duration),
          transferBytes: safeSize(entry.transferSize),
          encodedBodyBytes: safeSize(entry.encodedBodySize),
          decodedBodyBytes: safeSize(entry.decodedBodySize),
          initiatorType: entry.initiatorType || "unknown",
          serverTiming: readServerTiming(entry),
        });
      }
      scheduleEmit();
    };

    observeEntries(bufferedEntries);
    if (typeof PerformanceObserver !== "undefined") {
      state.observer = new PerformanceObserver((list) => {
        observeEntries(list.getEntries() as PerformanceResourceTiming[]);
      });
      try {
        state.observer.observe({ type: "resource", buffered: true });
      } catch {
        state.observer.observe({ entryTypes: ["resource"] });
      }
    }
    scheduleEmit();

    return () => {
      if (state.emitTimer) clearTimeout(state.emitTimer);
      emit();
      state.observer?.disconnect();
      if (stateRef.current === state) stateRef.current = null;
    };
  }, [entityCode, recordId, recordUuid, renderer]);

  useEffect(() => {
    if (typeof performance === "undefined") return;
    const state = stateRef.current;
    if (!state) return;
    const surface = normalizeSurface(activeSurface);
    const previous = state.surfaces.at(-1);
    if (previous?.surface === surface) return;
    state.surfaces.push({ atMs: performance.now(), surface });
    try {
      performance.mark(`record-workspace:${surface}:activated`);
    } catch {
      // Baseline instrumentation is best effort.
    }
  }, [activeSurface, entityCode, recordId, recordUuid]);
}

function normalizeSurface(value: string | null | undefined): string {
  const normalized = (value ?? "details")
    .trim()
    .toLowerCase()
    .replace(/^surface_/, "")
    .replace(/[\s-]+/g, "_");
  if (normalized === "fields" || normalized === "general") return "details";
  if (normalized === "workflow" || normalized === "process") return "approvals";
  return normalized || "details";
}

function resolveObservationStart(input: {
  entries: readonly PerformanceResourceTiming[];
  entityCode: string;
  recordIds: readonly string[];
}): number {
  const aliases = input.recordIds.map((value) => value.trim()).filter(Boolean);
  const matchingStarts = input.entries
    .filter((entry) => aliases.some((value) => decodeSafely(entry.name).includes(value)))
    .map((entry) => entry.startTime);
  if (matchingStarts.length > 0) return Math.min(...matchingStarts);

  const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  if (navigation && samePath(navigation.name, window.location.href)) return navigation.startTime;

  // Client navigation can mount after its RSC request has completed. Keep a
  // narrow look-back without importing resources from the previous list page.
  return Math.max(0, performance.now() - 1_000);
}

function samePath(left: string, right: string): boolean {
  try {
    return new URL(left).pathname === new URL(right).pathname;
  } catch {
    return false;
  }
}

function decodeSafely(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function surfaceAt(history: readonly SurfaceActivation[], startedAtMs: number): string {
  let surface = history[0]?.surface ?? "core";
  for (const activation of history) {
    if (activation.atMs > startedAtMs) break;
    surface = activation.surface;
  }
  return surface;
}

function readServerTiming(entry: PerformanceResourceTiming): ReadonlyArray<{ name: string; durationMs: number }> | undefined {
  const timings = entry.serverTiming?.map((timing) => ({
    name: timing.name,
    durationMs: round(timing.duration),
  }));
  return timings && timings.length > 0 ? timings : undefined;
}

function safeSize(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function round(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
}
