/**
 * Pure evaluator for `defaults.on_source_change` rules.
 *
 * Given a set of changed fields and the current values, returns a
 * deterministic list of intents the caller should act on. The function
 * itself is pure — no I/O, no React, no DB. Async work (resolver calls,
 * refilter checks) lives in layer-specific executors that consume these
 * intents.
 *
 * Spec: docs/specs/entity_field_defaults.md
 */

import type {
  EntityFieldDefaults,
  FieldProvenance,
  OnSourceChangeAction,
  OnSourceChangeLayer,
  OnSourceChangeRule,
  OnSourceChangeWhen,
  SourceChangeIntent,
} from "./types";

export interface EvaluateSourceChangeArgs {
  /** The set of fields whose value changed in the inbound mutation. */
  changedFields:    readonly string[];
  /** Values immediately before the mutation. */
  oldValues:        Readonly<Record<string, unknown>>;
  /** Values immediately after the mutation. */
  newValues:        Readonly<Record<string, unknown>>;
  /**
   * Per-field provenance. Required for `target_was_user_overridden`
   * predicate and `mode: "if_empty_or_derived"`. Server layer passes
   * an empty object — server has no provenance.
   */
  provenance?:      Readonly<Record<string, FieldProvenance>>;
  /** Cascade rules keyed by owning (target) field name. */
  defaultsByField:  Readonly<Record<string, EntityFieldDefaults>>;
  /** Layer being evaluated; rules without this layer are skipped. */
  layer:            OnSourceChangeLayer;
  /** Optional row status used by `status_in` predicates. */
  rowStatus?:       string | null;
}

/**
 * Returns intents in deterministic order:
 *   1. by target field name (ascending)
 *   2. by action priority within a target
 *   3. by rule index within a target
 *
 * Action priority (low number = evaluated first):
 *   lock=1, clear=2, refilter=3, rederive=4, validate=5, warn=6
 *
 * The order matters because:
 *   - lock short-circuits other mutations to the same target
 *   - clear → refilter → rederive lets a refilter run on the post-clear value
 *   - validate/warn (read-only) come last
 */
const ACTION_PRIORITY: Record<OnSourceChangeAction, number> = {
  lock:     1,
  clear:    2,
  refilter: 3,
  rederive: 4,
  validate: 5,
  warn:     6,
};

export function evaluateSourceChange(args: EvaluateSourceChangeArgs): SourceChangeIntent[] {
  const {
    changedFields,
    oldValues,
    newValues,
    provenance = {},
    defaultsByField,
    layer,
    rowStatus = null,
  } = args;

  if (changedFields.length === 0) return [];

  const changedSet = new Set(changedFields);
  const collected: Array<{ intent: SourceChangeIntent; ruleIndex: number; targetKey: string }> = [];

  // Sort target keys for deterministic output.
  const targets = Object.keys(defaultsByField).sort();

  for (const target of targets) {
    const defaults = defaultsByField[target];
    const rules = defaults?.on_source_change;
    if (!rules || rules.length === 0) continue;

    rules.forEach((rule, ruleIndex) => {
      // Skip rules that don't run on this layer.
      if (!rule.layers.includes(layer)) return;

      // The rule fires only when at least one of its sources changed in this mutation.
      const triggeringSources = rule.sources.filter((s) => changedSet.has(s));
      if (triggeringSources.length === 0) return;

      // Evaluate `when` predicate.
      const whenResult = evaluateWhen(rule.when, {
        triggeringSources,
        oldValues,
        newValues,
        target,
        provenance,
        rowStatus,
        layer,
      });
      if (!whenResult.passes) return;

      collected.push({
        intent: {
          target,
          sources: rule.sources,
          action: rule.action,
          reason: whenResult.reason,
          ...(rule.resolver ? { resolver: rule.resolver } : {}),
          ...(rule.mode ? { mode: rule.mode } : {}),
          ...(rule.message ? { message: rule.message } : {}),
        },
        ruleIndex,
        targetKey: target,
      });
    });
  }

  // Stable sort: target → action priority → ruleIndex.
  collected.sort((a, b) => {
    if (a.targetKey !== b.targetKey) return a.targetKey < b.targetKey ? -1 : 1;
    const ap = ACTION_PRIORITY[a.intent.action];
    const bp = ACTION_PRIORITY[b.intent.action];
    if (ap !== bp) return ap - bp;
    return a.ruleIndex - b.ruleIndex;
  });

  return collected.map((entry) => entry.intent);
}

interface WhenContext {
  triggeringSources: string[];
  oldValues:         Readonly<Record<string, unknown>>;
  newValues:         Readonly<Record<string, unknown>>;
  target:            string;
  provenance:        Readonly<Record<string, FieldProvenance>>;
  rowStatus:         string | null;
  layer:             OnSourceChangeLayer;
}

interface WhenResult {
  passes: boolean;
  reason: SourceChangeIntent["reason"];
}

function evaluateWhen(
  when: OnSourceChangeWhen | undefined,
  ctx:  WhenContext,
): WhenResult {
  const sourceChanged = ctx.triggeringSources.some((s) =>
    !valuesEqual(ctx.oldValues[s], ctx.newValues[s]),
  );

  // Default when omitted: requires source_changed=true.
  const requireSourceChanged = when?.source_changed ?? true;
  if (requireSourceChanged && !sourceChanged) {
    return { passes: false, reason: "source_changed" };
  }

  // source_value_in / source_value_not_in evaluated against any triggering source.
  if (when?.source_value_in !== undefined) {
    const allowed = when.source_value_in;
    const anyMatches = ctx.triggeringSources.some((s) => {
      const v = ctx.newValues[s];
      if (allowed === null) return v == null;
      return Array.isArray(allowed) && allowed.includes(v as never);
    });
    if (!anyMatches) return { passes: false, reason: "source_changed" };
  }

  if (when?.source_value_not_in !== undefined && Array.isArray(when.source_value_not_in)) {
    const blocked = when.source_value_not_in;
    const anyBlocked = ctx.triggeringSources.some((s) => blocked.includes(ctx.newValues[s] as never));
    if (anyBlocked) return { passes: false, reason: "source_changed" };
  }

  // status_in
  if (when?.status_in && when.status_in.length > 0) {
    if (!ctx.rowStatus || !when.status_in.includes(ctx.rowStatus)) {
      return { passes: false, reason: "source_changed" };
    }
  }

  // target_was_user_overridden — silently ignored on server (no provenance).
  if (when?.target_was_user_overridden !== undefined) {
    if (ctx.layer === "server_on_save") {
      // Server has no provenance; skip the predicate entirely.
    } else {
      const prov = ctx.provenance[ctx.target] ?? "unset";
      const wasOverridden = prov === "user_input";
      if (when.target_was_user_overridden !== wasOverridden) {
        return { passes: false, reason: "source_changed" };
      }
    }
  }

  // Reason derivation: prefer "source_value_blank" when a triggering source
  // is now null/undefined (callers may surface different messages for that).
  const anyBlank = ctx.triggeringSources.some((s) => isBlank(ctx.newValues[s]));
  const reason: SourceChangeIntent["reason"] = anyBlank ? "source_value_blank" : "source_changed";

  return { passes: true, reason };
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

/**
 * Equality semantics for source-change detection. Primitives compared with ===.
 * Arrays compared by length + element-wise ===. Objects shallow-compared by keys.
 * Designed for typical form-values (uuid strings, numbers, booleans, simple arrays).
 */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => v === b[i]);
  }
  if (typeof a === "object" && typeof b === "object") {
    const aKeys = Object.keys(a as object);
    const bKeys = Object.keys(b as object);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);
  }
  return false;
}
