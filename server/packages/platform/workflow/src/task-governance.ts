import type {
  GovernedTaskDefinition, TaskCaseAuthority, TaskGovernanceContract,
  TaskCandidateFilterEvidence, WorkflowStageDraft,
} from "@athyper/server-contract-workflow";
import { WorkflowError } from "./errors.js";

const code = /^[a-zA-Z][a-zA-Z0-9_.-]{0,126}$/;
export const isTaskFieldPath = (path: unknown): path is string =>
  typeof path === "string" && /^\/(?:[^~/]|~[01])+(?:\/(?:[^~/]|~[01])+)*$/.test(path)
  && !path.split("/").some(p => ["__proto__", "constructor", "prototype"].includes(p));

export function validateTaskCaseAuthority(value: unknown): asserts value is TaskCaseAuthority {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("Invalid task case authority");
  const a = value as Record<string, unknown>;
  if (a.schema !== "athyper.task-case-authority/1" ||
      typeof a.returnForChanges !== "boolean" || typeof a.rejectProposal !== "boolean" ||
      Object.keys(a).sort().join() !== "rejectProposal,returnForChanges,schema")
    invalid("Unknown or malformed task case authority");
}

/** Legacy means the property is absent, never null or an unrecognized schema. */
export function taskCaseActions(authority: TaskCaseAuthority | undefined): readonly ("return" | "reject")[] {
  if (authority === undefined) return ["return", "reject"];
  validateTaskCaseAuthority(authority);
  return [...(authority.returnForChanges ? ["return" as const] : []),
    ...(authority.rejectProposal ? ["reject" as const] : [])];
}

export function validateTaskGovernance(contract: TaskGovernanceContract): void {
  if (contract.schema !== "athyper.task-governance/1" || !Array.isArray(contract.tasks) || !contract.tasks.length)
    invalid("A supported task governance contract and tasks are required");
  const tasks = new Map<string, GovernedTaskDefinition>();
  for (const task of contract.tasks) {
    validateTaskCaseAuthority(task.caseAuthority);
    if (!code.test(task.code) || tasks.has(task.code) || !["todo", "review", "approval"].includes(task.kind) ||
        typeof task.responsibility !== "string" || !task.responsibility.trim() ||
        typeof task.mandatory !== "boolean" || !code.test(task.completionOwner) ||
        !["task", "case_final_decision"].includes(task.outcomeScope)) invalid("Invalid task responsibility or owner");
    if (task.kind !== "approval" && task.outcomeScope === "case_final_decision") invalid("Only approval tasks may finalize a case");
    if (task.kind === "todo" && (task.caseAuthority.returnForChanges || task.caseAuthority.rejectProposal))
      invalid("To-do ownership grants no case decision authority");
    if (!Array.isArray(task.inputPaths) || task.inputPaths.some((p: unknown) => !isTaskFieldPath(p)) ||
        new Set(task.inputPaths).size !== task.inputPaths.length || !Array.isArray(task.predecessors) ||
        new Set(task.predecessors).size !== task.predecessors.length) invalid("Invalid task inputs or dependencies");
    tasks.set(task.code, task);
  }
  const finals = contract.tasks.filter(t => t.outcomeScope === "case_final_decision");
  if (finals.length !== 1 || !finals[0]!.mandatory) invalid("Exactly one mandatory final decision is required");
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(name: string): void {
    if (visiting.has(name)) invalid("Task dependency cycle");
    if (visited.has(name)) return;
    const task = tasks.get(name);
    if (!task) invalid("Unknown task dependency");
    visiting.add(name);
    task.predecessors.forEach(visit);
    visiting.delete(name); visited.add(name);
  }
  contract.tasks.forEach(t => visit(t.code));
  const ancestors = new Set<string>();
  function collect(name: string): void {
    if (ancestors.has(name)) return;
    ancestors.add(name); tasks.get(name)!.predecessors.forEach(collect);
  }
  collect(finals[0]!.code);
  if (contract.tasks.some(t => t.mandatory && !ancestors.has(t.code)))
    invalid("Final decision must depend on every mandatory task");
}

export function requiredTaskVotes(quorum: WorkflowStageDraft["quorum"], count: number): number {
  if (!Number.isSafeInteger(count) || count < 1) unsatisfiable();
  let required: number;
  switch (quorum.kind) {
    case "all": required = count; break;
    case "any": required = 1; break;
    case "count": required = quorum.value ?? NaN; break;
    case "percentage":
      if (!Number.isFinite(quorum.value) || quorum.value! <= 0 || quorum.value! > 100) unsatisfiable();
      required = Math.ceil(count * quorum.value! / 100); break;
    default: return unsatisfiable();
  }
  if (!Number.isSafeInteger(required) || required < 1 || required > count) unsatisfiable();
  return required;
}

/** Caller resolves current scoped identity/permissions; this reducer cannot grant eligibility. */
export function filterTaskCandidates(input: {
  responsibility: string;
  candidates: readonly { principalId: string; eligible: boolean }[];
  makerIds: readonly string[];
  independentFrom?: readonly string[];
  quorum: WorkflowStageDraft["quorum"];
}): TaskCandidateFilterEvidence {
  const makers = new Set(input.makerIds), conflicts = new Set(input.independentFrom ?? []);
  const eligible = new Set<string>(), excluded: TaskCandidateFilterEvidence["excluded"][number][] = [];
  // A conflicting eligibility observation cannot be overridden by a duplicate allow.
  const ineligible = new Set(input.candidates.filter(c => !c.eligible).map(c => c.principalId));
  for (const candidate of input.candidates) {
    const id = candidate.principalId;
    const reason = !id || ineligible.has(id) ? "ineligible" : makers.has(id) ? "maker" :
      conflicts.has(id) ? "independence_conflict" : eligible.has(id) ? "duplicate" : undefined;
    if (reason) excluded.push({ principalId: id, reason }); else eligible.add(id);
  }
  return { responsibility: input.responsibility, excluded, eligiblePrincipalIds: [...eligible],
    requiredVotes: requiredTaskVotes(input.quorum, eligible.size) };
}

function invalid(message: string): never { throw new WorkflowError(400, "TASK_GOVERNANCE_INVALID", message); }
function unsatisfiable(): never { throw new WorkflowError(409, "TASK_QUORUM_UNSATISFIABLE", "No eligible quorum for task"); }
