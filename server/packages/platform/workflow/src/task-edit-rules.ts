import type { PolicyDecision } from "@athyper/server-contract-policy";
import type { TaskEditDecision, TaskEditOutcome, TaskFieldChange, TaskRuleRevision } from "@athyper/server-contract-workflow";
import { WorkflowError } from "./errors.js";
import { isTaskFieldPath } from "./task-governance.js";

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const stable = (v: unknown): string => Array.isArray(v) ? `[${v.map(stable).join(",")}]` : object(v)
  ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}` : JSON.stringify(v);

/** Server-owned JSON snapshots only; replacing an array invalidates its entire input. */
export function taskFieldChanges(before: Record<string, unknown>, after: Record<string, unknown>): readonly TaskFieldChange[] {
  const changes: TaskFieldChange[] = [];
  function walk(a: Record<string, unknown>, b: Record<string, unknown>, parent: string): void {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const path = `${parent}/${pointer(key)}`;
      if (!isTaskFieldPath(path)) unavailable("Unsupported field path");
      const beforePresent = Object.hasOwn(a, key), afterPresent = Object.hasOwn(b, key);
      if (beforePresent && afterPresent && stable(a[key]) === stable(b[key])) continue;
      if (beforePresent && afterPresent && object(a[key]) && object(b[key])) walk(a[key], b[key], path);
      else changes.push({ path, beforePresent, afterPresent,
        ...(beforePresent ? { before: structuredClone(a[key]) } : {}),
        ...(afterPresent ? { after: structuredClone(b[key]) } : {}) });
    }
  }
  walk(before, after, ""); return changes;
}

/** Consumes outcomes from the existing exact-revision policy owner, never an expression engine. */
export function evaluateTaskEditOutcomes(input: {
  revision: TaskRuleRevision;
  evaluatedHash: string;
  evaluationMode: "first_match" | "accumulate" | "all";
  decision: PolicyDecision;
  changes: readonly TaskFieldChange[];
  /** Exact field paths owned outside the immutable approval payload. */
  metadataPaths: readonly string[];
}): TaskEditDecision {
  const { revision, decision, changes } = input;
  if (input.evaluationMode === "first_match" || input.evaluatedHash !== revision.hash ||
      !/^[a-f0-9]{64}$/.test(revision.hash) || !Number.isSafeInteger(revision.version) || revision.version < 1 ||
      decision.evaluatedPolicies.length !== 1 || decision.evaluatedPolicies[0]?.id !== revision.definitionId ||
      decision.evaluatedPolicies[0]?.versionNo !== revision.version) unavailable("Exact collect-mode edit policy required");
  const outcomes = decision.outcomes.map(outcome => {
    if (outcome.policyId !== revision.definitionId || outcome.policyVersionNo !== revision.version)
      unavailable("Outcome belongs to a different policy revision");
    const c = outcome.actionConfig;
    if (c.schema !== "athyper.task-edit-result/1" || !Array.isArray(c.paths) || !c.paths.length ||
        c.paths.some(p => !isTaskFieldPath(p)) || new Set(c.paths).size !== c.paths.length ||
        !["deny", "metadata_only", "full_reapproval"].includes(String(c.effect)) ||
        Object.keys(c).sort().join() !== "effect,paths,schema" ||
        outcome.action !== (c.effect === "deny" ? "deny" : "require_workflow")) unavailable("Unsafe edit result");
    return { ruleId: outcome.ruleId, result: c as unknown as TaskEditOutcome };
  });
  const metadata = new Set(input.metadataPaths), uncoveredPaths: string[] = [], matched = new Set<string>();
  let denied = false, material = false;
  for (const change of changes) {
    if (!isTaskFieldPath(change.path)) unavailable("Invalid changed field path");
    const applicable = outcomes.filter(o => o.result.paths.includes(change.path));
    applicable.forEach(o => matched.add(o.ruleId));
    if (!applicable.length) { uncoveredPaths.push(change.path); denied = true; }
    if (applicable.some(o => o.result.effect === "deny")) denied = true;
    if (!metadata.has(change.path) || applicable.some(o => o.result.effect === "full_reapproval")) material = true;
    // A metadata allow cannot authorize submitted business content, even with resubmission.
    if (!metadata.has(change.path) && applicable.every(o => o.result.effect !== "full_reapproval")) denied = true;
  }
  const effect = denied ? "denied" : !changes.length ? "unchanged" : material ? "full_reapproval" : "metadata_only";
  return { permitted: !denied, effect, requiresResubmission: effect === "full_reapproval",
    uncoveredPaths, matchedRuleIds: [...matched], revision };
}

function unavailable(message: string): never { throw new WorkflowError(409, "TASK_EDIT_POLICY_UNAVAILABLE", message); }
