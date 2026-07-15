"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type {
  DraftLine,
  SourceAdapterId,
  StalenessStrategy,
} from "@athyper/runtime-contracts";
import type { SourceAdapter, SourceQuery } from "../adapter/types";
import type { SourceAdapterRegistry } from "../adapter/registry";
import {
  commitStagedLines,
  type AnyAdapter,
  type CommitResult,
} from "./draft-line-committer";
import type { TelemetryDispatcher } from "../telemetry";

// ─────────────────────────────────────────────────────────────────────────────
// AddItemController — orchestrates the pick → stage → fill → commit pipeline
// across multiple source adapters in a single staging session.
//
// State machine (simplified):
//   idle                — no picker open, stagedLines is the working set
//   picking(adapterId)  — picker UI is open for a chosen adapter
//   committing          — commit() in flight; further mutations rejected
//
// Multi-source staging: stageLine() can be called many times against
// different adapters; the working set accumulates until commit() flushes it.
// ─────────────────────────────────────────────────────────────────────────────

export interface StagedEntry<Draft extends DraftLine = DraftLine> {
  /** Stable id assigned by the controller (used for remove / replace). */
  id: string;
  /** The adapter that produced the line — kept so commit can call its hooks. */
  adapterId: SourceAdapterId;
  /** The draft line ready for commit. */
  line: Draft;
}

export type ControllerStatus = "idle" | "picking" | "committing";

export interface AddItemControllerOptions<
  ParentCtx extends Record<string, unknown>,
> {
  registry: SourceAdapterRegistry;
  parentCtx: ParentCtx;
  /** Optional permission checker for the picker chooser. */
  hasPermission?: (code: string) => boolean;
  telemetry?: TelemetryDispatcher;
}

export interface AddItemController<
  Draft extends DraftLine = DraftLine,
> {
  /** Adapters visible to the current user (permission-filtered). */
  availableAdapters: SourceAdapter[];
  /** Currently open picker adapter id, or null. */
  activeAdapterId: SourceAdapterId | null;
  /** Working set, in insertion order. */
  stagedLines: ReadonlyArray<StagedEntry<Draft>>;
  /** Coarse status for UI binding. */
  status: ControllerStatus;

  /** Open the picker for an adapter. Emits picker.open. */
  openPicker(adapterId: SourceAdapterId): void;
  /** Close the picker without staging anything. */
  cancelPicker(): void;

  /** Run a fetch against the active picker's adapter. Emits picker.fetch.{ok,fail}. */
  fetchActive(query: SourceQuery): Promise<unknown>;

  /**
   * Stage a fully-prepared draft line. The caller (picker UI) is responsible
   * for running the adapter's toDraftShape → resolveDefaults → applyParentContext
   * pipeline; the controller treats the resulting line as opaque.
   */
  stageLine(adapter: SourceAdapter, line: Draft): string;

  /** Remove a staged entry by id. No-op if not present. */
  removeStagedLine(id: string): void;

  /** Clear the working set without committing. */
  resetStaging(): void;

  /**
   * Validate staleness for every staged line via adapter.isStillValid; apply
   * the per-adapter stalenessStrategy when an invalid line is found, then
   * commit the surviving set. Emits commit.{ok,fail,stale}.
   */
  commit(): Promise<CommitResult<Draft>>;
}

let entryCounter = 0;
function nextEntryId(): string {
  entryCounter += 1;
  return `staged-${entryCounter}`;
}

export function useAddItemController<
  Draft extends DraftLine = DraftLine,
  ParentCtx extends Record<string, unknown> = Record<string, unknown>,
>(options: AddItemControllerOptions<ParentCtx>): AddItemController<Draft> {
  const { registry, parentCtx, hasPermission, telemetry } = options;

  // Keep options live so callbacks don't capture stale closures.
  const parentCtxRef = useRef(parentCtx);
  parentCtxRef.current = parentCtx;
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;

  const [activeAdapterId, setActiveAdapterId] = useState<SourceAdapterId | null>(null);
  const [stagedLines, setStagedLines] = useState<StagedEntry<Draft>[]>([]);
  const [status, setStatus] = useState<ControllerStatus>("idle");

  const availableAdapters = useMemo(
    () => registry.list({ hasPermission }),
    [registry, hasPermission],
  );

  const openPicker = useCallback(
    (adapterId: SourceAdapterId) => {
      const adapter = registry.get(adapterId);
      if (!adapter) return;
      setActiveAdapterId(adapterId);
      setStatus("picking");
      telemetryRef.current?.emit({ type: "picker.open", adapterId });
    },
    [registry],
  );

  const cancelPicker = useCallback(() => {
    setActiveAdapterId(null);
    setStatus((s) => (s === "picking" ? "idle" : s));
  }, []);

  const fetchActive = useCallback(
    async (query: SourceQuery) => {
      const id = activeAdapterId;
      if (!id) throw new Error("No active picker — call openPicker first");
      const adapter = registry.get(id);
      if (!adapter) throw new Error(`Adapter "${id}" not registered`);
      const started = Date.now();
      try {
        const page = await adapter.fetch(query, parentCtxRef.current as never);
        telemetryRef.current?.emit({
          type: "picker.fetch.ok",
          adapterId: id,
          durationMs: Date.now() - started,
          itemCount: page.items.length,
        });
        return page;
      } catch (err) {
        telemetryRef.current?.emit({
          type: "picker.fetch.fail",
          adapterId: id,
          durationMs: Date.now() - started,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
    [activeAdapterId, registry],
  );

  const stageLine = useCallback((adapter: SourceAdapter, line: Draft): string => {
    if (line.sourceBinding?.sourceType !== adapter.manifest.id) {
      throw new Error(
        `stageLine: sourceBinding.sourceType "${
          line.sourceBinding?.sourceType ?? "<missing>"
        }" does not match adapter "${adapter.manifest.id}"`,
      );
    }
    const id = nextEntryId();
    setStagedLines((prev) => [...prev, { id, adapterId: adapter.manifest.id, line }]);
    return id;
  }, []);

  const removeStagedLine = useCallback((id: string) => {
    setStagedLines((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const resetStaging = useCallback(() => {
    setStagedLines([]);
    setActiveAdapterId(null);
    setStatus("idle");
  }, []);

  const commit = useCallback(async (): Promise<CommitResult<Draft>> => {
    setStatus("committing");
    try {
      // Resolve adapters now so we can run isStillValid + commit pipeline.
      const entries = stagedLines;
      const ctx = parentCtxRef.current;
      const surviving: { adapter: AnyAdapter<Draft>; line: Draft }[] = [];
      // Group staleness rejections by adapter so telemetry is per-source.
      const staleByAdapter = new Map<SourceAdapterId, { count: number; strategy: StalenessStrategy }>();

      for (const entry of entries) {
        const adapter = registry.get(entry.adapterId);
        if (!adapter) {
          return {
            ok: false,
            error: `Adapter "${entry.adapterId}" disappeared from the registry between stage and commit`,
            failedAtIndex: entries.indexOf(entry),
          };
        }
        const validation = await adapter.isStillValid(
          entry.line,
          ctx as unknown as Record<string, unknown>,
        );
        const typedAdapter = adapter as AnyAdapter<Draft>;
        if (!validation.ok) {
          const strategy = adapter.manifest.stalenessStrategy;
          const prev = staleByAdapter.get(adapter.manifest.id);
          staleByAdapter.set(adapter.manifest.id, {
            count: (prev?.count ?? 0) + 1,
            strategy,
          });
          if (strategy === "fail") {
            telemetryRef.current?.emit({
              type: "commit.stale",
              adapterId: adapter.manifest.id,
              strategy,
              lineCount: 1,
            });
            telemetryRef.current?.emit({
              type: "commit.fail",
              adapterIds: [adapter.manifest.id],
              error: `Stale line under fail strategy: ${
                validation.issues?.map((i) => i.message).join("; ") ?? "isStillValid returned ok:false"
              }`,
            });
            return {
              ok: false,
              error: `Adapter "${adapter.manifest.id}" rejected a staged line as stale (strategy=fail)`,
              failedAtIndex: entries.indexOf(entry),
            };
          }
          // strategy=warn → emit + include
          // strategy=refresh → emit; caller is expected to handle (the
          //   surface contract delegates the actual refresh fetch to the
          //   consumer; the committer treats it as warn at this layer).
          if (strategy === "warn" || strategy === "refresh") {
            // Include the line — it still goes in. Caller sees the
            // commit.stale telemetry and may surface a warning.
            surviving.push({ adapter: typedAdapter, line: entry.line });
            continue;
          }
        }
        surviving.push({ adapter: typedAdapter, line: entry.line });
      }

      // Emit per-adapter stale events.
      for (const [adapterId, info] of staleByAdapter.entries()) {
        if (info.strategy === "fail") continue; // already emitted on fast-path
        telemetryRef.current?.emit({
          type: "commit.stale",
          adapterId,
          strategy: info.strategy,
          lineCount: info.count,
        });
      }

      const result = commitStagedLines(
        surviving.map((s) => ({ adapter: s.adapter, line: s.line })),
        { parentCtx: ctx },
      );

      if (result.ok) {
        telemetryRef.current?.emit({
          type: "commit.ok",
          adapterIds: result.adapterIds,
          lineCount: result.committedLines.length,
        });
        // Successful commit clears the staging set.
        setStagedLines([]);
        setActiveAdapterId(null);
      } else {
        telemetryRef.current?.emit({
          type: "commit.fail",
          adapterIds: Array.from(new Set(surviving.map((s) => s.adapter.manifest.id))),
          error: result.error,
        });
      }
      return result;
    } finally {
      setStatus("idle");
    }
  }, [registry, stagedLines]);

  return {
    availableAdapters,
    activeAdapterId,
    stagedLines,
    status,
    openPicker,
    cancelPicker,
    fetchActive,
    stageLine,
    removeStagedLine,
    resetStaging,
    commit,
  };
}
