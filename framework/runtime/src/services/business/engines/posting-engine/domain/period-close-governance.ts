// framework/runtime/src/services/business/engines/posting-engine/domain/period-close-governance.ts
//
// Domain logic for the Period Close Governance layer.
// Pure functions — no I/O. Validates transitions, waiver eligibility,
// and task completion requirements.
//
// Status semantics (important for dashboards and escalation):
//
//   PENDING      — Task not yet started
//   IN_PROGRESS  — Work underway (manual attestation or system check running)
//   COMPLETED    — Task executed and passed; evidence captured
//   WAIVED       — Intentionally bypassed with governance controls
//                   (reason required, optional approval ref)
//   FAILED       — Task was EXECUTED/VALIDATED and did NOT pass.
//                   Examples: trial balance imbalanced, AR recon mismatch,
//                   depreciation batch found errors. Requires retry or
//                   investigation before the task can pass.
//   BLOCKED      — Task CANNOT BE ATTEMPTED because a prerequisite or
//                   upstream dependency is missing. The task was never
//                   executed. Examples: depreciation blocked until asset
//                   master updated, IC elimination blocked until all
//                   subsidiaries have closed their subledgers.
//
// The distinction matters: FAILED = "we tried, it didn't work" vs
// BLOCKED = "we can't even try yet". This drives different dashboard
// treatments and escalation paths.

import { validateTransition } from "../../shared/engine-base";

import {
  CHECKLIST_TASK_TRANSITIONS,
} from "./types";

import type {
  ChecklistTaskStatus,
  PeriodCloseTask,
  PeriodCloseChecklist,
  CloseGateResult,
  CloseGateTarget,
  CloseTaskAssignment,
  WaiverStatus,
  PeriodStatus,
  DependencySatisfactionMode,
  DependencySatisfactionResult,
} from "./types";

/**
 * Validate a checklist task status transition.
 */
export function isValidChecklistTransition(
  current: ChecklistTaskStatus,
  target: ChecklistTaskStatus,
): boolean {
  return validateTransition(current, target, CHECKLIST_TASK_TRANSITIONS);
}

/**
 * Can a task be waived?
 * Checks the task template's waiver governance rules.
 */
export function canWaiveTask(
  task: PeriodCloseTask,
  checklist: PeriodCloseChecklist,
  waiverReason: string | null,
  waiverApprovalRef: string | null,
): { allowed: boolean; reason: string | null } {
  if (!task.isWaivable) {
    return {
      allowed: false,
      reason: `Task ${task.taskCode} is not waivable`,
    };
  }

  if (checklist.taskStatus === "COMPLETED") {
    return {
      allowed: false,
      reason: "Cannot waive a completed task",
    };
  }

  if (task.waiverReasonRequired && !waiverReason) {
    return {
      allowed: false,
      reason: "Waiver reason is required for this task",
    };
  }

  if (task.waiverRequiresApproval && !waiverApprovalRef) {
    return {
      allowed: false,
      reason: "Waiver approval reference is required for this task",
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Can a task be marked as completed?
 * Validates the transition and ensures required fields are present.
 */
export function canCompleteTask(
  checklist: PeriodCloseChecklist,
  completedBy: string | null,
): { allowed: boolean; reason: string | null } {
  if (!isValidChecklistTransition(checklist.taskStatus, "COMPLETED")) {
    return {
      allowed: false,
      reason: `Cannot transition from ${checklist.taskStatus} to COMPLETED`,
    };
  }

  if (!completedBy) {
    return {
      allowed: false,
      reason: "completedBy is required to complete a task",
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Can a task be marked as FAILED?
 * FAILED = the task was executed/validated and did not pass.
 * Requires a failure reason for audit trail.
 */
export function canFailTask(
  checklist: PeriodCloseChecklist,
  failureReason: string | null,
): { allowed: boolean; reason: string | null } {
  if (!isValidChecklistTransition(checklist.taskStatus, "FAILED")) {
    return {
      allowed: false,
      reason: `Cannot transition from ${checklist.taskStatus} to FAILED`,
    };
  }

  if (!failureReason) {
    return {
      allowed: false,
      reason: "failureReason is required when marking a task as FAILED",
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Can a task be marked as BLOCKED?
 * BLOCKED = cannot proceed because a prerequisite or upstream dependency
 * is missing. The task was never attempted.
 */
export function canBlockTask(
  checklist: PeriodCloseChecklist,
): { allowed: boolean; reason: string | null } {
  if (!isValidChecklistTransition(checklist.taskStatus, "BLOCKED")) {
    return {
      allowed: false,
      reason: `Cannot transition from ${checklist.taskStatus} to BLOCKED`,
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Should a period transition be gated?
 * Returns true if the target status requires a gate check.
 */
export function isGatedTransition(
  target: PeriodStatus,
): target is CloseGateTarget {
  return target === "SOFT_CLOSE" || target === "HARD_CLOSE";
}

/**
 * Evaluate the gate result for a period transition.
 * If the gate has not passed, returns a descriptive error.
 */
export function evaluateGate(
  gateResult: CloseGateResult,
  targetStatus: CloseGateTarget,
): { allowed: boolean; reason: string | null } {
  if (gateResult.gatePassed) {
    return { allowed: true, reason: null };
  }

  return {
    allowed: false,
    reason: `Cannot transition to ${targetStatus}: ${gateResult.pendingCount} mandatory task(s) incomplete — [${gateResult.pendingTasks.join(", ")}]`,
  };
}

// ── Phase 3: Waiver Request Governance ───────────────────────────────────

/**
 * Can a waiver be requested for this task?
 * This is distinct from canWaiveTask — it validates the REQUEST,
 * not the actual WAIVE. Approval-required tasks go through
 * request → approve → waive flow.
 */
export function canRequestWaiver(
  task: PeriodCloseTask,
  checklist: PeriodCloseChecklist,
  waiverReason: string | null,
): { allowed: boolean; reason: string | null } {
  if (!task.isWaivable) {
    return { allowed: false, reason: `Task ${task.taskCode} is not waivable` };
  }

  if (checklist.taskStatus === "COMPLETED") {
    return { allowed: false, reason: "Cannot request waiver for a completed task" };
  }

  if (checklist.taskStatus === "WAIVED") {
    return { allowed: false, reason: "Task is already waived" };
  }

  if (checklist.waiverStatus === "pending_approval") {
    return { allowed: false, reason: "Waiver request already pending approval" };
  }

  if (task.waiverReasonRequired && !waiverReason) {
    return { allowed: false, reason: "Waiver reason is required for this task" };
  }

  return { allowed: true, reason: null };
}

/**
 * Does this task require approval for a waiver?
 */
export function requiresWaiverApproval(task: PeriodCloseTask): boolean {
  return task.isWaivable && task.waiverRequiresApproval;
}

/**
 * Determine the initial waiver status for a checklist item
 * based on the task template's governance configuration.
 */
export function deriveInitialWaiverStatus(task: PeriodCloseTask): WaiverStatus | null {
  if (!task.isWaivable) return null;
  return task.waiverRequiresApproval ? "not_requested" : "not_required";
}

// ── Phase 3: Assignment Validation ───────────────────────────────────────

/**
 * Validate a task assignment update.
 */
export function canAssignTask(
  checklist: PeriodCloseChecklist,
  assignment: CloseTaskAssignment,
): { allowed: boolean; reason: string | null } {
  if (checklist.taskStatus === "COMPLETED" || checklist.taskStatus === "WAIVED") {
    return {
      allowed: false,
      reason: `Cannot reassign a ${checklist.taskStatus} task`,
    };
  }

  const hasAssignee =
    assignment.assignedRole != null ||
    assignment.assignedUserId != null ||
    assignment.assignedGroupId != null;

  if (!hasAssignee) {
    return {
      allowed: false,
      reason: "At least one of assignedRole, assignedUserId, or assignedGroupId is required",
    };
  }

  return { allowed: true, reason: null };
}

/**
 * Compute SLA due_at from materialization time and task SLA hours.
 */
export function computeDueAt(
  materializedAt: Date,
  slaHours: number | null,
): Date | null {
  if (slaHours == null || slaHours <= 0) return null;
  return new Date(materializedAt.getTime() + slaHours * 60 * 60 * 1000);
}

/**
 * Is a checklist item overdue based on its due_at?
 */
export function isOverdue(checklist: PeriodCloseChecklist, now: Date = new Date()): boolean {
  if (!checklist.dueAt) return false;
  if (checklist.taskStatus === "COMPLETED" || checklist.taskStatus === "WAIVED") return false;
  return now > checklist.dueAt;
}

// ── Phase 5 Hardening: Centralized Satisfaction Semantics ────────────────

/**
 * Determine whether a predecessor's checklist state satisfies a dependency.
 *
 * This is the SINGLE source of truth for satisfaction semantics.
 * Both the runtime PeriodCloseGraphService and the BFF API route
 * MUST delegate to this function.
 *
 * Satisfaction rules:
 *   COMPLETED                                   → SATISFIED (always)
 *   WAIVED + mode=completed_only                → WAIVED_NOT_SUFFICIENT
 *   WAIVED + mode=satisfied + approved           → SATISFIED
 *   WAIVED + mode=satisfied + not_required       → SATISFIED
 *   WAIVED + mode=satisfied + pending_approval   → WAIVED_NOT_SUFFICIENT
 *   WAIVED + mode=satisfied + rejected           → WAIVED_NOT_SUFFICIENT
 *   WAIVED + mode=satisfied + not_requested      → WAIVED_NOT_SUFFICIENT
 *   WAIVED + mode=satisfied + null               → WAIVED_NOT_SUFFICIENT
 *   FAILED                                      → FAILED_BLOCKING
 *   BLOCKED / PENDING / IN_PROGRESS             → UNSATISFIED
 */
export function computeDependencySatisfaction(
  status: ChecklistTaskStatus | string,
  waiverStatus: WaiverStatus | string | null,
  satisfactionMode: DependencySatisfactionMode | string,
): DependencySatisfactionResult {
  if (status === "COMPLETED") return "SATISFIED";

  if (status === "WAIVED") {
    if (satisfactionMode === "completed_only") return "WAIVED_NOT_SUFFICIENT";
    // 'satisfied' mode: only approved or governance-exempt waivers count
    if (waiverStatus === "approved" || waiverStatus === "not_required") return "SATISFIED";
    // pending_approval, rejected, not_requested, null — all insufficient
    return "WAIVED_NOT_SUFFICIENT";
  }

  if (status === "FAILED") return "FAILED_BLOCKING";

  return "UNSATISFIED";
}

/**
 * Is a task required for a given close target?
 *
 * HARD_CLOSE requires ALL tasks (both SOFT_CLOSE and HARD_CLOSE gates)
 * because you cannot hard-close without first soft-closing.
 * SOFT_CLOSE requires only SOFT_CLOSE-gated tasks.
 */
export function isTaskRequiredForTarget(
  taskRequiredBefore: CloseGateTarget,
  targetStatus: CloseGateTarget,
): boolean {
  if (targetStatus === "HARD_CLOSE") return true; // both gates required
  return taskRequiredBefore === "SOFT_CLOSE";
}
