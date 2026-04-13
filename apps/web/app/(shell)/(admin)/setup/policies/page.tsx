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

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, ChevronDown, ChevronRight, CheckCircle2, XCircle,
  AlertTriangle, ArrowUpCircle, ShieldCheck, Loader2, Play, FlaskConical,
} from "lucide-react";
import { PageFrame } from "@athyper/ui/layout";
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

function PolicyCard({ def }: { def: PolicyDef }) {
  const [expanded, setExpanded] = useState(false);

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
        </div>

        {expanded && (
          <>
            <Separator className="my-3" />
            <RulesTable policyId={def.id} />
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

function PolicyGrid() {
  const [entityFilter, setEntityFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive" | "deprecated">("");
  const [dialogOpen, setDialogOpen]     = useState(false);

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
        <div className="flex items-center gap-1">
          {(["", "active", "inactive", "deprecated"] as const).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={statusFilter === s ? "default" : "ghost"}
              className="h-8 text-xs"
              onClick={() => setStatusFilter(s)}
            >
              {s === "" ? "All" : s}
            </Button>
          ))}
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Policy
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : defs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <ShieldCheck className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No policy definitions found.</p>
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Create your first policy
          </Button>
        </div>
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
                              ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
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
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <FlaskConical className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              Run an evaluation to see the result.
            </p>
          </div>
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

        <TabsContent value="policies">
          <PolicyGrid />
        </TabsContent>

        <TabsContent value="evaluator">
          <PolicyEvaluator />
        </TabsContent>
      </Tabs>
    </PageFrame>
  );
}
