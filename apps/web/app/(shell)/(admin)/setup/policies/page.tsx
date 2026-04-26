"use client";

/**
 * Policy Administration — /setup/policies
 *
 * Two tabs:
 *   Policies  — PolicyGrid: list + rules decision table, create/edit definitions and rules
 *   Evaluator — PolicyEvaluator: ad-hoc evaluation test panel
 *
 * Calls /api/policy/* BFF routes directly (no shared query client needed).
 * Tab can be pre-selected via ?tab=evaluator.
 */

import { useState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  AlertTriangle, ArrowUpCircle, ShieldCheck, Loader2, Play, FlaskConical,
  History, TestTube2, Trash2, RotateCcw, GitCompare,
  Download, Upload, FileJson,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
import { EmptyState } from "@athyper/ui/composites";
import { FilterPillBar } from "@athyper/ui/composites";
import {
  Button, Badge, Card, CardContent, CardHeader, CardTitle,
  Input, Textarea, Label, Skeleton, Separator, Select, SelectTrigger,
  SelectValue, SelectContent, SelectItem, Tabs, TabsList, TabsTrigger, TabsContent,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@athyper/ui/primitives";

// ── Local types ───────────────────────────────────────────────────────────────

interface PolicyDef {
  id:              string;
  entity_type:     string;
  name:            string;
  description?:    string | null;
  priority:        number;
  evaluation_mode: "first_match" | "accumulate" | "all";
  effective_from:  string;
  effective_until?: string | null;
  version_no:      number;
  status:          "active" | "inactive" | "deprecated";
  created_at:      string;
}

interface PolicyRule {
  id:           string;
  policy_id:    string;
  priority:     number;
  conditions?:  unknown;
  action:       "allow" | "deny" | "warn" | "require_workflow" | "escalate";
  score?:       number | null;
  confidence?:  number | null;
  explanation?: string | null;
  created_at:   string;
}

interface EvalOutcome {
  rule_id:     string;
  action:      string;
  matched:     boolean;
  score?:      number;
  confidence?: number;
}

interface EvalResult {
  action:      string;
  permitted:   boolean;
  outcomes:    EvalOutcome[];
  winning?:    { rule_id: string; action: string; score?: number; explanation?: string };
  evaluationMs: number;
}

interface RuleVersion {
  id:             string;
  policyRuleId:   string;
  versionNo:      number;
  ruleSnapshot:   Record<string, unknown>;
  effectiveFrom:  string;
  effectiveUntil: string | null;
  publishedBy:    string | null;
  publishedAt:    string;
}

interface TestCase {
  id:                 string;
  policyDefinitionId: string;
  testName:           string;
  description:        string | null;
  inputPayload:       Record<string, unknown>;
  expectedOutcome:    Record<string, unknown>;
  lastRunAt:          string | null;
  lastRunPassed:      boolean | null;
  lastRunResult:      Record<string, unknown> | null;
  lastRunMs:          number | null;
}

interface BatchRunResult {
  total:   number;
  passed:  number;
  failed:  number;
  results: Array<{ tcId: string; testName: string; passed: boolean; durationMs: number }>;
}

// ── Action badge colours ──────────────────────────────────────────────────────

const ACTION_VARIANT: Record<string, "destructive" | "warning" | "success" | "muted" | "outline"> = {
  deny:             "destructive",
  warn:             "warning",
  require_workflow: "warning",
  escalate:         "warning",
  allow:            "success",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  allow:            <CheckCircle2 className="h-3 w-3" />,
  deny:             <XCircle className="h-3 w-3" />,
  warn:             <AlertTriangle className="h-3 w-3" />,
  require_workflow: <ArrowUpCircle className="h-3 w-3" />,
  escalate:         <ArrowUpCircle className="h-3 w-3" />,
};

function ActionBadge({ action }: { action: string }) {
  return (
    <Badge variant={ACTION_VARIANT[action] ?? "muted"} className="inline-flex items-center gap-1 text-[10px]">
      {ACTION_ICON[action]}
      {action}
    </Badge>
  );
}

// ── Rules table (expanded inside a PolicyCard) ────────────────────────────────

function conditionsSummary(conditions: unknown): string {
  if (!conditions) return "—";
  const s = JSON.stringify(conditions);
  return s.length > 60 ? s.slice(0, 57) + "…" : s;
}

interface AddRuleFormProps {
  policyId: string;
  onDone: () => void;
}

function AddRuleForm({ policyId, onDone }: AddRuleFormProps) {
  const qc = useQueryClient();
  const [priority, setPriority] = useState("10");
  const [action, setAction]     = useState<PolicyRule["action"]>("allow");
  const [conditions, setConditions] = useState("");
  const [score, setScore]       = useState("");
  const [confidence, setConfidence] = useState("");
  const [explanation, setExplanation] = useState("");
  const [error, setError]       = useState<string | null>(null);

  const addRule = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/policy/definitions/${policyId}/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policy-rules", policyId] });
      onDone();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    let parsedConditions: unknown = undefined;
    if (conditions.trim()) {
      try { parsedConditions = JSON.parse(conditions); }
      catch { setError("Conditions must be valid JSON"); return; }
    }
    addRule.mutate({
      priority:   parseInt(priority, 10) || 10,
      action,
      conditions: parsedConditions,
      score:      score ? parseFloat(score) : undefined,
      confidence: confidence ? parseFloat(confidence) : undefined,
      explanation: explanation || undefined,
    });
  }

  return (
    <div className="mt-3 rounded-md border border-dashed p-3 space-y-3 bg-muted/20">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Add Rule</p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Input value={priority} onChange={(e) => setPriority(e.target.value)} className="h-7 text-xs" type="number" min={1} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Action</Label>
          <Select value={action} onValueChange={(v) => setAction(v as PolicyRule["action"])}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["allow","deny","warn","require_workflow","escalate"] as const).map((a) => (
                <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Score (0–1)</Label>
          <Input value={score} onChange={(e) => setScore(e.target.value)} className="h-7 text-xs" type="number" min={0} max={1} step={0.01} placeholder="optional" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Confidence (0–1)</Label>
          <Input value={confidence} onChange={(e) => setConfidence(e.target.value)} className="h-7 text-xs" type="number" min={0} max={1} step={0.01} placeholder="optional" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Conditions (JSONLogic — leave empty to match all)</Label>
        <Textarea
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          rows={2}
          className="font-mono text-xs"
          placeholder='{">=": [{"var": "amount"}, 10000]}'
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Explanation (optional)</Label>
        <Input value={explanation} onChange={(e) => setExplanation(e.target.value)} className="h-7 text-xs" placeholder="Shown in evaluation log" />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={submit} loading={addRule.isPending}>
          Save Rule
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface RulesTableProps { policyId: string }

function RulesTable({ policyId }: RulesTableProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const { data, isLoading } = useQuery<{ items: PolicyRule[] }>({
    queryKey: ["policy-rules", policyId],
    queryFn: async () => {
      const res = await fetch(`/api/policy/definitions/${policyId}/rules`);
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 30_000,
  });
  const rules = data?.items ?? [];

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="mt-3 space-y-2">
      {rules.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">No rules yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-left text-[10px] text-muted-foreground uppercase tracking-wider">
              <th className="pb-1.5 pr-3 font-medium">P#</th>
              <th className="pb-1.5 pr-3 font-medium">Action</th>
              <th className="pb-1.5 pr-3 font-medium">Score</th>
              <th className="pb-1.5 pr-3 font-medium">Confidence</th>
              <th className="pb-1.5 font-medium">Conditions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-2 pr-3 font-mono tabular-nums">{rule.priority}</td>
                <td className="py-2 pr-3"><ActionBadge action={rule.action} /></td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {rule.score != null ? rule.score.toFixed(2) : "—"}
                </td>
                <td className="py-2 pr-3 text-muted-foreground">
                  {rule.confidence != null ? rule.confidence.toFixed(2) : "—"}
                </td>
                <td className="py-2 font-mono text-[10px] text-muted-foreground">
                  {conditionsSummary(rule.conditions)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAddForm
        ? <AddRuleForm policyId={policyId} onDone={() => setShowAddForm(false)} />
        : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowAddForm(true)}>
            <Plus className="mr-1 h-3 w-3" />
            Add Rule
          </Button>
        )
      }
    </div>
  );
}

// ── Policy card (definition row) ──────────────────────────────────────────────

function statusVariant(s: PolicyDef["status"]): "success" | "muted" | "destructive" {
  return s === "active" ? "success" : s === "deprecated" ? "destructive" : "muted";
}

function evalModeLabel(m: PolicyDef["evaluation_mode"]) {
  return m === "first_match" ? "First Match" : m === "accumulate" ? "Accumulate" : "All";
}

// ── Rule Version History panel ────────────────────────────────────────────────

function RuleVersionHistory({ ruleId }: { ruleId: string }) {
  const { data, isLoading } = useQuery<{ items: RuleVersion[] }>({
    queryKey: ["rule-versions", ruleId],
    queryFn: async () => {
      const res = await fetch(`/api/policy/rules/${ruleId}/versions`);
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 60_000,
  });

  const versions = data?.items ?? [];

  if (isLoading) return <Skeleton className="h-16 w-full" />;
  if (versions.length === 0) return (
    <p className="py-4 text-center text-xs text-muted-foreground">No version history yet. History is recorded on first edit.</p>
  );

  return (
    <div className="space-y-1">
      {versions.map((v) => (
        <div key={v.id} className="rounded-md border p-3 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-mono">v{v.versionNo}</Badge>
              <ActionBadge action={v.ruleSnapshot["action"] as string} />
              {v.ruleSnapshot["score"] != null && (
                <span className="text-xs text-muted-foreground">score: {String(v.ruleSnapshot["score"])}</span>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              {v.effectiveUntil
                ? `${new Date(v.effectiveFrom).toLocaleDateString()} → ${new Date(v.effectiveUntil).toLocaleDateString()}`
                : `${new Date(v.effectiveFrom).toLocaleDateString()} → current`}
            </div>
          </div>
          {Boolean(v.ruleSnapshot["conditions"]) && (
            <p className="font-mono text-[10px] text-muted-foreground line-clamp-2">
              {JSON.stringify(v.ruleSnapshot["conditions"])}
            </p>
          )}
          {Boolean(v.ruleSnapshot["explanation"]) && (
            <p className="text-xs text-muted-foreground italic">{String(v.ruleSnapshot["explanation"])}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Test Cases panel ──────────────────────────────────────────────────────────

function TestCasesPanel({ policyId, entityType }: { policyId: string; entityType: string }) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd]       = useState(false);
  const [newName, setNewName]       = useState("");
  const [newInput, setNewInput]     = useState(`{\n  "amount": 1000\n}`);
  const [newExpected, setNewExpected] = useState(`{\n  "action": "allow"\n}`);
  const [addError, setAddError]     = useState<string | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [batchResult, setBatchResult] = useState<BatchRunResult | null>(null);

  const { data, isLoading } = useQuery<{ items: TestCase[] }>({
    queryKey: ["policy-test-cases", policyId],
    queryFn: async () => {
      const res = await fetch(`/api/policy/definitions/${policyId}/test-cases`);
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 30_000,
  });
  const testCases = data?.items ?? [];

  const addCase = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/policy/definitions/${policyId}/test-cases`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policy-test-cases", policyId] });
      setShowAdd(false); setNewName(""); setAddError(null);
    },
    onError: (e) => setAddError(e instanceof Error ? e.message : "Failed"),
  });

  const runCase = useMutation({
    mutationFn: async (tcId: string) => {
      const res = await fetch(`/api/policy/test-cases/${tcId}/run`, { method: "POST" });
      return res.ok ? res.json() : Promise.reject();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policy-test-cases", policyId] }),
  });

  const deleteCase = useMutation({
    mutationFn: async (tcId: string) => {
      await fetch(`/api/policy/test-cases/${tcId}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policy-test-cases", policyId] }),
  });

  async function runAll() {
    setRunningAll(true); setBatchResult(null);
    try {
      const res = await fetch(`/api/policy/definitions/${policyId}/test`, { method: "POST" });
      if (res.ok) {
        const result = await res.json() as BatchRunResult;
        setBatchResult(result);
        qc.invalidateQueries({ queryKey: ["policy-test-cases", policyId] });
      }
    } finally {
      setRunningAll(false);
    }
  }

  function submitAdd() {
    setAddError(null);
    if (!newName.trim()) { setAddError("Test name is required"); return; }
    let parsedInput: unknown, parsedExpected: unknown;
    try { parsedInput = JSON.parse(newInput); } catch { setAddError("Input payload must be valid JSON"); return; }
    try { parsedExpected = JSON.parse(newExpected); } catch { setAddError("Expected outcome must be valid JSON"); return; }
    addCase.mutate({ test_name: newName.trim(), input_payload: parsedInput, expected_outcome: parsedExpected });
  }

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  return (
    <div className="space-y-3">
      {/* Batch result banner */}
      {batchResult && (
        <div className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
          batchResult.failed === 0 ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/5 text-destructive"
        }`}>
          {batchResult.failed === 0
            ? <CheckCircle2 className="h-4 w-4 shrink-0" />
            : <XCircle className="h-4 w-4 shrink-0" />}
          <span>
            {batchResult.passed}/{batchResult.total} passed
            {batchResult.failed > 0 ? ` — ${batchResult.failed} failed` : ""}
          </span>
        </div>
      )}

      {/* Header actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={runAll} disabled={runningAll || testCases.length === 0}>
          {runningAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Play className="mr-1 h-3 w-3" />}
          Run All ({testCases.length})
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => setShowAdd(true)}>
          <Plus className="mr-1 h-3 w-3" />
          Add Case
        </Button>
      </div>

      {/* Test case rows */}
      {testCases.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          No test cases yet. Add cases to validate policy behaviour.
        </p>
      ) : (
        <div className="space-y-2">
          {testCases.map((tc) => (
            <div key={tc.id} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {tc.lastRunPassed === true && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
                  {tc.lastRunPassed === false && <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />}
                  {tc.lastRunPassed === null && <TestTube2 className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />}
                  <span className="text-sm font-medium">{tc.testName}</span>
                  {tc.lastRunMs !== null && (
                    <span className="text-[10px] text-muted-foreground">{tc.lastRunMs} ms</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Run"
                    onClick={() => runCase.mutate(tc.id)} disabled={runCase.isPending}>
                    <RotateCcw className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive" title="Delete"
                    onClick={() => deleteCase.mutate(tc.id)} disabled={deleteCase.isPending}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {tc.description && <p className="mt-1 text-xs text-muted-foreground">{tc.description}</p>}

              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Input</p>
                  <pre className="rounded bg-muted/50 p-1.5 text-[10px] font-mono overflow-auto max-h-20">
                    {JSON.stringify(tc.inputPayload, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">Expected</p>
                  <pre className="rounded bg-muted/50 p-1.5 text-[10px] font-mono overflow-auto max-h-20">
                    {JSON.stringify(tc.expectedOutcome, null, 2)}
                  </pre>
                </div>
              </div>

              {tc.lastRunResult && tc.lastRunPassed === false && (
                <div className="mt-2">
                  <p className="text-[10px] text-muted-foreground mb-1">Actual (last run)</p>
                  <pre className="rounded bg-destructive/5 border border-destructive/20 p-1.5 text-[10px] font-mono text-destructive overflow-auto max-h-20">
                    {JSON.stringify(tc.lastRunResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      {showAdd && (
        <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/20">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">New Test Case</p>
          <div className="space-y-1">
            <Label className="text-xs">Test Name *</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. High-value amount should require workflow" className="h-7 text-xs" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Input Payload (JSON) *</Label>
              <Textarea value={newInput} onChange={(e) => setNewInput(e.target.value)} rows={4} className="font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Expected Outcome (JSON) *</Label>
              <Textarea value={newExpected} onChange={(e) => setNewExpected(e.target.value)} rows={4} className="font-mono text-xs" />
            </div>
          </div>
          {addError && <p className="text-xs text-destructive">{addError}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={submitAdd} disabled={addCase.isPending}>Save</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAdd(false); setAddError(null); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Policy card (definition row) ──────────────────────────────────────────────

function PolicyCard({ def }: { def: PolicyDef }) {
  const [expanded, setExpanded] = useState(false);
  const [innerTab, setInnerTab] = useState<"rules" | "history" | "tests">("rules");
  const [exporting, setExporting] = useState(false);

  // Collect all rule IDs for the history sub-tab (loaded lazily)
  const { data: rulesData } = useQuery<{ items: PolicyRule[] }>({
    queryKey: ["policy-rules", def.id],
    queryFn: async () => {
      const res = await fetch(`/api/policy/definitions/${def.id}/rules`);
      return res.ok ? res.json() : { items: [] };
    },
    enabled: expanded && innerTab === "history",
    staleTime: 60_000,
  });

  async function handleExport(e: React.MouseEvent) {
    e.stopPropagation();
    setExporting(true);
    try {
      const res = await fetch(`/api/policy/definitions/${def.id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      const cd   = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? `policy_${def.entity_type}_export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user sees nothing if export fails; network tab will show the error
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div
          className="flex items-start gap-3 cursor-pointer"
          onClick={() => setExpanded((v) => !v)}
        >
          <button className="mt-1 shrink-0 text-muted-foreground hover:text-foreground">
            {expanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">{def.name}</span>
              <Badge variant={statusVariant(def.status)} className="text-[10px]">{def.status}</Badge>
              <Badge variant="outline" className="text-[10px]">{def.entity_type}</Badge>
              <Badge variant="muted" className="text-[10px]">{evalModeLabel(def.evaluation_mode)}</Badge>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              <span>Priority: {def.priority}</span>
              <span>v{def.version_no}</span>
              <span>From: {def.effective_from}</span>
              {def.effective_until && <span>Until: {def.effective_until}</span>}
              {def.description && <span className="truncate">{def.description}</span>}
            </div>
          </div>
          {/* Export button — stop click propagation so card doesn't toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleExport}
            disabled={exporting}
            title="Export policy as JSON bundle"
          >
            {exporting
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Download className="h-3.5 w-3.5" />}
          </Button>
        </div>

        {expanded && (
          <>
            <Separator className="my-3" />
            {/* Inner tabs: Rules | History | Test Cases */}
            <div className="flex items-center gap-0.5 mb-3 border-b pb-2">
              {(["rules", "history", "tests"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setInnerTab(t)}
                  className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs transition-colors ${
                    innerTab === t
                      ? "bg-muted text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "rules"   && <ShieldCheck className="h-3 w-3" />}
                  {t === "history" && <History className="h-3 w-3" />}
                  {t === "tests"   && <TestTube2 className="h-3 w-3" />}
                  {t === "rules" ? "Rules" : t === "history" ? "History" : "Test Cases"}
                </button>
              ))}
            </div>

            {innerTab === "rules" && <RulesTable policyId={def.id} />}

            {innerTab === "history" && (
              <div className="space-y-3">
                {(rulesData?.items ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No rules to show history for.</p>
                ) : (
                  (rulesData?.items ?? []).map((rule) => (
                    <div key={rule.id}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <GitCompare className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          Rule P{rule.priority} · <ActionBadge action={rule.action} />
                        </span>
                      </div>
                      <RuleVersionHistory ruleId={rule.id} />
                    </div>
                  ))
                )}
              </div>
            )}

            {innerTab === "tests" && (
              <TestCasesPanel policyId={def.id} entityType={def.entity_type} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── New Policy Dialog ─────────────────────────────────────────────────────────

interface NewPolicyDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

function NewPolicyDialog({ open, onOpenChange }: NewPolicyDialogProps) {
  const qc = useQueryClient();
  const [name, setName]           = useState("");
  const [entityType, setEntityType] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority]   = useState("100");
  const [evalMode, setEvalMode]   = useState<PolicyDef["evaluation_mode"]>("first_match");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError]         = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/policy/definitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["policy-definitions"] });
      onOpenChange(false);
      setName(""); setEntityType(""); setDescription(""); setPriority("100");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed"),
  });

  function submit() {
    setError(null);
    if (!name.trim() || !entityType.trim()) {
      setError("Name and Entity Type are required");
      return;
    }
    create.mutate({
      name: name.trim(),
      entity_type: entityType.trim().toLowerCase(),
      description: description.trim() || undefined,
      priority: parseInt(priority, 10) || 100,
      evaluation_mode: evalMode,
      effective_from: effectiveFrom,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Policy Definition</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs">Policy Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. JE High-Value Approval" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Entity Type *</Label>
            <Input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="e.g. journal_entry" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Priority</Label>
              <Input value={priority} onChange={(e) => setPriority(e.target.value)} type="number" min={1} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Evaluation Mode</Label>
              <Select value={evalMode} onValueChange={(v) => setEvalMode(v as PolicyDef["evaluation_mode"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_match">First Match</SelectItem>
                  <SelectItem value="accumulate">Accumulate</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Effective From</Label>
            <Input value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} type="date" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} loading={create.isPending}>Create Policy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── PolicyGrid tab ────────────────────────────────────────────────────────────

// ── Policy import dialog ──────────────────────────────────────────────────────

interface ImportResult {
  created:       boolean;
  overwritten:   boolean;
  definitionId:  string;
  rulesImported: number;
}

function PolicyImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open:         boolean;
  onOpenChange: (v: boolean) => void;
  onImported:   () => void;
}) {
  const [json,     setJson]     = useState("");
  const [error,    setError]    = useState<string | null>(null);
  const [result,   setResult]   = useState<ImportResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importMut = useMutation({
    mutationFn: async (bundle: Record<string, unknown>) => {
      const res = await fetch("/api/policy/definitions/import", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...bundle, overwrite }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as {
          error?: string; message?: string; conflict?: { name: string; entityType: string }
        };
        throw new Error(body.message ?? body.error ?? `HTTP ${res.status}`);
      }
      return res.json() as Promise<ImportResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      onImported();
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Import failed"),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setJson(ev.target?.result as string ?? "");
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleSubmit() {
    setError(null);
    setResult(null);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json) as Record<string, unknown>;
    } catch {
      setError("Invalid JSON — paste a valid policy bundle.");
      return;
    }
    importMut.mutate(parsed);
  }

  function handleClose() {
    setJson("");
    setError(null);
    setResult(null);
    setOverwrite(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-4 w-4" />
            Import Policy Bundle
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {result ? (
            <div className="rounded-lg border border-success/30 bg-success/10 p-4 space-y-1">
              <p className="text-sm font-medium text-success flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                {result.overwritten ? "Policy overwritten" : "Policy imported successfully"}
              </p>
              <p className="text-xs text-success/80">
                {result.rulesImported} rule{result.rulesImported !== 1 ? "s" : ""} imported.
                Definition ID: <code className="font-mono">{result.definitionId}</code>
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Paste JSON bundle or upload file</Label>
                <Textarea
                  className="font-mono text-xs h-48 resize-none"
                  placeholder='{"schema_version":"1.0","definition":{...},"rules":[...]}'
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleFile}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="h-3 w-3" />
                  Browse file…
                </Button>
                <span className="text-xs text-muted-foreground">or paste above</span>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="pol-overwrite"
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="pol-overwrite" className="text-xs cursor-pointer">
                  Overwrite existing policy if name + entity type conflict
                </Label>
              </div>

              {error && (
                <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={handleClose}>
            {result ? "Close" : "Cancel"}
          </Button>
          {!result && (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!json.trim() || importMut.isPending}
            >
              {importMut.isPending ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Importing…</>
              ) : (
                <><Upload className="mr-1.5 h-3.5 w-3.5" />Import</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PolicyGrid() {
  const qc = useQueryClient();
  const [entityFilter, setEntityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "deprecated">("");
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [importOpen, setImportOpen]     = useState(false);

  const params = new URLSearchParams();
  if (entityFilter) params.set("entity_type", entityFilter);
  if (statusFilter) params.set("is_active", statusFilter === "active" ? "true" : "false");

  const { data, isLoading } = useQuery<{ items: PolicyDef[] }>({
    queryKey: ["policy-definitions", entityFilter, statusFilter],
    queryFn: async () => {
      const qs = params.toString();
      const res = await fetch(`/api/policy/definitions${qs ? `?${qs}` : ""}`);
      return res.ok ? res.json() : { items: [] };
    },
    staleTime: 30_000,
  });

  const defs = data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          className="h-8 w-48 text-sm"
          placeholder="Filter by entity type…"
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
        />
        <FilterPillBar
          items={["active", "inactive", "deprecated"].map((s) => ({ value: s, label: s }))}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as "" | "active" | "inactive" | "deprecated")}
          allItem={{ label: "All" }}
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Import
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Policy
          </Button>
        </div>
      </div>

      <PolicyImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => {
          void qc.invalidateQueries({ queryKey: ["policy-definitions"] });
        }}
      />

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : defs.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-10 w-10 text-muted-foreground/30" />}
          title="No policy definitions found."
          action={
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Create your first policy
            </Button>
          }
          className="py-16"
        />
      ) : (
        <div className="space-y-3">
          {defs.map((def) => <PolicyCard key={def.id} def={def} />)}
        </div>
      )}

      <NewPolicyDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

// ── PolicyEvaluator tab ───────────────────────────────────────────────────────

function PolicyEvaluator() {
  const [entityType, setEntityType] = useState("journal_entry");
  const [payload, setPayload]       = useState("{\n  \"amount\": 50000\n}");
  const [companyCodeId, setCompanyCodeId] = useState("");
  const [legalEntityId, setLegalEntityId] = useState("");
  const [result, setResult]         = useState<EvalResult | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const evaluate = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch("/api/policy/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Evaluation failed");
      return res.json() as Promise<EvalResult>;
    },
    onSuccess: (data) => { setResult(data); setError(null); },
    onError: (e) => { setError(e instanceof Error ? e.message : "Evaluation failed"); setResult(null); },
  });

  function run() {
    setError(null);
    if (!entityType.trim()) { setError("Entity type is required"); return; }
    let parsedPayload: unknown;
    try { parsedPayload = JSON.parse(payload); }
    catch { setError("Payload must be valid JSON"); return; }

    evaluate.mutate({
      entity_type:    entityType.trim(),
      payload:        parsedPayload,
      company_code_id: companyCodeId || undefined,
      legal_entity_id: legalEntityId || undefined,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Input panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              Evaluation Input
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Entity Type *</Label>
              <Input
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                placeholder="e.g. journal_entry"
                className="font-mono text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payload (JSON) *</Label>
              <Textarea
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Company Code ID (optional)</Label>
                <Input
                  value={companyCodeId}
                  onChange={(e) => setCompanyCodeId(e.target.value)}
                  placeholder="UUID"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Legal Entity ID (optional)</Label>
                <Input
                  value={legalEntityId}
                  onChange={(e) => setLegalEntityId(e.target.value)}
                  placeholder="UUID"
                  className="font-mono text-xs"
                />
              </div>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" onClick={run} loading={evaluate.isPending}>
              <Play className="mr-2 h-3.5 w-3.5" />
              Run Evaluation
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Result panel */}
      <div className="space-y-4">
        {evaluate.isPending && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Evaluating…
          </div>
        )}

        {result && (
          <>
            {/* Summary */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">Decision</span>
                    <ActionBadge action={result.action} />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={result.permitted ? "success" : "destructive"} className="text-[10px]">
                      {result.permitted ? "Permitted" : "Blocked"}
                    </Badge>
                    <span>{result.evaluationMs.toFixed(1)} ms</span>
                  </div>
                </div>

                {result.winning && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Winning Rule</p>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {result.winning.rule_id.slice(0, 8)}…
                        </span>
                        <ActionBadge action={result.winning.action} />
                        {result.winning.score != null && (
                          <span className="text-muted-foreground">score: {result.winning.score}</span>
                        )}
                      </div>
                      {result.winning.explanation && (
                        <p className="mt-1 text-xs text-muted-foreground italic">
                          {result.winning.explanation}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Outcomes table */}
            {result.outcomes.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    All Rule Outcomes ({result.outcomes.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-[10px] text-left text-muted-foreground uppercase tracking-wider">
                        <th className="pb-1.5 pr-3 font-medium">Rule</th>
                        <th className="pb-1.5 pr-3 font-medium">Action</th>
                        <th className="pb-1.5 pr-3 font-medium">Matched</th>
                        <th className="pb-1.5 font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {result.outcomes.map((o) => (
                        <tr key={o.rule_id} className={o.matched ? "bg-muted/20" : ""}>
                          <td className="py-1.5 pr-3 font-mono text-[10px] text-muted-foreground">
                            {o.rule_id.slice(0, 8)}…
                          </td>
                          <td className="py-1.5 pr-3"><ActionBadge action={o.action} /></td>
                          <td className="py-1.5 pr-3">
                            {o.matched
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                              : <XCircle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                          </td>
                          <td className="py-1.5 text-muted-foreground">
                            {o.score != null ? o.score.toFixed(2) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!result && !evaluate.isPending && (
          <EmptyState
            icon={<FlaskConical className="h-10 w-10 text-muted-foreground/20" />}
            title="Run an evaluation to see the result."
            className="py-16"
          />
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PoliciesPage() {
  const searchParams = useSearchParams();
  const defaultTab = searchParams.get("tab") === "evaluator" ? "evaluator" : "policies";

  return (
    <PageFrame
      title="Policy Administration"
      description="Manage policy definitions, decision rules, and test evaluations"
    >
      <Tabs defaultValue={defaultTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="policies">
            <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
            Policies
          </TabsTrigger>
          <TabsTrigger value="evaluator">
            <FlaskConical className="mr-1.5 h-3.5 w-3.5" />
            Evaluator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="mt-4">
          <PolicyGrid />
        </TabsContent>

        <TabsContent value="evaluator" className="mt-4">
          <PolicyEvaluator />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
