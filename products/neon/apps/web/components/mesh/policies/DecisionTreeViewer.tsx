"use client";

/**
 * DecisionTreeViewer — Interactive visualization of policy simulation
 * explain trees. Shows the full decision path: Input Resolution →
 * Subject Resolution → Policy Evaluation → Conflict Resolution → Final Decision.
 */

import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  User,
  FileText,
  Zap,
  AlertTriangle,
} from "lucide-react";
import { useState } from "react";

import { EFFECT_BADGE } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

// ============================================================================
// Types (mirrors SimulatorExplainTree from runtime)
// ============================================================================

interface ConditionEvalResult {
  field: string;
  operator: string;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
}

interface RuleEvalResult {
  ruleId: string;
  policyId: string;
  policyName: string;
  effect: "allow" | "deny";
  priority: number;
  matched: boolean;
  nonMatchReason?: string;
  conditionResults?: ConditionEvalResult[];
  isDecidingRule: boolean;
}

interface PolicyEvalResult {
  policyId: string;
  versionId: string;
  policyName: string;
  scopeType: string;
  rules: RuleEvalResult[];
  totalRules: number;
  matchedRules: number;
}

interface ExplainTree {
  resolvedInput: {
    subject: Record<string, unknown>;
    resource: Record<string, unknown>;
    action: Record<string, unknown>;
  };
  subjectResolution: {
    method: string;
    subjectKeys: Array<{ type: string; key: string }>;
    resolutionTimeMs: number;
  };
  resourceResolution: {
    method: string;
    scopeKey: string;
    resolutionTimeMs: number;
  };
  policies: PolicyEvalResult[];
  conflictResolution: {
    strategy: string;
    rulesConsidered: number;
    winningRule?: {
      ruleId: string;
      policyId: string;
      effect: "allow" | "deny";
      priority: number;
    };
  };
  performance: {
    totalTimeMs: number;
    subjectResolutionMs: number;
    resourceResolutionMs: number;
    policyEvaluationMs: number;
    effectResolutionMs: number;
  };
}

interface SimulatorResult {
  success: boolean;
  decision: {
    effect: "allow" | "deny";
    allowed: boolean;
  };
  explain: ExplainTree;
  warnings: string[];
}

// ============================================================================
// Props
// ============================================================================

interface DecisionTreeViewerProps {
  result: SimulatorResult;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function DecisionTreeViewer({ result, className = "" }: DecisionTreeViewerProps) {
  const { explain, decision } = result;

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Final Decision Banner */}
      <div
        className={cn(
          "flex items-center gap-3 rounded-lg border-2 p-4",
          decision.allowed
            ? "border-success bg-success/10"
            : "border-destructive bg-destructive/10"
        )}
      >
        {decision.allowed ? (
          <CheckCircle2 className="h-6 w-6 text-success" />
        ) : (
          <XCircle className="h-6 w-6 text-destructive" />
        )}
        <div>
          <div className="font-semibold text-lg">
            Decision: {decision.effect.toUpperCase()}
          </div>
          <div className="text-sm text-muted-foreground">
            Total time: {explain.performance.totalTimeMs.toFixed(1)}ms
          </div>
        </div>
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-warning bg-warning/10 p-3">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
          <div className="text-sm">
            {result.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Input Resolution */}
      <TreeNode
        icon={<FileText className="h-4 w-4" />}
        label="Input Resolution"
        defaultOpen={false}
      >
        <div className="space-y-2 text-sm">
          <JsonBlock label="Subject" data={explain.resolvedInput.subject} />
          <JsonBlock label="Resource" data={explain.resolvedInput.resource} />
          <JsonBlock label="Action" data={explain.resolvedInput.action} />
        </div>
      </TreeNode>

      {/* 2. Subject Resolution */}
      <TreeNode
        icon={<User className="h-4 w-4" />}
        label="Subject Resolution"
        badge={`${explain.subjectResolution.resolutionTimeMs.toFixed(1)}ms`}
        defaultOpen={false}
      >
        <div className="space-y-1 text-sm">
          <div>
            Method: <span className="font-mono">{explain.subjectResolution.method}</span>
          </div>
          <div>Subject Keys:</div>
          <div className="ml-4 space-y-1">
            {explain.subjectResolution.subjectKeys.map((sk, i) => (
              <div key={i} className="font-mono text-xs">
                {sk.type}: {sk.key}
              </div>
            ))}
          </div>
        </div>
      </TreeNode>

      {/* 3. Policy Evaluation */}
      <TreeNode
        icon={<Shield className="h-4 w-4" />}
        label="Policy Evaluation"
        badge={`${explain.policies.length} policies, ${explain.performance.policyEvaluationMs.toFixed(1)}ms`}
        defaultOpen={true}
      >
        <div className="space-y-2">
          {explain.policies.map((policy) => (
            <PolicyNode key={policy.policyId} policy={policy} />
          ))}
        </div>
      </TreeNode>

      {/* 4. Conflict Resolution */}
      <TreeNode
        icon={<Zap className="h-4 w-4" />}
        label="Conflict Resolution"
        badge={`${explain.conflictResolution.strategy}`}
        defaultOpen={false}
      >
        <div className="space-y-1 text-sm">
          <div>Strategy: {explain.conflictResolution.strategy}</div>
          <div>Rules considered: {explain.conflictResolution.rulesConsidered}</div>
          {explain.conflictResolution.winningRule && (
            <div className="mt-2 rounded border p-2">
              <div className="font-semibold">Winning Rule</div>
              <div className="font-mono text-xs">
                Rule: {explain.conflictResolution.winningRule.ruleId}
              </div>
              <div className="font-mono text-xs">
                Effect:{" "}
                <EffectBadge effect={explain.conflictResolution.winningRule.effect} />
              </div>
              <div className="font-mono text-xs">
                Priority: {explain.conflictResolution.winningRule.priority}
              </div>
            </div>
          )}
        </div>
      </TreeNode>

      {/* 5. Performance */}
      <TreeNode
        icon={<Clock className="h-4 w-4" />}
        label="Performance"
        badge={`${explain.performance.totalTimeMs.toFixed(1)}ms total`}
        defaultOpen={false}
      >
        <div className="space-y-1 text-sm font-mono">
          <PerformanceBar
            label="Subject Resolution"
            ms={explain.performance.subjectResolutionMs}
            totalMs={explain.performance.totalTimeMs}
          />
          <PerformanceBar
            label="Resource Resolution"
            ms={explain.performance.resourceResolutionMs}
            totalMs={explain.performance.totalTimeMs}
          />
          <PerformanceBar
            label="Policy Evaluation"
            ms={explain.performance.policyEvaluationMs}
            totalMs={explain.performance.totalTimeMs}
          />
          <PerformanceBar
            label="Effect Resolution"
            ms={explain.performance.effectResolutionMs}
            totalMs={explain.performance.totalTimeMs}
          />
        </div>
      </TreeNode>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function TreeNode({
  icon,
  label,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border">
      <button
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        {icon}
        <span className="font-medium">{label}</span>
        {badge && (
          <span className="ml-auto text-xs text-muted-foreground">{badge}</span>
        )}
      </button>
      {open && <div className="border-t px-4 py-3">{children}</div>}
    </div>
  );
}

function PolicyNode({ policy }: { policy: PolicyEvalResult }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border">
      <button
        className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <span className="font-medium">{policy.policyName}</span>
        <span className="text-xs text-muted-foreground">
          ({policy.matchedRules}/{policy.totalRules} rules matched)
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          scope: {policy.scopeType}
        </span>
      </button>
      {open && (
        <div className="border-t px-3 py-2 space-y-1">
          {policy.rules.map((rule) => (
            <RuleNode key={rule.ruleId} rule={rule} />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleNode({ rule }: { rule: RuleEvalResult }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded border text-xs",
        rule.isDecidingRule && "border-info bg-info/10"
      )}
    >
      <button
        className="flex w-full items-center gap-2 p-2 text-left hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {rule.matched ? (
          <CheckCircle2 className="h-3 w-3 text-success" />
        ) : (
          <XCircle className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="font-mono">{rule.ruleId.substring(0, 8)}...</span>
        <EffectBadge effect={rule.effect} />
        <span className="text-muted-foreground">P{rule.priority}</span>
        {rule.isDecidingRule && (
          <span className="ml-1 rounded bg-info/20 px-1 text-info">
            deciding
          </span>
        )}
        {!rule.matched && rule.nonMatchReason && (
          <span className="ml-auto text-muted-foreground">{rule.nonMatchReason}</span>
        )}
      </button>
      {open && rule.conditionResults && rule.conditionResults.length > 0 && (
        <div className="border-t px-3 py-2 space-y-1">
          {rule.conditionResults.map((cond, i) => (
            <div key={i} className="flex items-center gap-2 font-mono">
              {cond.passed ? (
                <CheckCircle2 className="h-3 w-3 text-success" />
              ) : (
                <XCircle className="h-3 w-3 text-destructive" />
              )}
              <span>{cond.field}</span>
              <span className="text-muted-foreground">{cond.operator}</span>
              <span>{String(cond.expectedValue)}</span>
              <span className="text-muted-foreground">
                (actual: {String(cond.actualValue)})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EffectBadge({ effect }: { effect: "allow" | "deny" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded border px-1.5 py-0.5 text-xs font-medium",
        effect === "allow"
          ? "bg-success/10 " + EFFECT_BADGE.allow
          : "bg-destructive/10 " + EFFECT_BADGE.deny
      )}
    >
      {effect}
    </span>
  );
}

function PerformanceBar({
  label,
  ms,
  totalMs,
}: {
  label: string;
  ms: number;
  totalMs: number;
}) {
  const pct = totalMs > 0 ? (ms / totalMs) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-40 truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-info"
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
      <span className="w-16 text-right">{ms.toFixed(1)}ms</span>
    </div>
  );
}

function JsonBlock({ label, data }: { label: string; data: unknown }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open && (
        <pre className="ml-4 mt-1 rounded bg-muted p-2 text-xs overflow-x-auto">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default DecisionTreeViewer;
