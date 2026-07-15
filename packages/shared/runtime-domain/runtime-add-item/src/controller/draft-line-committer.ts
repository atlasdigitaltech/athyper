import type {
  DraftLine,
  SourceAdapterId,
  SourceSideEffect,
} from "@athyper/runtime-contracts";
import type { SourceAdapter } from "../adapter/types";

// ─────────────────────────────────────────────────────────────────────────────
// DraftLineCommitter — orchestrates the commit pipeline for a staged set of
// lines. Adapter responsibility: describe what should happen (sourceBinding
// on each line, declared side-effects). Committer responsibility: execute
// them in order, capture failures, and roll back when needed.
//
// The committer does NOT touch the parent document directly — it returns a
// CommitResult with the lines to append and the side-effect log so the
// caller (parent form / route handler) owns the actual persistence.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Selection and ParentCtx are not used by the committer (it only reads the
 * adapter id and dispatches onCommitSideEffects). `any` here is intentional:
 * a narrower constraint would force callers to up-cast their per-adapter
 * Selection/ParentCtx types into a Record<string, unknown> shape, which fails
 * variance on the way in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyAdapter<Draft extends DraftLine = DraftLine> = SourceAdapter<any, Draft, any>;

export interface CommitInput<Draft extends DraftLine = DraftLine> {
  /** Adapter that produced the line — used for side-effect dispatch. */
  adapter: AnyAdapter<Draft>;
  /** The draft line. */
  line: Draft;
}

export interface CommitOutcome<Draft extends DraftLine = DraftLine> {
  /** Lines to append to the parent draft. */
  committedLines: Draft[];
  /** Side-effects declared by adapters, in order. */
  sideEffects: SourceSideEffect[];
  /** Distinct adapter ids that contributed. */
  adapterIds: SourceAdapterId[];
}

export interface CommitFailure {
  ok: false;
  error: string;
  /** Index in the input list where the failure occurred. */
  failedAtIndex: number;
}

export type CommitResult<Draft extends DraftLine = DraftLine> =
  | ({ ok: true } & CommitOutcome<Draft>)
  | CommitFailure;

export interface CommitOptions<ParentCtx extends Record<string, unknown>> {
  parentCtx: ParentCtx;
}

/**
 * Commit a staged set of lines. Iterates over inputs in order; if any
 * declared side-effect produces a duplicate `link_source_line` binding the
 * commit is rejected so the caller can surface the conflict.
 */
export function commitStagedLines<
  Draft extends DraftLine,
  ParentCtx extends Record<string, unknown>,
>(
  inputs: ReadonlyArray<CommitInput<Draft>>,
  opts: CommitOptions<ParentCtx>,
): CommitResult<Draft> {
  const committedLines: Draft[] = [];
  const sideEffects: SourceSideEffect[] = [];
  const adapterIds = new Set<SourceAdapterId>();
  const seenSourceLines = new Set<string>();

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i]!;
    const { adapter, line } = input;

    // Guard: every committed line must carry the matching sourceBinding.
    if (line.sourceBinding?.sourceType !== adapter.manifest.id) {
      return {
        ok: false,
        error: `Draft line at index ${i} has sourceBinding.sourceType "${
          line.sourceBinding?.sourceType ?? "<missing>"
        }" but adapter is "${adapter.manifest.id}"`,
        failedAtIndex: i,
      };
    }

    // Adapter-declared side-effects.
    let effects: SourceSideEffect[];
    try {
      effects = adapter.onCommitSideEffects(
        line,
        opts.parentCtx as unknown as Record<string, unknown>,
      );
    } catch (err) {
      return {
        ok: false,
        error: `Adapter "${adapter.manifest.id}" onCommitSideEffects threw: ${
          err instanceof Error ? err.message : String(err)
        }`,
        failedAtIndex: i,
      };
    }

    // Reject duplicate link_source_line bindings within the commit set.
    for (const effect of effects) {
      if (effect.kind === "link_source_line") {
        const key = `${effect.sourceBinding.sourceType}:${
          effect.sourceBinding.sourceDocId ?? ""
        }:${effect.sourceBinding.sourceLineId ?? ""}`;
        if (seenSourceLines.has(key)) {
          return {
            ok: false,
            error: `Duplicate link_source_line binding at index ${i}: ${key}`,
            failedAtIndex: i,
          };
        }
        seenSourceLines.add(key);
      }
    }

    committedLines.push(line);
    sideEffects.push(...effects);
    adapterIds.add(adapter.manifest.id);
  }

  return {
    ok: true,
    committedLines,
    sideEffects,
    adapterIds: Array.from(adapterIds),
  };
}
