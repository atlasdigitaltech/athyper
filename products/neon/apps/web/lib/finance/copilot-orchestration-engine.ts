// lib/finance/copilot-orchestration-engine.ts
//
// Phase 15: Autonomous Close Orchestration Engine.
// Evaluates defect queue actions against automation rules and governance gates.
// Pure deterministic — no LLM, no side effects, no API calls.
//
// The engine scans the defect queue, matches actions against automation rules,
// evaluates governance gates (severity, threshold, rate limit, cooldown, schedule),
// and produces an OrchestrationPlan with verdicts for each action.

import type {
  OrchestrationPlan,
  OrchestrationAction,
  OrchestrationVerdict,
  OrchestrationGateResult,
  AutomationRuleStatus,
  AdvisorDefectQueueItemDTO,
  AdvisorCompletionForecastDTO,
  CloseExecutiveSummaryDTO,
} from "./types";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export interface OrchestrationInput {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  defectQueue?: AdvisorDefectQueueItemDTO[] | null;
  completionForecast?: AdvisorCompletionForecastDTO | null;
  executiveSummary?: CloseExecutiveSummaryDTO | null;
  /** Automation rules from DB (vw_automation_rule_status) */
  automationRules?: AutomationRuleStatus[] | null;
  /** Current UTC hour (0-23), defaults to new Date().getUTCHours() */
  currentHourUtc?: number;
}

// ---------------------------------------------------------------------------
// Default rules (used when no DB rules are configured)
// ---------------------------------------------------------------------------

const DEFAULT_RULE: AutomationRuleStatus = {
  actionType: "*",
  status: "DISABLED",
  maxAutoSeverity: "low",
  maxBreachProbability: 80,
  minBufferHours: 4,
  maxAutoAcceptsPerPeriod: 10,
  maxAutoActionsPerHour: 5,
  cooldownMinutes: 15,
  periodAutoExecuted: 0,
  actionsLastHour: 0,
  acceptsRemaining: 10,
  hourlyCapacityRemaining: 5,
};

// ---------------------------------------------------------------------------
// Severity ordering
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function severityAllowed(
  actionSeverity: string,
  maxAutoSeverity: string,
): boolean {
  const actionRank = SEVERITY_RANK[actionSeverity] ?? 0;
  const maxRank = SEVERITY_RANK[maxAutoSeverity] ?? 0;
  // Critical is NEVER auto-executed
  if (actionRank >= 4) return false;
  return actionRank <= maxRank;
}

// ---------------------------------------------------------------------------
// Safe action types (can be auto-executed with minimal risk)
// ---------------------------------------------------------------------------

const SAFE_ACTION_TYPES = new Set([
  "notify_owner",
  "notify_escalation",
  "refresh_snapshot",
  "reevaluate_signals",
  "publish_readiness",
]);

// ---------------------------------------------------------------------------
// Gate evaluators
// ---------------------------------------------------------------------------

function evaluateKillSwitch(
  rule: AutomationRuleStatus | undefined,
): OrchestrationGateResult {
  if (!rule || rule.status === "DISABLED") {
    return {
      gate: "kill_switch",
      passed: false,
      reason: rule
        ? "Automation is disabled for this entity/action_type"
        : "No automation rule configured",
    };
  }
  if (rule.status === "PAUSED") {
    return {
      gate: "kill_switch",
      passed: false,
      reason: `Automation paused${rule.pauseReason ? `: ${rule.pauseReason}` : ""}`,
    };
  }
  return { gate: "kill_switch", passed: true, reason: "Automation enabled" };
}

function evaluateSeverityGate(
  actionSeverity: string,
  rule: AutomationRuleStatus,
): OrchestrationGateResult {
  const passed = severityAllowed(actionSeverity, rule.maxAutoSeverity);
  return {
    gate: "severity",
    passed,
    reason: passed
      ? `Severity ${actionSeverity} within auto threshold (max: ${rule.maxAutoSeverity})`
      : actionSeverity === "critical"
        ? "Critical severity always requires human approval"
        : `Severity ${actionSeverity} exceeds auto threshold (max: ${rule.maxAutoSeverity})`,
    detail: {
      actionSeverity,
      maxAutoSeverity: rule.maxAutoSeverity,
    },
  };
}

function evaluateThresholdGate(
  breachPct: number,
  bufferHours: number,
  rule: AutomationRuleStatus,
): OrchestrationGateResult {
  const breachOk = breachPct <= rule.maxBreachProbability;
  const bufferOk = bufferHours >= rule.minBufferHours;
  const passed = breachOk && bufferOk;

  const reasons: string[] = [];
  if (!breachOk) {
    reasons.push(
      `Breach probability ${breachPct}% exceeds max ${rule.maxBreachProbability}%`,
    );
  }
  if (!bufferOk) {
    reasons.push(
      `Buffer ${bufferHours.toFixed(1)}h below min ${rule.minBufferHours}h`,
    );
  }

  return {
    gate: "threshold",
    passed,
    reason: passed
      ? `Risk thresholds OK (breach: ${breachPct}%, buffer: ${bufferHours.toFixed(1)}h)`
      : reasons.join("; "),
    detail: {
      breachPct,
      maxBreachProbability: rule.maxBreachProbability,
      bufferHours,
      minBufferHours: rule.minBufferHours,
    },
  };
}

function evaluateRateLimitGate(
  rule: AutomationRuleStatus,
): OrchestrationGateResult {
  const periodOk = rule.acceptsRemaining > 0;
  const hourlyOk = rule.hourlyCapacityRemaining > 0;
  const passed = periodOk && hourlyOk;

  return {
    gate: "rate_limit",
    passed,
    reason: passed
      ? `Rate limits OK (${rule.acceptsRemaining} period / ${rule.hourlyCapacityRemaining} hourly remaining)`
      : !periodOk
        ? `Period limit reached (${rule.periodAutoExecuted}/${rule.maxAutoAcceptsPerPeriod})`
        : `Hourly limit reached (${rule.actionsLastHour}/${rule.maxAutoActionsPerHour})`,
    detail: {
      periodAutoExecuted: rule.periodAutoExecuted,
      maxPerPeriod: rule.maxAutoAcceptsPerPeriod,
      actionsLastHour: rule.actionsLastHour,
      maxPerHour: rule.maxAutoActionsPerHour,
    },
  };
}

function evaluateCooldownGate(
  rule: AutomationRuleStatus,
): OrchestrationGateResult {
  if (!rule.lastAutoExecutedAt || rule.cooldownMinutes <= 0) {
    return { gate: "cooldown", passed: true, reason: "No cooldown active" };
  }

  const lastAt = new Date(rule.lastAutoExecutedAt).getTime();
  const now = Date.now();
  const elapsedMin = (now - lastAt) / 60000;
  const passed = elapsedMin >= rule.cooldownMinutes;

  return {
    gate: "cooldown",
    passed,
    reason: passed
      ? `Cooldown elapsed (${Math.round(elapsedMin)}m since last action)`
      : `Cooldown active — ${Math.round(rule.cooldownMinutes - elapsedMin)}m remaining`,
    detail: {
      lastAutoExecutedAt: rule.lastAutoExecutedAt,
      cooldownMinutes: rule.cooldownMinutes,
      elapsedMinutes: Math.round(elapsedMin),
    },
  };
}

function evaluateScheduleGate(
  currentHourUtc: number,
  rule: AutomationRuleStatus,
): OrchestrationGateResult {
  const start = (rule as any).activeHoursStart ?? 6;
  const end = (rule as any).activeHoursEnd ?? 22;
  const passed = currentHourUtc >= start && currentHourUtc < end;

  return {
    gate: "schedule",
    passed,
    reason: passed
      ? `Within active hours (${start}:00-${end}:00 UTC)`
      : `Outside active hours (${start}:00-${end}:00 UTC, current: ${currentHourUtc}:00)`,
    detail: { currentHourUtc, activeStart: start, activeEnd: end },
  };
}

// ---------------------------------------------------------------------------
// Core orchestration logic
// ---------------------------------------------------------------------------

function findRule(
  rules: AutomationRuleStatus[],
  actionType: string,
): AutomationRuleStatus | undefined {
  // Exact match first, then wildcard
  return (
    rules.find((r) => r.actionType === actionType) ??
    rules.find((r) => r.actionType === "*")
  );
}

function evaluateAction(
  defect: AdvisorDefectQueueItemDTO,
  rule: AutomationRuleStatus | undefined,
  breachPct: number,
  bufferHours: number,
  currentHourUtc: number,
): OrchestrationAction {
  const gates: OrchestrationGateResult[] = [];
  let verdict: OrchestrationVerdict;
  let blockingGate: string | undefined;

  // Gate 1: Kill switch
  const killSwitch = evaluateKillSwitch(rule);
  gates.push(killSwitch);
  if (!killSwitch.passed) {
    verdict = rule
      ? rule.status === "PAUSED"
        ? "BLOCKED_BY_KILL_SWITCH"
        : "BLOCKED_BY_KILL_SWITCH"
      : "SKIPPED_NO_RULE";
    blockingGate = "kill_switch";
    return buildAction(defect, verdict, gates, blockingGate);
  }

  // From here, rule is guaranteed to exist and be ENABLED
  const activeRule = rule!;

  // Gate 2: Schedule
  const schedule = evaluateScheduleGate(currentHourUtc, activeRule);
  gates.push(schedule);
  if (!schedule.passed) {
    return buildAction(defect, "BLOCKED_BY_SCHEDULE", gates, "schedule");
  }

  // Gate 3: Severity
  const severity = evaluateSeverityGate(defect.severity, activeRule);
  gates.push(severity);
  if (!severity.passed) {
    // Critical severity → requires approval, others → blocked
    verdict =
      defect.severity === "critical" ? "REQUIRES_APPROVAL" : "REQUIRES_APPROVAL";
    return buildAction(defect, verdict, gates, "severity");
  }

  // Gate 4: Risk thresholds
  const threshold = evaluateThresholdGate(breachPct, bufferHours, activeRule);
  gates.push(threshold);
  if (!threshold.passed) {
    return buildAction(
      defect,
      "BLOCKED_BY_THRESHOLD",
      gates,
      "threshold",
    );
  }

  // Gate 5: Rate limit
  const rateLimit = evaluateRateLimitGate(activeRule);
  gates.push(rateLimit);
  if (!rateLimit.passed) {
    return buildAction(
      defect,
      "BLOCKED_BY_RATE_LIMIT",
      gates,
      "rate_limit",
    );
  }

  // Gate 6: Cooldown
  const cooldown = evaluateCooldownGate(activeRule);
  gates.push(cooldown);
  if (!cooldown.passed) {
    return buildAction(
      defect,
      "BLOCKED_BY_COOLDOWN",
      gates,
      "cooldown",
    );
  }

  // All gates passed — auto-executable
  return buildAction(defect, "AUTO_EXECUTED", gates);
}

function buildAction(
  defect: AdvisorDefectQueueItemDTO,
  verdict: OrchestrationVerdict,
  gates: OrchestrationGateResult[],
  blockingGate?: string,
): OrchestrationAction {
  const isSafe = SAFE_ACTION_TYPES.has(defect.actionType);

  return {
    id: defect.actionId,
    actionType: defect.actionType,
    policyCode: defect.policyCode ?? "",
    policyName: defect.policyName,
    severity: defect.severity,
    verdict,
    title: `${verdictLabel(verdict)}: ${defect.policyName}`,
    rationale: `${defect.triggerType.replace(/_/g, " ")} — ${defect.severity} severity, pending ${defect.hoursPending.toFixed(1)}h${isSafe ? " (safe action)" : ""}`,
    sourceActionIds: [defect.actionId],
    gates,
    blockingGate,
    estimatedImpact: `Priority score: ${defect.queuePriorityScore}`,
  };
}

function verdictLabel(verdict: OrchestrationVerdict): string {
  switch (verdict) {
    case "AUTO_EXECUTED":
      return "Auto-execute";
    case "REQUIRES_APPROVAL":
      return "Needs approval";
    case "BLOCKED_BY_THRESHOLD":
      return "Blocked (risk)";
    case "BLOCKED_BY_RATE_LIMIT":
      return "Blocked (rate limit)";
    case "BLOCKED_BY_COOLDOWN":
      return "Blocked (cooldown)";
    case "BLOCKED_BY_SCHEDULE":
      return "Blocked (schedule)";
    case "BLOCKED_BY_KILL_SWITCH":
      return "Blocked (disabled)";
    case "ESCALATED":
      return "Escalated";
    case "SKIPPED_NO_RULE":
      return "No rule";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate the defect queue against automation rules and produce an orchestration plan.
 * Pure function — deterministic, no side effects.
 */
export function evaluateOrchestrationPlan(
  input: OrchestrationInput,
): OrchestrationPlan {
  const rules = input.automationRules ?? [];
  const defects = (input.defectQueue ?? []).filter(
    (d) => d.entityCode === input.entityCode && d.status === "SUGGESTED",
  );
  const currentHourUtc = input.currentHourUtc ?? new Date().getUTCHours();

  // Extract risk context
  const breachPct = input.completionForecast?.hardBreachPct ?? 50;
  const bufferHours = input.completionForecast?.hardBufferHours ?? 0;

  // Check if any rule is enabled for this entity
  const entityRules = rules.filter(
    (r) => r.status === "ENABLED" || r.status === "PAUSED",
  );
  const automationEnabled = entityRules.some((r) => r.status === "ENABLED");

  // Evaluate each defect
  const actions: OrchestrationAction[] = [];
  for (const defect of defects) {
    const rule = findRule(rules, defect.actionType);
    const action = evaluateAction(
      defect,
      rule,
      breachPct,
      bufferHours,
      currentHourUtc,
    );
    actions.push(action);
  }

  // Group by verdict
  const autoExecutable = actions.filter((a) => a.verdict === "AUTO_EXECUTED");
  const requiresApproval = actions.filter(
    (a) => a.verdict === "REQUIRES_APPROVAL",
  );
  const blocked = actions.filter(
    (a) =>
      a.verdict !== "AUTO_EXECUTED" &&
      a.verdict !== "REQUIRES_APPROVAL" &&
      a.verdict !== "SKIPPED_NO_RULE",
  );
  const skipped = actions.filter((a) => a.verdict === "SKIPPED_NO_RULE");

  // Build summary
  const summaryParts: string[] = [];

  if (!automationEnabled && entityRules.length === 0) {
    summaryParts.push(
      `No automation rules configured for ${input.entityCode}. All ${defects.length} actions require manual review.`,
    );
  } else if (!automationEnabled) {
    summaryParts.push(
      `Automation is paused/disabled for ${input.entityCode}. ${defects.length} actions require manual review.`,
    );
  } else {
    if (autoExecutable.length > 0) {
      summaryParts.push(
        `${autoExecutable.length} action${autoExecutable.length > 1 ? "s" : ""} eligible for auto-execution.`,
      );
    }
    if (requiresApproval.length > 0) {
      summaryParts.push(
        `${requiresApproval.length} action${requiresApproval.length > 1 ? "s" : ""} require${requiresApproval.length === 1 ? "s" : ""} approval.`,
      );
    }
    if (blocked.length > 0) {
      summaryParts.push(
        `${blocked.length} action${blocked.length > 1 ? "s" : ""} blocked by governance gates.`,
      );
    }
    if (skipped.length > 0) {
      summaryParts.push(
        `${skipped.length} action${skipped.length > 1 ? "s" : ""} have no automation rule.`,
      );
    }
  }

  summaryParts.push(
    `Current risk: ${breachPct}% breach probability, ${bufferHours.toFixed(1)}h buffer.`,
  );

  return {
    entityCode: input.entityCode,
    fiscalYear: input.fiscalYear,
    periodNumber: input.periodNumber,
    automationEnabled,
    rulesEvaluated: entityRules.length,
    autoExecutable,
    requiresApproval,
    blocked: [...blocked, ...skipped],
    totalScanned: defects.length,
    totalAutoEligible: autoExecutable.length,
    totalBlocked: blocked.length + skipped.length,
    totalRequiresApproval: requiresApproval.length,
    breachProbability: breachPct,
    bufferHours,
    summary: summaryParts.join(" "),
  };
}
